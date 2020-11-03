import { MeshStream } from '../mesh-stream'
import * as pull from 'pull-stream'
import {
  PushableDuplex,
  OnReceivedCallback,
  OnReadCallback,
  OnReadAbortCallback,
  OnRawReadCallback,
} from '@jacobbubu/pull-pushable-duplex'
import { Debug } from '@jacobbubu/debug'

import {
  MeshNode,
  MeshData,
  MeshDataIndex,
  MeshCmdEnd,
  MeshCmdSinkEnd,
  MeshCmdResponse,
  MeshCmdRequest,
  MeshCmdOpen,
  MeshCmdReqIndex,
  MeshDataCmd,
  MeshCmdContinue,
  Id,
  ReplyId,
  PortId,
  PeerPortId,
  MeshCmdOpenIndex,
  MeshCmdSinkEndIndex,
  MeshMeta,
} from '../../mesh-node'
import { MeshReadMan } from './mesh-read-man'
import { ReadMeshMan } from './read-mesh-man'
import { uid, delay } from '../../utils'

export type OnFinished = (err: pull.EndOrError) => void
export interface PortStreamOptions {
  readTimeout: number
  onFinished?: OnFinished
}

export type CallbackToRequestToMeshMan<In> = (err: pull.EndOrError, data?: In) => void

export class PortStream<In, Out> extends MeshStream<MeshData> {
  private _portId: PortId
  private _reqCont: number | null = null
  private _connectEventHasEmitted = false
  private _peerPortId: PeerPortId | null = null

  private _innerDuplex: PushableDuplex<In, Out, number>
  private _innerDuplexFinished = false

  private _meshReadMan: MeshReadMan<Out>
  private _readMeshMan: ReadMeshMan<In>

  private _readTimeout: number
  private _continueInterval: number = 0

  constructor(
    private readonly _sourceURI: string,
    private readonly _destURI: string,
    node: MeshNode,
    opts: Partial<PortStreamOptions> = {}
  ) {
    super(node)
    this._node = node
    this._portId = node.getNextPortStreamCounter().toString()
    this._logger = node.logger.ns(this._sourceURI).ns(this._portId)
    this._readTimeout = opts.readTimeout ?? 15e3

    this._meshReadMan = new MeshReadMan(this, {
      onClose: () => {
        this.logger.log('meshReadMan closed')
        this.finish()
      },
    })

    this._readMeshMan = new ReadMeshMan(this, {
      onClose: () => {
        this.logger.log('readMeshMan closed')
        this.finish()
      },
    })

    this._innerDuplex = new PushableDuplex({
      allowHalfOpen: true,
      initialState: 0,
      autoStartReading: false,
      onReceived: this.onReceived.bind(this),
      onRead: this.onRead.bind(this),
      onReadAbort: this.onReadAbort.bind(this),
      onRawReadEnd: this.onRawReadEnd.bind(this),
      onSinkEnded: async (endOrError) => {
        this.logger.log('innerDuplex.sink ended:', endOrError)
        if (!this._innerDuplex.sourceState.finished) {
          await delay(1e3)
          if (!this._innerDuplex.sourceState.finished) {
            this._innerDuplex.endSource()
          }
        }
      },
      onSourceEnded: async (endOrError) => {
        this.logger.log('innerDuplex.source ended:', endOrError)
        if (!this._innerDuplex.sinkState.finished) {
          await delay(1e3)
          if (!this._innerDuplex.sinkState.finished) {
            this._innerDuplex.endSink()
          }
        }
      },
      onFinished: (end) => {
        this._innerDuplexFinished = true
        this.logger.log('innerDuplex finished:', end)
        this.finish()
      },
    })
  }

  get source() {
    return this._innerDuplex.source
  }

  get sink() {
    return this._innerDuplex.sink
  }

  get logger() {
    return this._logger
  }

  get portId() {
    return this._portId
  }

  get peerPortId() {
    return this._peerPortId
  }

  set peerPortId(value) {
    this._peerPortId = value
  }

  get sourceURI() {
    return this._sourceURI
  }

