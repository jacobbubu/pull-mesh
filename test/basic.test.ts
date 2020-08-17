import * as pull from '@jacobbubu/pull-stream'
import { MeshNode } from '../src'

import { createDuplex } from './common'

describe('basic', () => {
  it('one node', (done) => {
    let count = 2
    const duplexOne = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) done()
    })

    const node = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1, 2, 3])
          if (--count === 0) done()
        })
        return {
          stream: duplexTwo,
        }
      }
    }, 'A')

    const portNum = node.createPortStream('One', 'Two')
    pull(portNum, duplexOne, portNum)
  })

  it('two nodes', (done) => {
    let count = 2
    const duplexOne = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) done()
    })

    const nodeA = new MeshNode('A')
    const nodeB = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1, 2, 3])
          if (--count === 0) done()
        })
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
  })

  it('two nodes with two port streams have the same destURI and sourceURI', (done) => {
    let count = 4
    const duplexOne = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) done()
    })

    const duplexTwo = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) done()
    })

    const nodeA = new MeshNode('A')
    const nodeB = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const s = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1, 2, 3])
          if (--count === 0) done()
        })
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
  })

  it('three nodes', (done) => {
    let count = 2
    const duplexOne = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) done()
    })

    const nodeA = new MeshNode('A')
    const nodeB = new MeshNode('B')
    const nodeC = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1, 2, 3])
          if (--count === 0) done()
        })
        return {
          stream: duplexTwo,
        }
      }
    }, 'C')

    const a2b = nodeA.createRelayStream('A->B')
    const b2a = nodeB.createRelayStream('B->A')
    pull(a2b, b2a, a2b)

    const b2c = nodeB.createRelayStream('B->C')
    const c2b = nodeC.createRelayStream('C->B')
    pull(b2c, c2b, b2c)

    const a2c = nodeA.createRelayStream('A->C')
    const c2a = nodeC.createRelayStream('C->A')
    pull(a2c, c2a, a2c)

    const portNum = nodeA.createPortStream('One', 'Two')
    pull(portNum, duplexOne, portNum)
  })

  it('three nodes with two port streams have the same destURI and sourceURI', (done) => {
    let count = 4
    const duplexOne = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) done()
    })

    const duplexTwo = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) done()
    })

    const nodeA = new MeshNode('A')
    const nodeB = new MeshNode('B')
    const nodeC = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const s = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1, 2, 3])
          if (--count === 0) done()
        })
        return {
          stream: s,
        }
      }
    }, 'C')

    const a2b = nodeA.createRelayStream('A->B')
    const b2a = nodeB.createRelayStream('B->A')
    pull(a2b, b2a, a2b)

    const b2c = nodeB.createRelayStream('B->C')
    const c2b = nodeC.createRelayStream('C->B')
    pull(b2c, c2b, b2c)

    const a2c = nodeA.createRelayStream('A->C')
    const c2a = nodeC.createRelayStream('C->A')
    pull(a2c, c2a, a2c)

    const port1 = nodeA.createPortStream('One', 'Two')
    pull(port1, duplexOne, port1)

    const port2 = nodeA.createPortStream('One', 'Two')
    pull(port2, duplexTwo, port2)
  })
})
