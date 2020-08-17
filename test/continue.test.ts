import * as pull from '@jacobbubu/pull-stream'
import { MeshNode } from '../src'

import { createDelayedDuplex } from './common'

describe('continue', () => {
  it('two nodes', (done) => {
    const continueInterval = 100
    const readTimeout = 1e3
    let count = 2
    const duplexOne = createDelayedDuplex([1, 2, 3], 300, (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) done()
    })

    const nodeA = new MeshNode('A')
    const nodeB = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDelayedDuplex(['a', 'b', 'c'], 300, (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1, 2, 3])
          if (--count === 0) done()
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
})
