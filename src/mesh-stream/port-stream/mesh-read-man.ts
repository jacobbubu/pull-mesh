import * as pull from 'pull-stream'
import { OnRawReadCallback, OnReceivedCallback } from '@jacobbubu/pull-pushable-duplex'
import { ReplyId } from '../../mesh-node'
import { PortStream } from './index'
import { trueToNull, noop } from '../../utils'

export const DefaultWindowSize = 3
export const DefaultWindowTime = 200
export const FinishedAfter = 500

export type OnClose = (end: pull.EndOrError) => void

export interface MeshReadManOptions {
  onClose: OnClose
}

export class MeshReadMan<Out> {
  private _buffer: Out[] = []
  private _requestList: MeshRead<Out>[] = []
  private _receivedCallback: OnReceivedCallback | null = null
  private _timerId: NodeJS.Timeout | null = null
  private _endOrError: pull.EndOrError = null
  private _abort: pull.EndOrError = null
  private _endCb: OnRawReadCallback | null = null
  private _onClose: OnClose
  private _finished = false
  private _started = false

  constructor(
    private readonly _port: PortStream<any, Out>,
    opts: Partial<MeshReadManOptions> = {}
  ) {
    this._onClose = opts.onClose ?? noop
  }

  get logger() {
    return this._port.logger
  }

  get finished() {
    return this._finished
  }

  get started() {
    return this._started
  }

  push(data: Out, readCb: OnReceivedCallback) {
    if (this._finished) {
      return readCb(true)
    }

    this._receivedCallback = readCb
    this._buffer.push(data)

    if (this.drainAbort()) return

    this.drain()
    if (this._endOrError) {
      this.drainEnd()
    }
  }

  addRequest(replyTo: ReplyId) {
    this._started = true
    const request = new MeshRead(this._port, replyTo)
    this._requestList.push(request)

    if (this.drainAbort()) return

    this.drain()
    if (this._endOrError) {
      this.drainEnd()
    }
  }

  addRequestAbort(replyTo: ReplyId, abort: pull.Abort = null) {
    this._started = true
    this._abort = abort
    const request = new MeshRead(this._port, replyTo)
    this._requestList.push(request)
    this.drainAbort()
  }

  readEnd(endOrError: pull.EndOrError, cb: () => void) {
    if (this._finished) {
      return cb()
    }

    this.logger.debug('meshRead end:', endOrError)
    this._endOrError = endOrError
    this._endCb = cb

    this.drainEnd()
  }

  private drainAbort() {
    if (this._abort) {
      this.cleanTimer()
      this._buffer.length = 0

      // we need to have peer receive at least one end/sinkEnd message
      // to avoid subsequent request messages.
      if (this._requestList.length > 0) {
        while (this._requestList.length > 0) {
          this._requestList.shift()!.end(this._abort)
        }
      } else {
        this._port.postToMesh(this._port.createSinkEndMessage(this._abort))
      }
      setTimeout(() => {
        this.finish(this._abort)
      }, FinishedAfter)

      return true
    }
    return false
  }

  private drainEnd() {
    if (this._endOrError) {
      this.cleanTimer()
      this.drain(true)

      // we need to have peer receive at least one end/sinkEnd message
      // to avoid subsequent request messages.
      if (this._requestList.length) {
        while (this._requestList.length > 0) {
          this._requestList.shift()!.end(this._endOrError)
        }
      } else {
        this._port.postToMesh(this._port.createSinkEndMessage(this._endOrError))
      }
      if (this._endCb) {
        const t = this._endCb
        this._endCb = null
        t()
      }
      setTimeout(() => {
        this.finish(this._endOrError)
      }, FinishedAfter)

      return true
    }
    return false
  }

  private drain(force = false) {
    const now = Date.now()

    this.logger.debug('readMeshMan drain:', {
      buffer: this._buffer,
      request: this._requestList.length,
      force,
      timer: !!this._timerId,
    })
    if (this._buffer.length > 0) {
      if (this._requestList.length > 0) {
        if (
          force ||
          now - this._requestList[this._requestList.length - 1].at > DefaultWindowTime ||
          this._buffer.length >= DefaultWindowSize
        ) {
          const request = this._requestList.shift()!
          const data = [...this._buffer]
          this._buffer.length = 0
          setImmediate(() => {
            request.response(data)
          })
        } else {
          if (!this._timerId) {
            this._timerId = setTimeout(() => {
              this._timerId = null
              this.drain.call(this, true)
            }, DefaultWindowTime)
          }
        }
      }
    }
    // should we read more data to fill the buffer?
    if (this._buffer.length < DefaultWindowSize && this._receivedCallback) {
      const t = this._receivedCallback
      this._receivedCallback = null
      t()
    }
  }

  private cleanTimer() {
    if (this._timerId) {
      clearTimeout(this._timerId)
      this._timerId = null
    }
  }

  private finish(endOrError: pull.EndOrError = true) {
    if (this._finished) return
    this._finished = true
    this._onClose(trueToNull(endOrError))
  }
}

export class MeshRead<Out> {
  private _timerId: NodeJS.Timeout | null = null

  constructor(
    private readonly _port: PortStream<any, Out>,
    private readonly _replyTo: ReplyId,
    private readonly _at: number = Date.now()
  ) {
    if (this._port.continueInterval > 0) {
      this._timerId = setTimeout(this.timedOut.bind(this), this._port.continueInterval)
    }
  }

  get replyTo() {
    return this._replyTo
  }

  get at() {
    return this._at
  }

  get logger() {
    return this._port.logger
  }

  response(dataList: Out[]) {
    this.cleanTimer()
    this._port.postToMesh(this._port.createResMessage(this._replyTo, dataList))
  }

  end(endOrError: pull.EndOrError = true) {
    this.cleanTimer()
    this._port.postToMesh(this._port.createEndMessage(this._replyTo, endOrError))
  }

  private timedOut() {
    this._port.postToMesh(this._port.createContinueMessage(this._replyTo))
    if (this._port.continueInterval > 0) {
      this._timerId = setTimeout(this.timedOut.bind(this), this._port.continueInterval)
    }
  }

  private cleanTimer() {
    if (this._timerId) {
      clearTimeout(this._timerId)
      this._timerId = null
    }
  }
}
