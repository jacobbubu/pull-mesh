import * as pull from 'pull-stream'
import { SinkMan, ReadMeshItem } from '../src/mesh-stream/sink-man'
import { PortStream, MeshCmdResponse } from 'src'
import { ReadMesh, OnClose } from 'src/mesh-stream/read-mesh'
import { MeshData } from 'src/mesh-node'

describe('read', () => {
  it('simple', (done) => {
    let port = {} as PortStream<number>
    port.createResMessage = (replyTo: string, dataList: any[]) => {
      return {} as MeshCmdResponse
    }
    port.postToMesh = (message: MeshData) => {
      done()
    }
    let sinkMan: SinkMan<number> = new SinkMan<number>(port)

    let i = 0
    sinkMan.addRead((abort, cb) => {
      if (i++ > 2) {
        throw new Error('bad')
      }
      cb(null, i)
    })

    sinkMan.addReadMesh({ replyTo: 'A' })
  })
})
