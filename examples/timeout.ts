import * as pull from 'pull-stream'

import { MeshNode } from '../src'

const readTimeout = 200
const duplexOne = {
  source: pull.values([1, 2]),
  sink: pull.collect((_, _1) => {
    console.log('never get here')
  }),
}

const nodeA = new MeshNode('A')

const port1 = nodeA.createPortStream('One', 'Two', { readTimeout })
pull(port1, duplexOne, port1)
