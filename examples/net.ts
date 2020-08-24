import * as net from 'net'
import * as pull from '@jacobbubu/pull-stream'
const toPull = require('stream-to-pull-stream')
import { wrap, MeshNode } from '../src'

const PORT = 9988

const duplexOne = {
  source: pull.values([1, 2]),
  sink: pull.collect((_, results) => {
    console.log('received on One:', results)
  }),
}

const nodeA = new MeshNode('A')
const nodeB = new MeshNode((_, destURI) => {
  if (destURI === 'Two') {
    const duplexTwo = {
      source: pull.values(),
      sink: pull.collect((_, results) => {
        console.log('received on Two:', results)
      }),
    }
    return {
      stream: duplexTwo,
    }
  }
}, 'B')

const server = net
  .createServer((socket) => {
    const client = toPull.duplex(socket) as pull.Duplex<Buffer, Buffer>
    const b2a = nodeB.createRelayStream('B->A')
    pull(client, wrap(b2a, { windowed: true }), client)
  })
  .listen(PORT)

const rawClient = net.createConnection({ port: PORT }, () => {
  const client = toPull.duplex(rawClient) as pull.Duplex<Buffer, Buffer>
  const a2b = nodeA.createRelayStream('A->B')

  pull(client, wrap(a2b, { windowed: true }), client)

  const portNum = nodeA.createPortStream('One', 'Two')
  pull(portNum, duplexOne, portNum)
})
