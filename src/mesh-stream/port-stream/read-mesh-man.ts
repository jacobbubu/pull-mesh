import * as pull from 'pull-stream'
import { PortStream, CallbackToRequestToMeshMan } from './index'
import {
  Id,
  MeshCmdResponse,
  MeshCmdResIndex,
  MeshCmdEnd,
  MeshCmdEndIndex,
  MeshCmdSinkEnd,
  MeshCmdSinkEndIndex,
  MeshCmdContinue,
  MeshCmdContinueIndex,
} from '../../mesh-node'
import { uid, trueToNull, noop } from '../../utils'
import { TouchMan } from '../touch-man'

export type OnClose = (end: pull.EndOrError) => void

export interface ReadMeshManOptions {
  onClose: OnClose
}

export class ReadMeshMan<In> {
  private _buffer: [end: pull.EndOrError, data?: In][] = []
  private _readMesh: ReadMesh<In> | null = null
  private _readCallback: CallbackToRequestToMeshMan<In> | null = null
  private _onClose: OnClose
  private _peerEnded: pull.EndOrError | null = null
  private _finished = false

  constructor(private readonly _port: PortStream<In, any>, opts: Partial<ReadMeshManOptions> = {}) {
    this._onClose = opts.onClose ?? noop
  }

  get logger() {
    return this._port.logger
  }

  get finished() {
    return this._finished
  }

  request(isOpen: boolean, cb: CallbackToRequestToMeshMan<In>) {
    if (this._finished) {
      this.logger.debug('ignored readMesh request due to finished')
      return cb(this._finished)
    }

    // simply override the old callback
    this._readCallback = cb

    // try to use existing buffed data to satisfy the request first.
    this.drain()

    if (this._peerEnded) {
      if (this._readCallback) {
        const t = this._readCallback
        this._readCallback = null
        t(this._peerEnded)
      }
      this.finish()
      return
    }

    if (this._buffer.length === 0 && !this._readMesh && this._readCallback) {
      this.createRequestToMesh(isOpen)
    }
  }

  requestAbort(isOpen: boolean, abort: pull.Abort, cb: CallbackToRequestToMeshMan<In>) {
    this._buffer.length = 0

    if (this._readMesh) {
      this._readMesh.abort(abort)
    }

    this._readCallback = cb
    this.createRequestToMesh(isOpen, abort)
  }

  processRes(message: MeshCmdResponse) {
    if (this._readMesh) {
      this.logger.debug('recv readMesh: cmd(%s) %4O', message[MeshCmdResIndex.Cmd], message)
      return this._readMesh.res(message)
    }
    return false
  }

  processContinue(message: MeshCmdContinue) {
    if (this._readMesh) {
      this.logger.debug('recv readMesh: cmd(%s) %4O', message[MeshCmdContinueIndex.Cmd], message)
      return this._readMesh.continue(message)
    }
    return false
  }

  processEnd(message: MeshCmdEnd) {
    if (this._readMesh) {
      this.logger.debug('recv readMesh: cmd(%s) %4O', message[MeshCmdEndIndex.Cmd], message)
      return this._readMesh.end(message)
    }
    return false
  }

  processSinkEnd(message: MeshCmdSinkEnd) {
    this.logger.debug('recv readMesh: cmd(%s) %4O', message[MeshCmdSinkEndIndex.Cmd], message)
    this.logger.debug('rest: ', this._buffer, !!this._readMesh)
    if (this._readMesh) {
      this._readMesh.sinkEnd(message)
    }
    this._peerEnded = message[MeshCmdSinkEndIndex.EndOrError]
    return true
  }

  setNewReadTimeout(newTimeout: number) {
    if (this._readMesh) {
      this._readMesh.extendTo(newTimeout)
      return true
    }
    return false
  }

  private createRequestToMesh(isOpen: boolean, abort?: pull.Abort) {
    this._readMesh = new ReadMesh(
      this._port,
      isOpen,
      (end, dataList) => {
        this._readMesh = null
        if (end) {
          this._buffer.push([end])
        } else {
          this._buffer = this._buffer.concat(dataList!.map((x) => [null, x]))
        }
        this.drain()
        if (end) {
          this.finish()
        }
      },
      abort
    )
  }

  private drain() {
    if (this._buffer.length > 0 && this._readCallback) {
      const t = this._readCallback
      this._readCallback = null
      t(...this._buffer.shift()!)
    }
  }

  private finish(endOrError: pull.EndOrError = true) {
    if (this._finished) return

    if (this._buffer.length === 0 && !this._readMesh && !this._readCallback) {
      this._finished = true
      this._onClose(trueToNull(endOrError))
    }
  }
}

export type OnRequestToMeshClose<In> = (endOrError: pull.EndOrError, dataList?: In[]) => void

export class ReadMesh<In> {
  private _id: Id
  private _touch: TouchMan
  private _onClose: OnRequestToMeshClose<In>

  constructor(
    private readonly _port: PortStream<In, any>,
    isOpen: boolean,
    onClose: OnRequestToMeshClose<In>,
    abort: pull.Abort = null
  ) {
    this._id = uid()
    this._onClose = onClose

    this._touch = new TouchMan(() => {
      this.logger.debug(`readMesh(${this._id}) timed-out(${Math.floor(this._port.readTimeout)}ms`)
      this.abort(
        new Error(
          `readMesh(${this._id}) exceeds read timeout(${Math.floor(this._port.readTimeout)}ms)`
        )
      )
    }, this._port.readTimeout)

    const message = isOpen
      ? this._port.createOpenMessage(abort, this._id)
      : this._port.createReqMessage(abort, this._id)

    this._port.postToMesh(message)
  }

  get id() {
    return this._id
  }

  get logger() {
    return this._port.logger
  }

  res(message: MeshCmdResponse) {
    if (message[MeshCmdResIndex.ReplyId] === this._id) {
      this.touch()
      const dataList = message[MeshCmdResIndex.Payload]
      this.respond(null, dataList)
      return true
    }
    return false
  }

  end(message: MeshCmdEnd) {
    if (message[MeshCmdEndIndex.ReplyId] === this._id) {
      const end = message[MeshCmdEndIndex.EndOrError]
      this.respond(end)
      return true
    }
    return false
  }

  directEnd(endOrError: pull.EndOrError) {
    this.logger.debug('directEnd:', endOrError)
    this.respond(endOrError)
  }

  continue(message: MeshCmdContinue) {
    if (message[MeshCmdContinueIndex.ReplyId] === this._id) {
      this.touch()
      return true
    }
    return false
  }

  sinkEnd(message: MeshCmdSinkEnd) {
    const end = message[MeshCmdSinkEndIndex.EndOrError]
    this.respond(end)
    return true
  }

  abort(abort: pull.Abort = true) {
    this.respond(abort)
  }

  touch() {
    this._touch.touch()
  }

  extendTo(newTimeout: number) {
    this._touch.extendTo(newTimeout)
  }

  private respond(end: pull.EndOrError, dataList?: In[]) {
    this.logger.debug(`readMesh(${this._id}) respond:`, { id: this._id, end, dataList })
    this._touch.stop()
    this._onClose(end, dataList)
  }
}
