import * as pull from 'pull-stream'

import { MeshNode } from '../src'

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

const a2b = nodeA.createRelayStream('A->B')
const b2a = nodeB.createRelayStream('B->A')
pull(a2b, b2a, a2b)

const portNum = nodeA.createPortStream('One', 'Two')
pull(portNum, duplexOne, portNum)
