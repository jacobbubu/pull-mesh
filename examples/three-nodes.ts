import * as pull from '@jacobbubu/pull-stream'

import { MeshNode } from '../src'

const duplexOne = {
  source: pull.values([1, 2]),
  sink: pull.collect((_, results) => {
    console.log('received on One:', results)
  }),
}

const nodeA = new MeshNode('A')
const nodeB = new MeshNode('B')
const nodeC = new MeshNode((_, destURI) => {
  if (destURI === 'clo.LW400B10WS1000X30.signalModel') {
    const duplexTwo = {
      source: pull.values(['a', 'b']),
      sink: pull.collect((_, results) => {
        console.log('received on Two:', results)
      }),
    }
    return {
      stream: duplexTwo,
    }
  }
}, 'C')

const a2b = nodeA.createRelayStream({
  vars: {
    '{v}': 'veh.LW400B10WS1000X30.',
    '{c}': 'clo.LW400B10WS1000X30.',
    '{sm}': 'signalModel',
  },
  name: 'A->B',
})
const b2a = nodeB.createRelayStream('B->A')
pull(a2b, b2a, a2b)

const b2c = nodeB.createRelayStream('B->C')
const c2b = nodeC.createRelayStream('C->B')
pull(b2c, c2b, b2c)

const a2c = nodeA.createRelayStream('A->C')
const c2a = nodeC.createRelayStream('C->A')
pull(a2c, c2a, a2c)

const portNum = nodeA.createPortStream(
  'veh.LW400B10WS1000X30.signalModel',
  'clo.LW400B10WS1000X30.signalModel'
)
pull(portNum, duplexOne, portNum)
