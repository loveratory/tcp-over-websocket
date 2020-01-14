
import ws = require('ws')
import net = require('net')
import { Duplex } from 'stream'

const connectWSS = () => new Promise<ws>((res, rej) => {
  const conn = new ws('ws://localhost:7777', {
    perMessageDeflate: false
  })
  conn.on('open', () => {
    res(conn)
  })
  conn.once('error', (e) => {
    rej(e)
  })
})
const server = net.createServer(async c => {
  const upstream = await connectWSS()
  console.log('connect/')
  upstream.on('error', (e) => {
    console.error(e)
    c.end()
  })
  upstream.on('close', () => {
    console.log('end..')
    c.end()
  })

  const upstreamDuplex: Duplex = (ws as any).createWebSocketStream(upstream)

  c.pipe(upstreamDuplex)
  upstreamDuplex.pipe(c)

  c.on('end', () => {
    console.log('client disconnected');
  });
})
server.listen('4444')
