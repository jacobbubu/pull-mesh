import * as pull from 'pull-stream'
import { MeshNode } from '../src'

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
      pull.through((data) => {
        if (i1 === 0) {
          expect(data).toEqual(opts.vars)
        } else if (i1 === 1) {
          expect(data[2]).toBe('{v}{sm}')
          expect(data[3]).toBe('{c}{sm}')
        }
        i1 += 1
      }),
      nodeB.createRelayStream('B->A'),
      pull.through((data) => {
        console.log(data)
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
})
