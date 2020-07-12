import { assert } from 'console'
import * as pull from 'pull-stream'
import { PortStream } from './port-stream'
import { MeshDataIndex, MeshData, Id } from '../mesh-node'
import { uid, noop } from '../utils'

export type OnClose = (replyTo: Id, endOrError: pull.EndOrError, dataList?: any[]) => void

export class ReadMesh<T> {
  private _id: string
  private _finished = false

  static create<T>(port: PortStream<T>, onClose: OnClose = noop) {
    return new ReadMesh<T>(port, onClose)
  }

  static createAbort<T>(port: PortStream<T>, onClose: OnClose = noop) {
    return new ReadMesh<T>(port, onClose)
  }

  private constructor(private readonly _port: PortStream<T>, private readonly _onClose: OnClose) {
    this._id = uid()
  }

  get id() {
    return this._id
  }

  get finished() {
    return this._finished
  }

  postToMesh(isOpen: boolean, abort: pull.Abort = null) {
    const message = isOpen
      ? this._port.createOpenMessage(abort, this._id)
      : this._port.createReqMessage(abort, this._id)
    this._port.postToMesh(message)
  }

  res(message: MeshData) {
    const dataList = message[MeshDataIndex.Payload] as any[]
    assert(Array.isArray(dataList))
    this.finish(null, dataList)
  }

  // end from mesh
  end(message: MeshData) {
    const end = message[MeshDataIndex.Payload] as pull.EndOrError
    this.finish(end)
  }

  abort(abort: pull.Abort = true) {
    this.finish(abort)
  }

  private finish(end: pull.EndOrError, dataList?: any[]) {
    this._finished = true
    this._onClose(this.id, end, dataList)
  }
}
