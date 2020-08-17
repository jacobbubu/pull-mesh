import * as pull from '@jacobbubu/pull-stream'
import { Model } from '@jacobbubu/scuttlebutt-pull'
import { MeshNode } from '../src'

const PortOpts = { continueInterval: 500, readTimeout: 1e3 }

const modelOne = new Model('One')
const modelTwo = new Model('Two')

modelOne.set('foo', 'bar')

const nodeA = new MeshNode('A')

const nodeB = new MeshNode((_, destURI) => {
  if (destURI === 'Two') {
    const sTwo = modelTwo.createStream({ wrapper: 'raw' })
    sTwo.on('synced', () => {
      console.log('foo@Two:', modelTwo.get('foo'))
    })
    return {
      stream: sTwo,
      portOpts: PortOpts,
    }
  }
}, 'B')

const a2b = nodeA.createRelayStream('A->B')
const b2a = nodeB.createRelayStream('B->A')
pull(a2b, b2a, a2b)

const portOne = nodeA.createPortStream('One', 'Two', PortOpts)
const sOne = modelOne.createStream({ wrapper: 'raw' })
pull(portOne, sOne, portOne)

modelTwo.set('bar', 'foo')

sOne.on('synced', () => {
  console.log('bar@One:', modelTwo.get('bar'))
})
