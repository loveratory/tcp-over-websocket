import WebSocket from 'ws'
import net from 'net'
import crypto from 'crypto'
import { Duplex } from 'stream'

const config = {
  upstream: {
    port: process.env.UPSTREAM_PORT ? Number.parseInt(process.env.UPSTREAM_PORT) : 5555,
    host: process.env.UPSTREAM_HOST || 'localhost',
  },
  port: 7777
}

const srv = new WebSocket.Server({ port: config.port })

srv.on('connection', (webSocket) => {
  const id = crypto.randomBytes(5).toString('hex')
  console.log('connected~ ' + id)
  onConnection(webSocket).catch(console.error).finally(() => console.log(`ciao! ${id}`))
})

const onConnection = (webSocket: WebSocket) => new Promise((res, rej) => {
  const state: { netSocket?: net.Socket } = {
    netSocket: undefined
  }
  const onError = (e: any) => {
    cleanup(state, false)
    rej(e)
  }

  const startup = (s: typeof state) => {
    s.netSocket = net.createConnection(config.upstream.port, config.upstream.host)
    s.netSocket.on('error', (e) => {
      onError(e)
    })
    s.netSocket.on('close', () => {
      cleanup(s)
    })

    const wsDuplex: Duplex = (WebSocket as any).createWebSocketStream(webSocket)
    wsDuplex.pipe(s.netSocket)
    s.netSocket.pipe(wsDuplex)
  }
  const cleanup = (s: typeof state, resolve = true) => {
    if (s.netSocket) s.netSocket.destroy()
    if (![webSocket.CLOSED, webSocket.CLOSING].includes(webSocket.readyState)) webSocket.close()
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
