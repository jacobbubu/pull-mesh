import * as pull from 'pull-stream'

import { MeshNode } from '../src'

const readTimeout = 500
const duplexOne = {
  source: pull.values([1, 2, 3]),
  sink: pull.collect((_, results) => {
    console.log('received on One:', results)
  }),
}

const nodeA = new MeshNode('A')
const nodeB = new MeshNode((_, destURI) => {
  if (destURI === 'Two') {
    const stream = {
      source: pull.values(['a', 'b', 'c']),
      sink: pull.collect((_, results) => {
        console.log('received on Two:', results)
      }),
    }
    return {
      stream,
      portOpts: {
        readTimeout,
      },
    }
  }
}, 'B')

const a2b = nodeA.createRelayStream('A->B')
const b2a = nodeB.createRelayStream('B->A')
pull(a2b, b2a, a2b)

const port1 = nodeA.createPortStream('One', 'Two', { readTimeout })
pull(port1, duplexOne, port1)

port1.on('connect', () => {
  console.log('port 1 connect')
})
port1.on('close', () => {
  console.log('port 1 close')
})
