import * as pull from 'pull-stream'
import { MeshStream } from './mesh-stream'
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
  MeshCmdResIndex,
  MeshCmdContinueIndex,
  MeshCmdEndIndex,
  MeshCmdSinkEndIndex,
} from '../mesh-node'
import { uid } from '../utils'
import { ReadMesh } from './read-mesh'
import { SourceMan } from './source-man'
import { SinkMan } from './sink-man'
import { assert } from 'console'

export interface PortStreamOptions {
  continueInterval: number
  readTimeout: number
}

export class PortStream<T> extends MeshStream<T> {
  private _continueInterval: number
  private _readTimeout: number

  private _isFirstRead: boolean = true
  private _remoteSinkEnd = false
  private _sourceMan = new SourceMan<T>(this)
  private _sinkMan: SinkMan<T>
  private _readMeshMap: Map<Id, ReadMesh<T>> = new Map()
  private _portId: PortId
  private _peerPortId: PeerPortId | null = null
  private _opened = false

  public kind = 'PORT'

  constructor(
    private readonly _sourceURI: string,
    private readonly _destURI: string,
    node: MeshNode,
    opts: Partial<PortStreamOptions> = {}
  ) {
    super(node)
    this._portId = node.getNextPortStreamCounter().toString()
    this._continueInterval = opts.continueInterval ?? 10e3
    this._readTimeout = opts.readTimeout ?? 15e3

    this._logger = node.logger.ns(this._sourceURI).ns(this._portId)

    this._sinkMan = new SinkMan(this)
  }

  get name() {
    return this._sourceURI
  }