  get destURI() {
    return this._destURI
  }

  get continueInterval() {
    return this._continueInterval
  }

  get readTimeout() {
    return this._readTimeout
  }

  set readTimeout(value) {
    this._readMeshMan.setNewReadTimeout(value)
    this._readTimeout = value
    this._reqCont = this.calcContinueInterval(this._readTimeout)
  }

  calcContinueInterval(readTimeout: number = this._readTimeout) {
    return Math.floor(readTimeout / 3) * 2
  }

  createOpenMessage(abort: pull.Abort, id: Id, meta: MeshMeta = {}): MeshCmdOpen {
    meta.cont = meta.cont ?? this.calcContinueInterval()
    return [id, meta, MeshDataCmd.Open, this._sourceURI, this._destURI, this._portId, abort]
  }

  createReqMessage(abort: pull.Abort, id: Id, meta: MeshMeta = {}): MeshCmdRequest {
    if (this._reqCont) {
      meta.cont = meta.cont ?? this._reqCont
      this._reqCont = null
    }
    return [id, meta, MeshDataCmd.Req, this._sourceURI, this._destURI, this._portId, abort]
  }

  createResMessage(replyTo: ReplyId, dataList: any[], meta: MeshMeta = {}): MeshCmdResponse {
    return [
      uid(),
      meta,
      MeshDataCmd.Res,
      this._sourceURI,
      this._destURI,
      this._peerPortId!,
      replyTo,
      dataList,
    ]
  }

  createEndMessage(replyTo: ReplyId, endOrError: pull.EndOrError, meta: MeshMeta = {}): MeshCmdEnd {
    return [
      uid(),
      meta,
      MeshDataCmd.End,
      this._sourceURI,
      this._destURI,
      this._peerPortId!,
      replyTo,
      endOrError,
    ]
  }

  createContinueMessage(replyTo: ReplyId, meta: MeshMeta = {}): MeshCmdContinue {
    return [
      uid(),
      meta,
      MeshDataCmd.Continue,
      this._sourceURI,
      this._destURI,
      this._peerPortId!,
      replyTo,
    ]
  }

  createSinkEndMessage(endOrError: pull.EndOrError, meta: MeshMeta = {}): MeshCmdSinkEnd {
    return [
      uid(),
      meta,
      MeshDataCmd.SinkEnd,
      this._sourceURI,
      this._destURI,
      this._portId,
      endOrError,
    ]
  }
  postToMesh(message: MeshData) {
    this._logger.debug('post to mesh: %4O', message)
    // 这里要改
    // tslint:disable-next-line no-floating-promises
    this._node.broadcast(message, this as any)
  }

  end(end?: pull.EndOrError) {
    this._innerDuplex.end(end)
  }

  abort(abort?: pull.EndOrError) {
    this._innerDuplex.abort(abort)
  }

