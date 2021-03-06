import * as pull from 'pull-stream'

import { MeshNode } from '../src'

const duplexOne = {
  source: pull(
    pull.values([1, 2]),
    pull.asyncMap((data, cb) => {
      setTimeout(() => cb(null, data), 2e3)
    })
  ),
  sink: pull.collect((_, results) => {
    console.log('received on One:', results)
  }),
}

const nodeA = new MeshNode('A')
const nodeB = new MeshNode((_, destURI) => {
  if (destURI === 'Two') {
    const stream = {
      source: pull.values(['A', 'B']),
      sink: pull.collect((_, results) => {
        console.log('received on Two:', results)
      }),
    }
    return {
      stream,
      portOpts: {
        readTimeout: 1e3,
      },
    }
  }
}, 'B')

const a2b = nodeA.createRelayStream('A->B')
const b2a = nodeB.createRelayStream('B->A')
pull(a2b, b2a, a2b)

const portNum = nodeA.createPortStream('One', 'Two', {
  readTimeout: 1e3,
})
pull(portNum, duplexOne, portNum)