  get node() {
    return this._node
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

  createOpenMessage(abort: pull.Abort, id: Id): MeshCmdOpen {
    return [id, MeshDataCmd.Open, this._sourceURI, this._destURI, this._portId, abort]
  }

  createReqMessage(abort: pull.Abort, id: Id): MeshCmdRequest {
    return [id, MeshDataCmd.Req, this._sourceURI, this._destURI, this._portId, abort]
  }

  createResMessage(replyTo: ReplyId, dataList: any[]): MeshCmdResponse {
    return [
      uid(),
      MeshDataCmd.Res,
      this._sourceURI,
      this._destURI,
      this._peerPortId!,
      replyTo,
      dataList,
    ]
  }

  createEndMessage(replyTo: ReplyId, endOrError: pull.EndOrError): MeshCmdEnd {
    return [
      uid(),
      MeshDataCmd.End,
      this._sourceURI,
      this._destURI,
      this._peerPortId!,
      replyTo,
      endOrError,
    ]
  }

  createSinkEndMessage(endOrError: pull.EndOrError): MeshCmdSinkEnd {
    return [uid(), MeshDataCmd.SinkEnd, this._sourceURI, this._destURI, this._portId, endOrError]
  }

  createContinueMessage(replyTo: ReplyId): MeshCmdContinue {
    return [uid(), MeshDataCmd.Continue, this._sourceURI, this._destURI, this._portId, replyTo]
  }

  postToMesh(message: MeshData) {
    this._logger.debug('post to mesh: %4O', message)
    // tslint:disable-next-line no-floating-promises
    this._node.broadcast(message, this)
  }

  get source() {
    if (!this._source) {
      const self = this

      this._source = function (abort: pull.Abort, cb: pull.SourceCallback<T>) {
        if (self._remoteSinkEnd) {
          cb(self._remoteSinkEnd)
          self._sourceEnd = self._remoteSinkEnd
          self.finish()
          return
        }

        const isFirstRead = self._isFirstRead
        self._isFirstRead = false

        if (abort) {
          // send abort message to mesh and ignore the result
          const readMesh = ReadMesh.createAbort(self, (id) => {
            self._readMeshMap.delete(id)
          })
          self._readMeshMap.set(readMesh.id, readMesh)
          readMesh.postToMesh(isFirstRead, abort)
          self._sourceMan.abort(abort)
          self._sourceEnd = abort
          self.finish()
          return
        }

        // return if current cb has been satisfied
        if (self._sourceMan.addCb(cb)) {
          self.createReadMesh(isFirstRead)
        }
      }
    }
    return this._source
  }

  get sink() {
    if (!this._sink) {
      this._sink = (rawRead: pull.Source<T>) => this._sinkMan.addRead(rawRead)
    }
    return this._sink
  }

  sinkEnds(endOrError: pull.EndOrError = true) {
    if (!this._sinkEnd) {
      this.postToMesh(this.createSinkEndMessage(endOrError))
      this._sinkEnd = true
      this.finish()
    }
  }

  remoteSinkEnds(message: MeshCmdSinkEnd) {
    if (!this._remoteSinkEnd) {
      this._readMeshMap.forEach((readMesh) => readMesh.sinkEnd(message))
      this._remoteSinkEnd = true
    }
  }

  // process incoming message
  process(message: MeshData) {
    let processed = false
    let replyTo
    let readMesh
    let destURI
    let req
    let res
    let cmd
    let abort
    let matched
    let portId
    let peerPortId

    switch (message[MeshDataIndex.Cmd]) {
      case MeshDataCmd.Open:
        if (this._opened) return false

        req = message as MeshCmdOpen
        destURI = message[MeshCmdOpenIndex.DestURI]
        abort = req[MeshCmdOpenIndex.Abort]
        if (destURI === this._sourceURI) {
          this._opened = true
          peerPortId = req[MeshCmdOpenIndex.PortId]
          if (!this._peerPortId) this._peerPortId = peerPortId

          this._logger.debug('recv readMesh: cmd(%s) %4O', message[MeshDataIndex.Cmd], message)
          replyTo = req[MeshDataIndex.Id]
          if (abort) {
            this._sinkMan.abort(abort)
          }
          this._sinkMan.addReadMesh({ replyTo })
          processed = true
        }
        break

      case MeshDataCmd.Req:
        req = message as MeshCmdRequest
        destURI = message[MeshCmdReqIndex.DestURI]
        abort = req[MeshCmdReqIndex.Abort]
        peerPortId = req[MeshCmdReqIndex.PortId]
        if (destURI === this._sourceURI) {
          if (peerPortId === this._peerPortId) {
            this._logger.debug('recv readMesh: cmd(%s) %4O', message[MeshDataIndex.Cmd], message)
            replyTo = req[MeshDataIndex.Id]
            if (abort) {
              this._sinkMan.abort(abort)
            }
            this._sinkMan.addReadMesh({ replyTo })
            processed = true
          }
        }
        break
      case MeshDataCmd.Res:
        res = message as MeshCmdResponse
        replyTo = res[MeshCmdResIndex.ReplyId]
        readMesh = this._readMeshMap.get(replyTo)
        if (readMesh) {
          this._logger.debug('recv response: %4O', message)
          readMesh.res(res)
          processed = true
        }
        break
      case MeshDataCmd.End:
        res = message as MeshCmdEnd
        replyTo = res[MeshCmdEndIndex.ReplyId]
        readMesh = this._readMeshMap.get(replyTo)
        if (readMesh) {
          this._logger.debug('recv end: %4O', message)
          readMesh.end(res)
          processed = true
        }
        break
      case MeshDataCmd.Continue:
        res = message as MeshCmdContinue
        replyTo = res[MeshCmdContinueIndex.ReplyId]
        readMesh = this._readMeshMap.get(replyTo)
        if (readMesh) {
          this._logger.debug('recv continue: %4O', message)
          readMesh.continue(res)
          processed = true
        }
        break
      case MeshDataCmd.SinkEnd:
        res = message as MeshCmdSinkEnd
        destURI = res[MeshCmdSinkEndIndex.DestURI]
        peerPortId = message[MeshCmdSinkEndIndex.PortId]
        // We may receive SinkEnd before we have peerPortId?
        if (peerPortId === this._peerPortId) {
          if (destURI === this._sourceURI) {
            this._logger.debug('recv sinkEnd: %4O', this._readMeshMap.size, message)
            this.remoteSinkEnds(res)
            processed = true
          }
        }
        break
      default:
        throw new Error(`unknown message: ${JSON.stringify(message)}`)
    }
    return processed
  }

  protected finish() {
    if (!this._finished && this._sourceEnd && this._sinkEnd) {
      this._logger.log('stream finished')
      this._finished = true
      // tslint:disable-next-line no-floating-promises
      this._node.removePortStream(this)
    }
  }

  private createReadMesh(isFirstRead: boolean) {
    const self = this
    const readMesh = ReadMesh.create(this, function next(id, endOrError, dataList) {
      self._readMeshMap.delete(id)

      if (endOrError) {
        self._logger.log('sourceMan end', endOrError)
        self._sourceMan.end(endOrError)
        self._sourceEnd = endOrError
        if (endOrError instanceof Error) {
          self._sinkMan.abort(endOrError)
        }
        self.finish()
      } else {
        if (self._sourceMan.pushList(dataList!)) {
          self.createReadMesh(false)
        }
      }
    })

    this._readMeshMap.set(readMesh.id, readMesh)
    readMesh.postToMesh(isFirstRead)
  }
}
