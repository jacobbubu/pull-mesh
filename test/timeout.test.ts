import * as pull from 'pull-stream'
import { MeshNode, MeshDataIndex, MeshDataCmd } from '../src'

import { createDelayedDuplex, makeAbortable } from './common'

describe('timeout', () => {
  it('one nodes', (done) => {
    const readTimeout = 500

    const allDone = () => {
      setTimeout(() => {
        expect(nodeA.portStreamsLength).toBe(0)
        done()
      }, 100)
    }

    const duplexOne = createDelayedDuplex([1, 2, 3], 1e3, (err, results) => {
      // portNum does not have the opportunity to extend the readMesh timeout
      // via a continue message on the peer
      expect(err).toBeTruthy()
      allDone()
    })

    const nodeA = new MeshNode('A')

    const portNum = nodeA.createPortStream('One', 'Two', {
      readTimeout,
    })

    pull(portNum, duplexOne, portNum)
  })

  it('two nodes with no timeout', (done) => {
    const readTimeout = 500
    let count = 2

    const allDone = () => {
      setTimeout(() => {
        expect(nodeA.portStreamsLength).toBe(0)
        expect(nodeB.portStreamsLength).toBe(0)
        done()
      }, 100)
    }

    const duplexOne = createDelayedDuplex([1, 2, 3], 1e3, (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) allDone()
    })

    const nodeA = new MeshNode('A')
    const nodeB = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDelayedDuplex(['a', 'b', 'c'], 1e3, (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1, 2, 3])
          if (--count === 0) allDone()
        })
        return {
          stream: duplexTwo,
          portOpts: {
            readTimeout,
          },
        }
      }
    }, 'B')

    const a2b = nodeA.createRelayStream('A->B')
    const b2a = nodeB.createRelayStream('B->A')
    pull(
      a2b,
      pull.through((message) => {
        if (Array.isArray(message)) {
          // it's a normal message other than a handshake.
          const cmd = message[MeshDataIndex.Cmd]
          let meta
          switch (cmd) {
            case MeshDataCmd.Open:
              meta = message[MeshDataIndex.Meta]
              expect(meta).toEqual({ cont: portNum.calcContinueInterval(readTimeout) })
              break
            case MeshDataCmd.Req:
              meta = message[MeshDataIndex.Meta]
              expect(meta).toEqual({})
              break
          }
        }
      }),
      b2a,
      a2b
    )

    const portNum = nodeA.createPortStream('One', 'Two', {
      readTimeout,
    })
    pull(portNum, duplexOne, portNum)
  })

  it('two nodes with relayStream been interrupted during transmission', (done) => {
    const readTimeout = 200
    let count = 2

    const allDone = () => {
      setTimeout(() => {
        expect(nodeA.portStreamsLength).toBe(0)
        expect(nodeB.portStreamsLength).toBe(0)
        done()
      }, 100)
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
      readTimeout,
    })
    pull(portNum, duplexOne, portNum)
  })
})
