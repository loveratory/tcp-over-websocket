import WebSocket from 'ws'
import net from 'net'
import crypto from 'crypto'
import { Duplex } from 'stream'

const srv = new WebSocket.Server({ port: 7777 })

srv.on('connection', (webSocket) => {
  const id = crypto.randomBytes(5).toString('hex')
  console.log('connected~ ' + id)
  onConnection(webSocket).catch(console.error).finally(() => console.log(`ciao! ${id}`))
})

const onConnection = (webSocket: WebSocket) => new Promise((res, rej) => {
  console.log('on-conn')
  const state: { netSocket?: net.Socket } = {
    netSocket: undefined
  }
  const onError = (e: any) => {
    cleanup(state, false)
    rej(e)
  }

  const startup = (s: typeof state) => {
    s.netSocket = net.createConnection(5555, 'localhost')
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
