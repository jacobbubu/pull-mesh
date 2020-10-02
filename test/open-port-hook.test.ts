import * as pull from 'pull-stream'
import { MeshNode, OnOpenPort } from '../src'

import { createDuplex } from './common'

describe('basic', () => {
  it('one hook', (done) => {
    let count = 2
    const duplexOne = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) done()
    })

    const openPortHook: OnOpenPort = (_, destURI) => {
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
    }
    const node = new MeshNode('A')
    node.addOpenPortHook(openPortHook)

    const portNum = node.createPortStream('One', 'Two')
    pull(portNum, duplexOne, portNum)
  })

  it('add second hook later', (done) => {
    let count = 3

    const node = new MeshNode('A')

    const duplexOne = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      count--

      const openPortHook2: OnOpenPort = (_, destURI) => {
        if (destURI === 'Three') {
          const stream = createDuplex(['A', 'B', 'C'], (err, results) => {
            expect(err).toBeFalsy()
            expect(results).toEqual([4, 5, 6])
            if (--count === 0) done()
          })
          return {
            stream: stream,
          }
        }
      }
      node.addOpenPortHook(openPortHook2)

      const portOneToThree = node.createPortStream('One', 'Three')
      pull(portOneToThree, duplexTwo, portOneToThree)
    })

    const duplexTwo = createDuplex([4, 5, 6], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['A', 'B', 'C'])
      if (--count === 0) done()
    })

    const openPortHook1: OnOpenPort = (_, destURI) => {
      if (destURI === 'Two') {
        const stream = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1, 2, 3])
          if (--count === 0) done()
        })
        return {
          stream: stream,
        }
      }
    }
    node.addOpenPortHook(openPortHook1)

    const portOneToTwo = node.createPortStream('One', 'Two')
    pull(portOneToTwo, duplexOne, portOneToTwo)
  })
})
