import * as pull from 'pull-stream'
import { MeshNode } from '../src'

import { createDelayedDuplex, makeAbortable } from './common'

describe('timeout', () => {
  it('one nodes', (done) => {
    const continueInterval = 10e3
    const readTimeout = 500

    const allDone = () => {
      setTimeout(() => {
        expect(nodeA.portStreamsLength).toBe(0)
        done()
      }, 20)
    }

    const duplexOne = createDelayedDuplex([1, 2, 3], 1e3, (err, results) => {
      expect(err).toBeTruthy()
      allDone()
    })

    const nodeA = new MeshNode('A')

    const portNum = nodeA.createPortStream('One', 'Two', {
      continueInterval,
      readTimeout,
    })
    pull(portNum, duplexOne, portNum)
  })

  it('two nodes', (done) => {
    const continueInterval = 10e3
    const readTimeout = 500
    let count = 2

    const allDone = () => {
      setTimeout(() => {
        expect(nodeA.portStreamsLength).toBe(0)
        expect(nodeB.portStreamsLength).toBe(0)
        done()
      }, 20)
    }

    const duplexOne = createDelayedDuplex([1, 2, 3], 1e3, (err, results) => {
      expect(err).toBeTruthy()
      if (--count === 0) allDone()
    })

    const nodeA = new MeshNode('A')
    const nodeB = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDelayedDuplex(['a', 'b', 'c'], 1e3, (err, results) => {
          expect(err).toBeTruthy()
          if (--count === 0) allDone()
        })
        return {
          stream: duplexTwo,
          portOpts: {
            continueInterval,
            readTimeout,
          },
        }
      }
    }, 'B')

    const a2b = nodeA.createRelayStream('A->B')
    const b2a = nodeB.createRelayStream('B->A')
    pull(a2b, b2a, a2b)

    const portNum = nodeA.createPortStream('One', 'Two', {
      continueInterval,
      readTimeout,
    })
    pull(portNum, duplexOne, portNum)
  })

  it('two nodes with relayStream been interrupted during transmission', (done) => {
    const continueInterval = 0 // DO NOT SEND continue message
    const readTimeout = 200
    let count = 2

    const allDone = () => {
      setTimeout(() => {
        expect(nodeA.portStreamsLength).toBe(0)
        expect(nodeB.portStreamsLength).toBe(0)
        done()
      }, 10)
    }

    const duplexOne = createDelayedDuplex([1, 2, 3], 500, (err, results) => {
      expect(err).toBeTruthy()
      if (--count === 0) allDone()
    })

    const nodeA = new MeshNode('A')
    const nodeB = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDelayedDuplex(['a', 'b', 'c'], 500, (err, results) => {
          expect(err).toBeTruthy()
          if (--count === 0) allDone()
        })
        return {
          stream: duplexTwo,
          portOpts: {
            continueInterval,
            readTimeout,
          },
        }
      }
    }, 'B')

    const a2b = makeAbortable(nodeA.createRelayStream('A->B'))
    const b2a = nodeB.createRelayStream('B->A')
    pull(a2b, b2a, a2b)

    setTimeout(() => {
      a2b.sourceAbortable.abort()
    }, 750)

    const portNum = nodeA.createPortStream('One', 'Two', {
      continueInterval,
      readTimeout,
    })
    pull(portNum, duplexOne, portNum)
  })
})
