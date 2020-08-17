import * as pull from '@jacobbubu/pull-stream'
import { Model } from '@jacobbubu/scuttlebutt-pull'
import { MeshNode } from '../src'

const PortOpts = { continueInterval: 5e3, readTimeout: 10e3 }

const modelOne = new Model('One')
const modelTwo = new Model('Two')

modelOne.set('foo', 'bar')

const nodeA = new MeshNode('A')

const nodeB = new MeshNode((_, destURI) => {
  if (destURI === 'Two') {
    const s = modelTwo.createStream({ wrapper: 'raw' })
    s.on('synced', () => {
      console.log('foo@Two:', modelTwo.get('foo'))
    })
    return {
      stream: s,
      portOpts: PortOpts,
    }
  }
}, 'B')

const a2b = nodeA.createRelayStream('A->B')
const b2a = nodeB.createRelayStream('B->A')
pull(a2b, b2a, a2b)

const portOne = nodeA.createPortStream('One', 'Two', PortOpts)
const sOne = modelOne.createStream({ wrapper: 'raw' })

const portOne2 = nodeA.createPortStream('One', 'Two', PortOpts)
const sOne2 = modelOne.createStream({ wrapper: 'raw' })

sOne.on('synced', () => {
  console.log('bar@One:', modelTwo.get('bar'))
})

sOne2.on('synced', () => {
  console.log('bar@One2:', modelTwo.get('bar'))
})

pull(portOne, sOne, portOne)
pull(portOne2, sOne2, portOne2)

modelTwo.set('bar', 'foo')
