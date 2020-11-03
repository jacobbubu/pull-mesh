import * as pull from 'pull-stream'

import { MeshNode } from '../src'

function getDuplex(tag: string = '') {
  const duplexOne = {
    source: pull.values([1, 2, 3]),
    sink: pull.collect((_, results) => {
      console.log(`[${tag}] received on One:`, results)
    }),
  }
  return duplexOne
}

const nodeA = new MeshNode('A')
const nodeB = new MeshNode((_, destURI) => {
  if (destURI === 'Two') {
    const stream = {
      source: pull.values([9, 8, 7]),
      sink: pull.collect((_, results) => {
        console.log(`received on Two:`, results)
      }),
    }

    return {
      stream,
    }
  }
}, 'B')

const a2b = nodeA.createRelayStream('A->B')
const b2a = nodeB.createRelayStream('B->A')
pull(a2b, b2a, a2b)

const port1 = nodeA.createPortStream('One', 'Two')
pull(port1, getDuplex(port1.sourceURI + '/' + port1.portId), port1)

const port2 = nodeA.createPortStream('One', 'Two')
pull(port2, getDuplex(port2.sourceURI + '/' + port2.portId), port2)
