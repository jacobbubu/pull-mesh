import { assert } from 'console'
import * as pull from 'pull-stream'
import { PortStream } from './port-stream'
import {
  Id,
  MeshCmdResponse,
  MeshCmdResIndex,
  MeshCmdEnd,
  MeshCmdEndIndex,
  MeshCmdSinkEnd,
  MeshCmdSinkEndIndex,
  MeshCmdContinue,
} from '../mesh-node'
import { uid, noop } from '../utils'
import { TouchMan } from './touch-man'

export type OnClose = (replyTo: Id, endOrError: pull.EndOrError, dataList?: any[]) => void

export class ReadMesh<T> {
  private _id: string
  private _finished = false
  private _readMeshTouch: TouchMan | null = null
  private _isUsed = false

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

  get logger() {
    return this._port.logger
  }

  postToMesh(isOpen: boolean, abort: pull.Abort = null) {
    if (this._isUsed) {
      throw new Error(`this readMesh has been used: ${this._id}`)
    }

    this._isUsed = true

    this._readMeshTouch = new TouchMan(() => {
      this.logger.debug(`readMesh(%s) timed-out`, this._id)
      this.abort(new Error(`readMesh exceeds read timeout`))
    }, this._port.readTimeout)

    const message = isOpen
      ? this._port.createOpenMessage(abort, this._id)
      : this._port.createReqMessage(abort, this._id)

    this._port.postToMesh(message)
  }

  res(message: MeshCmdResponse) {
    this._readMeshTouch?.touch()
    const dataList = message[MeshCmdResIndex.Payload]
    assert(Array.isArray(dataList))
    this.finish(null, dataList)
  }

  // end from mesh
  end(message: MeshCmdEnd) {
    const end = message[MeshCmdEndIndex.EndOrError]
    this.finish(end)
  }

  sinkEnd(message: MeshCmdSinkEnd) {
    const end = message[MeshCmdSinkEndIndex.EndOrError]
    this.finish(end)
  }

  continue(_: MeshCmdContinue) {
    this._readMeshTouch?.touch()
  }

  abort(abort: pull.Abort = true) {
    this.finish(abort)
  }

  private finish(end: pull.EndOrError, dataList?: any[]) {
    this.logger.debug(`readMesh(%s) finished`, this._id)
    this._readMeshTouch?.stop()
    this._finished = true
    this._onClose(this.id, end, dataList)
  }
}