  process(message: MeshData) {
    let processed = false
    let replyTo
    let destURI
    let req
    let res
    let abort
    let peerPortId

    const emitConnect = () => {
      if (!this._connectEventHasEmitted) {
        this._connectEventHasEmitted = true
        this.emit('connect')
      }
    }

    const startInternalSinkRead = () => {
      if (!this._innerDuplex.readStarted) {
        this._innerDuplex.startReading()
      }
    }

    switch (message[MeshDataIndex.Cmd]) {
      case MeshDataCmd.Open:
        req = message as MeshCmdOpen
        destURI = message[MeshCmdOpenIndex.DestURI]
        abort = req[MeshCmdOpenIndex.Abort]
        peerPortId = req[MeshCmdOpenIndex.PortId]
        if (destURI === this._sourceURI) {
          if (this.peerPortId === null) {
            this.peerPortId = peerPortId
          }
          if (this.peerPortId === peerPortId) {
            this.processMeta(req[MeshCmdOpenIndex.Meta])
            this._logger.debug('recv readMesh: cmd(%s) %4O', message[MeshDataIndex.Cmd], message)
            emitConnect()
            replyTo = req[MeshDataIndex.Id]
            if (abort) {
              this._meshReadMan.addRequestAbort(replyTo, abort)
              this._innerDuplex.abortSink(abort)
            } else {
              this._meshReadMan.addRequest(replyTo)
              startInternalSinkRead()
            }
            processed = true
          }
        }
        break

      case MeshDataCmd.Req:
        req = message as MeshCmdRequest
        destURI = message[MeshCmdReqIndex.DestURI]
        abort = req[MeshCmdReqIndex.Abort]
        peerPortId = req[MeshCmdReqIndex.PortId]
        if (destURI === this._sourceURI) {
          if (this.peerPortId === peerPortId) {
            this.processMeta(req[MeshCmdOpenIndex.Meta])
            this._logger.debug('recv readMesh: cmd(%s) %4O', message[MeshDataIndex.Cmd], message)
            emitConnect()
            replyTo = req[MeshDataIndex.Id]
            if (abort) {
              this._meshReadMan.addRequestAbort(replyTo, abort)
              this._innerDuplex.abortSink(abort)
            } else {
              this._meshReadMan.addRequest(replyTo)
              startInternalSinkRead()
            }
            processed = true
          }
        }
        break
      case MeshDataCmd.Res:
        res = message as MeshCmdResponse
        processed = this._readMeshMan.processRes(res)
        if (processed) {
          emitConnect()
        }
        break
      case MeshDataCmd.End:
        res = message as MeshCmdEnd
        processed = this._readMeshMan.processEnd(res)
        if (processed) {
          emitConnect()
        }
        break
      case MeshDataCmd.Continue:
        res = message as MeshCmdContinue
        processed = this._readMeshMan.processContinue(res)
        if (processed) {
          emitConnect()
        }
        break
      case MeshDataCmd.SinkEnd:
        res = message as MeshCmdSinkEnd

        destURI = res[MeshCmdSinkEndIndex.DestURI]
        peerPortId = message[MeshCmdSinkEndIndex.PortId]
        // We may receive SinkEnd before we have peerPortId?
        if (destURI === this._sourceURI && peerPortId === this._peerPortId) {
          processed = this._readMeshMan.processSinkEnd(res)
        }
        break
      default:
        throw new Error(`unknown message: ${JSON.stringify(message)}`)
    }
    return processed
  }

  private processMeta(meta: MeshMeta) {
    const continueInterval = meta?.cont
    if (continueInterval) {
      this._continueInterval = continueInterval
    }
  }

  private onReceived(data: Out, cb: OnReceivedCallback) {
    this.logger.debug('portSink received data from extSource then forward to mesh:', { data })
    this._meshReadMan.push(data, (end) => {
      this.logger.log('portSink forward("%o") to mesh called-back', data, { end })
      setImmediate(cb, end)
    })
  }

  private onRead(cb: OnReadCallback<In, number>, state?: number) {
    this.logger.debug('portSource got read request from extSink then asks the mesh:', { state })
    this._readMeshMan.request(state === 0, (err, data?: In) => {
      this.logger.log('portSource got data from mesh then called-back to extSink:', {
        err,
        data,
        state,
      })
      cb(err, data, state! + 1)
    })
  }

  private onReadAbort(err: pull.Abort, cb: OnReadAbortCallback<number>, state?: number) {
    this.logger.debug('extSink read(abort):', { state })
    this._readMeshMan.requestAbort(state === 0, err, () => {
      this.logger.log('extSink read(abort) called-back:', { err, state })
      cb(state! + 1)
    })
  }

  private onRawReadEnd(end: pull.EndOrError, cb: OnRawReadCallback) {
    this.logger.log('portSink received end from extSource then end up all readMesh in hand:', {
      end,
    })
    this._meshReadMan.readEnd(end, () => {
      cb()
    })
  }

  private finish() {
    if (
      this._innerDuplexFinished &&
      this._readMeshMan.finished &&
      (!this._meshReadMan.started || this._meshReadMan.finished)
    ) {
      this.logger.log('portStream finished:')
      this.emit('close')
      // tslint:disable-next-line no-floating-promises
      this._node.removePortStream(this)
    }
  }
}
