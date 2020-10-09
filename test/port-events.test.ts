import * as pull from 'pull-stream'
import { MeshNode } from '../src'

import { createDuplex, createAbortSinkDuplex } from './common'

describe('port-stream events', () => {
  it('connect/close for non-empty external duplexes', (done) => {
    const onConnectEvent = jest.fn()
    const onCloseEvent = jest.fn()

    let count = 2

    function finish() {
      expect(onConnectEvent).toBeCalledTimes(1)
      expect(onCloseEvent).toBeCalledTimes(1)
      done()
    }

    const duplexOne = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) finish()
    })

    const node = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1, 2, 3])
          if (--count === 0) finish()
        })
        return {
          stream: duplexTwo,
        }
      }
    }, 'A')

    const port1 = node.createPortStream('One', 'Two')
    pull(port1, duplexOne, port1)

    port1.on('connect', onConnectEvent)
    port1.on('close', onCloseEvent)
  })

  it('connect/close for empty external duplexes', (done) => {
    const onConnectEvent = jest.fn()
    const onCloseEvent = jest.fn()

    let count = 2

    function finish() {
      expect(onConnectEvent).toBeCalledTimes(1)
      expect(onCloseEvent).toBeCalledTimes(1)
      done()
    }

    const duplexOne = createDuplex([], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual([])
      if (--count === 0) finish()
    })

    const node = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDuplex([], (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([])
          if (--count === 0) finish()
        })
        return {
          stream: duplexTwo,
        }
      }
    }, 'A')

    const port1 = node.createPortStream('One', 'Two')
    pull(port1, duplexOne, port1)

    port1.on('connect', onConnectEvent)
    port1.on('close', onCloseEvent)
  })

  it('connect/close for immediate abort duplexes', (done) => {
    const events: string[] = []

    let count = 2

    function finish() {
      setImmediate(() => {
        expect(events).toEqual(['CONNECT', 'CLOSE'])
        done()
      })
    }

    const duplexOne = createAbortSinkDuplex([], (err, results) => {
      expect(err).toBeTruthy()
      expect(results).toBeUndefined()
      if (--count === 0) finish()
    })

    const node = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createAbortSinkDuplex([], (err, results) => {
          expect(err).toBeTruthy()
          expect(results).toBeUndefined()
          if (--count === 0) finish()
        })
        return {
          stream: duplexTwo,
        }
      }
    }, 'A')

    const port1 = node.createPortStream('One', 'Two')

    pull(port1, duplexOne, port1)

    port1.on('connect', () => events.push('CONNECT'))
    port1.on('close', () => events.push('CLOSE'))
  })
})
