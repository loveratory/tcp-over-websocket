
import ws = require('ws')
import net = require('net')
import { Duplex } from 'stream'
import { URL } from 'url'
import crypto = require('crypto')

const generateSessionID = () => crypto.randomBytes(16).toString('hex')

const config = {
  server: {
    url: new URL(process.env.SERVER_URI || 'ws://localhost:7777'),
    reload: process.env.SERVER_RELOAD === 'true',
    reloadSec: process.env.SERVER_RELOAD_SEC ? Number.parseInt(process.env.SERVER_RELOAD_SEC) : 5,
  },
  port: 4444,
  host: '0.0.0.0',
}

const connectWSS = (session: string, reconnect: boolean) => new Promise<ws>((res, rej) => {
  const server = new URL(config.server.url.toString())
  server.search = `session=${session}&reconnect=${reconnect}`
  const conn = new ws(server, {
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
  const session = generateSessionID()
  let upstream = await connectWSS(session, false)

  const setUpstream = (upst: ws) => {
    let endable = true
    const end = () => {
      if (endable) c.end()
    }
    upst.on('error', (e) => {
      console.error(e)
      end()
    })
    upst.on('close', () => {
      console.log('end..')
      end()
    })
    const duplex: Duplex = (ws as any).createWebSocketStream(upstream)
    c.pipe(duplex)
    duplex.pipe(c)
    return () => {
      // reconnect のために end しないようにする
      endable = false
      duplex.unpipe(c)
      c.unpipe(duplex)
    }
  }

  let cleanup = setUpstream(upstream)
  console.log('connected~')

  if (config.server.reload) {
    console.log('Ignite reload configuration for ' + session + ' (' + config.server.reloadSec + ' sec)')
    const sid = setInterval(async () => {
      if ([ws.CLOSED, ws.CLOSING].includes(upstream.readyState)) {
        console.log('already closed.')
        clearInterval(sid)
        return
      }
      try {
        console.log('try to reconnect.')
        c.pause()
        setTimeout(async () => {
          console.log('pause...')
          const newup = await connectWSS(session, true)
          upstream.close()
          upstream = newup
          cleanup()
          cleanup = setUpstream(upstream)
          c.resume()
          console.log('reconnected~')
        }, 1000)
      } catch (e) {
        console.error(e)
        c.end()
      }
    }, config.server.reloadSec * 1000)
  }

  c.on('end', () => {
    console.log('Bye...');
  });
})
server.listen(config.port, config.host, () => {
  console.log(`listen on ${config.host}:${config.port} -> ${config.server.url}`)
})
