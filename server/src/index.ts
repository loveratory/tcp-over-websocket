import WebSocket from 'ws'
import net from 'net'
import crypto from 'crypto'
import { Duplex } from 'stream'
import { URLSearchParams } from 'url'

const config = {
  upstream: {
    port: process.env.UPSTREAM_PORT ? Number.parseInt(process.env.UPSTREAM_PORT) : 5555,
    host: process.env.UPSTREAM_HOST || 'localhost',
  },
  port: 7777
}

const connectUpstream = () => net.createConnection(config.upstream.port, config.upstream.host)

const srv = new WebSocket.Server({ port: config.port })

srv.on('connection', (webSocket, request) => {
  const id = crypto.randomBytes(5).toString('hex')
  console.log('connected~ ' + id)
  const final = () => {
    console.log('ciao~ ' + id)
    if (![webSocket.CLOSED, webSocket.CLOSING].includes(webSocket.readyState)) webSocket.close()
  }
  onConnection(webSocket, request.url).then(() => {
    final()
  }).catch((e) => {
    final()
    console.error(e)
  })
})

type SocketSession = string
type SocketUsed = { [k: string]: number }
const socketUsed: {[k: string]: number} = new Proxy({} as SocketUsed, {
  get(t, p) {
    if (typeof p !== 'string') return 0
    return t[p] || 0
  }
})
const sockets: {[k: string]: net.Socket} = {}

const cleanupUnusedSocket = () => {
  const handlers = Object.entries(sockets).map(async ([socketSession, socket]) => {
    if (socketUsed[socketSession] === 0) {
      console.log(`close session: ${socketSession}`)
      socket.end()
      delete sockets[socketSession]
      delete socketUsed[socketSession]
    } else {
      console.log(`still alive: ${socketSession}`)
    }
  })
  return Promise.all(handlers).catch(console.error)
}
const useSessionSocket = (k: SocketSession, reconnectOnly = false) => {
  if (!sockets[k]) {
    if (reconnectOnly) {
      throw new Error('You can not re-connect by missing socket.')
    }
    sockets[k] = connectUpstream()
  }
  socketUsed[k]++
  return [
    sockets[k],
    () => {
      socketUsed[k]--
    }
  ] as const
}

const onConnection = (webSocket: WebSocket, url?: string) => new Promise((res, rej) => {
  const searchParams = (() => {
    if (!url) return
    return new URLSearchParams(url.split('/').pop())
  })()
  const session = searchParams && searchParams.get('session') || undefined
  const reconnect = searchParams ? searchParams.get('reconnect') === 'true' : false
  const [sessionSocket, cleanUpSessionSocket] = session ? useSessionSocket(session, reconnect) : []

  console.log(`session: ${session} [recon/${reconnect}]`)

  const state: { netSocket?: net.Socket } = {
    netSocket: undefined
  }
  const onError = (e: any) => {
    cleanup(state, false)
    rej(e)
  }

  const startup = (s: typeof state) => {
    s.netSocket = sessionSocket || connectUpstream()
    s.netSocket.on('error', (e) => {
      onError(e)
    })
    s.netSocket.on('close', () => {
      cleanup(s)
    })
    const wsDuplex: Duplex = (WebSocket as any).createWebSocketStream(webSocket)
    wsDuplex.pipe(s.netSocket)
    s.netSocket.pipe(wsDuplex)
    webSocket.on('ping', () => {
      console.log('unpipe duplex')
      s.netSocket!.unpipe(wsDuplex)
      wsDuplex.unpipe(s.netSocket)
    })
  }
  const cleanup = (s: typeof state, resolve = true) => {
    if (s.netSocket) {
      if (cleanUpSessionSocket) {
        console.log('Mark socket as unused.')
        cleanUpSessionSocket()
        cleanupUnusedSocket()
      } else {
        console.log('Closing socket.')
        s.netSocket.end()
      }
    }
    if (resolve) res()
  }

  startup(state)
  webSocket.on('close', () => {
    cleanup(state)
  })
  webSocket.on('error', e => {
    onError(e)
  })
})

console.log(`Listen on :${config.port}, connect to ${config.upstream.host}:${config.upstream.port}`)
