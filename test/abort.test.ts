import * as pull from 'pull-stream'
import { MeshNode } from '../src'

import { createDuplex, createDelayedDuplex, delay } from './common'

describe('abort on portStream', () => {
  it('abort', async (done) => {
    let count = 2
    const duplexOne = createDelayedDuplex([1, 2, 3], 400, (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) done()
    })

    const node = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1])
          if (--count === 0) done()
        })
        return {
          stream: duplexTwo,
        }
      }
    }, 'A')

    const port1 = node.createPortStream('One', 'Two')
    pull(port1, duplexOne, port1)

    await delay(600)
    port1.abort()
  })

  it('end', async (done) => {
    let count = 2
    const duplexOne = createDelayedDuplex([1, 2, 3], 400, (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) done()
    })

    const node = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1, 2])
          if (--count === 0) done()
        })
        return {
          stream: duplexTwo,
        }
      }
    }, 'A')

    const port1 = node.createPortStream('One', 'Two')
    pull(port1, duplexOne, port1)

    await delay(600)
    port1.end()
  })
})
