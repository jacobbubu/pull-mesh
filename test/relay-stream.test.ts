import * as pull from 'pull-stream'
import {
  MeshNode,
  MeshDataIndex,
  MeshDataCmd,
  VarsType,
  makeDestFilter,
  makeDestPrefixFilter,
  MeshData,
} from '../src'

import { createDuplex } from './common'

describe('relay-stream', () => {
  it('vars', (done) => {
    const opts = {
      vars: {
        '{v}': 'veh.LW400B10WS1000X30.',
        '{c}': 'clo.LW400B10WS1000X30.',
        '{sm}': 'signalModel',
      },
      name: 'A->B',
    }

    let count = 2
    const duplexOne = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) done()
    })

    const sourceURI = 'veh.LW400B10WS1000X30.signalModel'
    const destURI = 'clo.LW400B10WS1000X30.signalModel'

    const nodeA = new MeshNode('A')
    const nodeB = new MeshNode((_, _destURI) => {
      if (_destURI === destURI) {
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

    let i1 = 0
    let i2 = 0
    const a2b = nodeA.createRelayStream(opts)

    pull(
      a2b,
      pull.through((data: VarsType) => {
        if (i1 === 0) {
          expect(data).toEqual(opts.vars)
        } else if (i1 === 1) {
          expect(data[2]).toBe('{v}{sm}')
          expect(data[3]).toBe('{c}{sm}')
        }
        i1 += 1
      }),
      nodeB.createRelayStream('B->A'),
      pull.through((data: VarsType) => {
        if (i2 === 0) {
          expect(data).toEqual({})
        } else if (i2 === 1) {
          expect(data[2]).toBe('{c}{sm}')
          expect(data[3]).toBe('{v}{sm}')
        }
        i2 += 1
      }),
      a2b
    )

    const portNum = nodeA.createPortStream(sourceURI, destURI)
    pull(portNum, duplexOne, portNum)
  })

  it('priority', (done) => {
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

    const result: string[] = []
    const expected = ['a2c', 'a2b']
    const a2b = nodeA.createRelayStream({ name: 'A->B' })
    a2b.on('outgoing', (message) => {
      result.push('a2b')
      if (result.length === 2) {
        expect(result).toEqual(expected)
      }
    })
    const b2a = nodeB.createRelayStream('B->A')
    pull(a2b, b2a, a2b)

    const a2c = nodeA.createRelayStream({ priority: 1, name: 'A->C' })
    a2c.on('outgoing', (message) => {
      result.push('a2c')
      if (result.length === 2) {
        expect(result).toEqual(expected)
      }
    })

    const c2a = nodeC.createRelayStream('C->A')
    pull(a2c, c2a, a2c)

    const portNum = nodeA.createPortStream('One', 'Two')
    pull(portNum, duplexOne, portNum)
  })

  it('outgoing filter', (done) => {
    let count = 2
    const duplexOne = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) finished()
    })

    const nodeA = new MeshNode('A')
    const nodeB = new MeshNode('B')
    const nodeC = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1, 2, 3])
          if (--count === 0) finished()
        })
        return {
          stream: duplexTwo,
        }
      }
    }, 'C')

    function finished() {
      expect(a2bResult.includes(MeshDataCmd.Open)).toBeFalsy()
      done()
    }

    const a2bResult: string[] = []
    const a2b = nodeA.createRelayStream({
      name: 'A->B',
      outgoingFilter: (message) => {
        const cmd = message[MeshDataIndex.Cmd]
        if (cmd === MeshDataCmd.Open) {
          return false
        }
        return true
      },
    })
    a2b.on('outgoing', (message) => {
      const cmd = message[MeshDataIndex.Cmd]
      a2bResult.push(cmd)
    })

    const b2a = nodeB.createRelayStream('B->A')
    pull(a2b, b2a, a2b)

    const a2c = nodeA.createRelayStream({ priority: 1, name: 'A->C' })

    const c2a = nodeC.createRelayStream('C->A')
    pull(a2c, c2a, a2c)

    const portNum = nodeA.createPortStream('One', 'Two')
    pull(portNum, duplexOne, portNum)
  })

  it('prefix outgoing filter', (done) => {
    let count = 2
    const duplexOne = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) finished()
    })

    const nodeA = new MeshNode('A')
    const nodeB = new MeshNode('B')
    const nodeC = new MeshNode((_, destURI) => {
      if (destURI === 'prefix_c') {
        const duplexTwo = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1, 2, 3])
          if (--count === 0) finished()
        })
        return {
          stream: duplexTwo,
        }
      }
    }, 'C')

    function finished() {
      expect(a2bResult.length).toBe(0)
      expect(b2aResult.length).toBe(0)
      expect(c2bResult.length).toBe(0)
      expect(b2cResult.length).toBe(0)
      expect(a2cResult.length).not.toBe(0)
      expect(c2aResult.length).not.toBe(0)

      done()
    }

    const a2bResult: string[] = []
    const b2aResult: string[] = []

    const a2cResult: string[] = []
    const c2aResult: string[] = []

    const c2bResult: string[] = []
    const b2cResult: string[] = []

    const a2b = nodeA.createRelayStream({
      name: 'A->B',
      // only messages containing the 'prefix_b' prefix in the destURI
      // will pass the current relayStream
      outgoingFilter: makeDestPrefixFilter('prefix_b'),
    })
    a2b.on('outgoing', (message) => {
      a2bResult.push(message[MeshDataIndex.Cmd])
    })

    const b2a = nodeB.createRelayStream({
      name: 'B->A',
      outgoingFilter: makeDestPrefixFilter('prefix_a'),
    })
    pull(a2b, b2a, a2b)
    b2a.on('outgoing', (message) => {
      b2aResult.push(message[MeshDataIndex.Cmd])
    })

    const a2c = nodeA.createRelayStream({ priority: 1, name: 'A->C' })
    a2c.on('outgoing', (message) => {
      a2cResult.push(message[MeshDataIndex.Cmd])
    })

    const c2a = nodeC.createRelayStream('C->A')
    pull(a2c, c2a, a2c)
    c2a.on('outgoing', (message) => {
      c2aResult.push(message[MeshDataIndex.Cmd])
    })

    const b2c = nodeB.createRelayStream({ name: 'B->C' })
    b2c.on('incoming', (message) => {
      b2cResult.push(message[MeshDataIndex.Cmd])
    })

    b2c.on('outgoing', (message) => {
      b2cResult.push(message[MeshDataIndex.Cmd])
    })

    const c2b = nodeC.createRelayStream({
      name: 'C->B',
      // only messages containing the 'prefix_b' prefix in the destURI
      // will pass the current relayStream
      outgoingFilter: makeDestPrefixFilter('prefix_b'),
    })
    pull(b2c, c2b, b2c)
    c2b.on('outgoing', (message) => {
      console.log('c2b', message)
      c2bResult.push(message[MeshDataIndex.Cmd])
    })

    const portNum = nodeA.createPortStream('prefix_a', 'prefix_c')
    pull(portNum, duplexOne, portNum)
  })

  it('incoming filter', (done) => {
    let count = 2
    const duplexOne = createDuplex([1, 2, 3], (err, results) => {
      expect(err).toBeFalsy()
      expect(results).toEqual(['a', 'b', 'c'])
      if (--count === 0) finished()
    })

    const nodeA = new MeshNode('A')
    const nodeB = new MeshNode('B')
    const nodeC = new MeshNode((_, destURI) => {
      if (destURI === 'prefix_c') {
        const duplexTwo = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          expect(results).toEqual([1, 2, 3])
          if (--count === 0) finished()
        })
        return {
          stream: duplexTwo,
        }
      }
    }, 'C')

    function finished() {
      expect(b2aIncomings.length).toBe(0)
      done()
    }
    const b2aIncomings: MeshData[] = []

    const a2b = nodeA.createRelayStream({
      name: 'A->B',
    })

    const b2a = nodeB.createRelayStream({
      name: 'B->A',
      // only messages containing the prefix_b prefix in the destURI
      //  will be entered in the current relayStream.
      incomingFilter: makeDestFilter((destURI) => {
        return destURI.startsWith('prefix_b')
      }),
    })
    b2a.on('incoming', (message) => {
      b2aIncomings.push(message)
    })

    pull(a2b, b2a, a2b)

    const a2c = nodeA.createRelayStream({ priority: 1, name: 'A->C' })
    const c2a = nodeC.createRelayStream('C->A')
    pull(a2c, c2a, a2c)

    const portNum = nodeA.createPortStream('prefix_a', 'prefix_c')
    pull(portNum, duplexOne, portNum)
  })
})
