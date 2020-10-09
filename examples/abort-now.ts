import * as pull from 'pull-stream'
import { MeshNode } from '../src'

const createAbortSinkDuplex = (values: any[], cb: (err: pull.EndOrError, data: any) => void) => {
  return {
    source: pull.values(values),
    sink: (read: pull.Source<any>) => {
      read(true, cb)
    },
  }
}

const duplexOne = createAbortSinkDuplex([], (err, results) => {
  console.log('duplexOne results', results)
  // expect(results).toEqual([])
})

const node = new MeshNode((_, destURI) => {
  if (destURI === 'Two') {
    const duplexTwo = createAbortSinkDuplex([], (err, results) => {
      console.log('duplexTwo results', results)
    })
    return {
      stream: duplexTwo,
    }
  }
}, 'A')

const port1 = node.createPortStream('One', 'Two')
pull(port1, duplexOne, port1)

port1.on('connect', () => console.log('connect'))
port1.on('close', () => console.log('close'))
