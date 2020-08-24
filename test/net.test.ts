import * as net from 'net'
import * as pull from 'pull-stream'
const toPull = require('stream-to-pull-stream')
import { MeshNode, wrap } from '../src'

import { createDuplex } from './common'

const PORT = 9988

describe('net', () => {
  it('two nodes', (done) => {
    let result1: any[]
    let result2: any[]
    const nodeA = new MeshNode('A')

    const nodeB = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          result2 = results
          hasDone()
        })
        return {
          stream: duplexTwo,
        }
      }
    }, 'B')

    const hasDone = () => {
      if (result1?.length > 0 && result2?.length > 0) {
        expect(result1).toEqual(['a', 'b', 'c'])
        expect(result2).toEqual([1, 2, 3])

        server.close(done)
      }
    }

    const server = net
      .createServer((socket) => {
        const client = toPull.duplex(socket) as pull.Duplex<Buffer, Buffer>
        const b2a = nodeB.createRelayStream('B->A')
        pull(client, wrap(b2a), client)
      })
      .listen(PORT)

    const rawClient = net.createConnection({ port: PORT }, () => {
      const client = toPull.duplex(rawClient) as pull.Duplex<Buffer, Buffer>
      const a2b = nodeA.createRelayStream('A->B')
      pull(client, wrap(a2b), client)

      const duplexOne = createDuplex([1, 2, 3], (err, results) => {
        expect(err).toBeFalsy()
        result1 = results
        rawClient.destroy()
        hasDone()
      })

      const portNum = nodeA.createPortStream('One', 'Two')
      pull(portNum, duplexOne, portNum)
    })
  })

  it('two nodes - zipped', (done) => {
    let result1: any[]
    let result2: any[]
    const nodeA = new MeshNode('A')

    const nodeB = new MeshNode((_, destURI) => {
      if (destURI === 'Two') {
        const duplexTwo = createDuplex(['a', 'b', 'c'], (err, results) => {
          expect(err).toBeFalsy()
          result2 = results
          hasDone()
        })
        return {
          stream: duplexTwo,
        }
      }
    }, 'B')

    const hasDone = () => {
      if (result1?.length > 0 && result2?.length > 0) {
        expect(result1).toEqual(['a', 'b', 'c'])
        expect(result2).toEqual([1, 2, 3])

        server.close(done)
      }
    }

    const server = net
      .createServer((socket) => {
        const client = toPull.duplex(socket) as pull.Duplex<Buffer, Buffer>
        const b2a = nodeB.createRelayStream('B->A')
        pull(client, wrap(b2a, { zipped: false }), client)
      })
      .listen(PORT)

    const rawClient = net.createConnection({ port: PORT }, () => {
      const client = toPull.duplex(rawClient) as pull.Duplex<Buffer, Buffer>
      const a2b = nodeA.createRelayStream('A->B')
      pull(client, wrap(a2b, { zipped: false }), client)

      const duplexOne = createDuplex([1, 2, 3], (err, results) => {
        expect(err).toBeFalsy()
        result1 = results
        rawClient.destroy()
        hasDone()
      })

      const portNum = nodeA.createPortStream('One', 'Two')
      pull(portNum, duplexOne, portNum)
    })
  })
})
