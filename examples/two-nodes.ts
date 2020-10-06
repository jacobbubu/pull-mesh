import * as pull from 'pull-stream'

import { MeshNode } from '../src'

const duplexOne = {
  source: pull.values([1]),
  sink: pull.collect((_, results) => {
    console.log('received on duplexOne:', results)
  }),
}

const duplexTwo = {
  source: pull.values([10]),
  sink: pull.collect((_, results) => {
    console.log('received on duplexTwo:', results)
  }),
}

const nodeA = new MeshNode('A')
let streamCount = 0
const nodeB = new MeshNode((_, destURI) => {
  if (destURI === 'Two') {
    const s = {
      source: pull.values(['a']),
      sink: pull.collect((_, results) => {
        console.log(`received ${s.tag}/Two:`, results)
      }),
      tag: streamCount++,
    }
    return {
      stream: s,
    }
  }
}, 'B')

const a2b = nodeA.createRelayStream('A->B')
const b2a = nodeB.createRelayStream('B->A')
pull(a2b, b2a, a2b)

const port1 = nodeA.createPortStream('One', 'Two')
pull(port1, duplexOne, port1)

const port2 = nodeA.createPortStream('One', 'Two')
pull(port2, duplexTwo, port2)
