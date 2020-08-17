import * as pull from '@jacobbubu/pull-stream'
import { MeshStream } from './mesh-stream'
import {
  MeshNode,
  MeshData,
  MeshDataIndex,
  MeshCmdEnd,
  MeshCmdResponse,
  MeshCmdRequest,
  MeshCmdOpen,
  MeshDataCmd,
  Id,
  ReplyId,
  MeshCmdOpenIndex,
  MeshCmdReqIndex,
  MeshCmdResIndex,
  MeshCmdContinue,
  MeshCmdContinueIndex,
} from '../mesh-node'
import { uid } from '../utils'
import { ReadMesh } from './read-mesh'
import { SourceMan } from './source-man'
import { SinkMan } from './sink-man'

export interface PortStreamOptions {
  continueInterval: number
  readTimeout: number
}

export class PortStream<T> extends MeshStream<T> {
  private _continueInterval: number
  private _readTimeout: number

  private _isFirstRead: boolean = true
  private _sourceMan = new SourceMan<T>(this)
  private _sinkMan: SinkMan<T>
  private _readMeshMap: Record<Id, ReadMesh<T>> = {}

  public kind = 'PORT'

  constructor(
    private readonly _sourceURI: string,
    private readonly _destURI: string,
    node: MeshNode,
    opts: Partial<PortStreamOptions> = {}
  ) {
    super(node)
    this._continueInterval = opts.continueInterval ?? 10e3
    this._readTimeout = opts.readTimeout ?? 15e3

    this._logger = node.logger.ns(this._sourceURI)

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
    return [id, MeshDataCmd.Open, this._sourceURI, this._destURI, abort]
  }

  createReqMessage(abort: pull.Abort, id: Id): MeshCmdRequest {
    return [id, MeshDataCmd.Req, this._destURI, abort]
  }

  createEndMessage(replyTo: ReplyId, endOrError: pull.EndOrError): MeshCmdEnd {
    return [uid(), MeshDataCmd.End, this._destURI, replyTo, endOrError]
  }

  createResMessage(replyTo: ReplyId, dataList: any[]): MeshCmdResponse {
    return [uid(), MeshDataCmd.Res, this._sourceURI, replyTo, dataList]
  }

  createContinueMessage(replyTo: ReplyId): MeshCmdContinue {
    return [uid(), MeshDataCmd.Continue, this._sourceURI, replyTo]
  }

  postToMesh(message: MeshData) {
    this._logger.debug('post to mesh: %4O', message)
    this._node.broadcast(message, this)
  }

  get source() {
    if (!this._source) {
      const self = this
      this._source = function (abort: pull.Abort, cb: pull.SourceCallback<T>) {
        if (abort) {
          // send abort message to mesh and ignore the result
          const readMesh = ReadMesh.createAbort(self, (id) => {
            delete self._readMeshMap[id]
          })
          self._readMeshMap[readMesh.id] = readMesh
          readMesh.postToMesh(self._isFirstRead, abort)
          self._isFirstRead = false
          self._sourceMan.abort(abort)
          self._sourceEnd = abort
          self.finish()
          return
        }

        // return if current cb has been satisfied
        if (self._sourceMan.addCb(cb)) return

        const readMesh = ReadMesh.create(self, function next(id, endOrError, dataList) {
          delete self._readMeshMap[id]
          if (endOrError) {
            self._logger.log('sourceMan end', endOrError)
            self._sourceMan.end(endOrError)
            self._sourceEnd = endOrError
            self.finish()
          } else {
            self._sourceMan.pushList(dataList!)
          }
        })

        self._readMeshMap[readMesh.id] = readMesh
        readMesh.postToMesh(self._isFirstRead)
        self._isFirstRead = false
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

  sinkEnds() {
    this._sinkEnd = true
    this.finish()
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

    switch (message[MeshDataIndex.Cmd]) {
      case MeshDataCmd.Open:
      case MeshDataCmd.Req:
        cmd = message[MeshDataIndex.Cmd]
        if (cmd === MeshDataCmd.Open) {
          req = message as MeshCmdOpen
          destURI = message[MeshCmdOpenIndex.DestURI]
          abort = req[MeshCmdOpenIndex.Abort]
          matched = destURI === this._sourceURI
        } else {
          req = message as MeshCmdRequest
          destURI = message[MeshCmdReqIndex.DestURI]
          abort = req[MeshCmdReqIndex.Abort]
          matched = destURI === this._sourceURI
        }

        if (matched) {
          this._logger.debug('recv readMesh: cmd(%s) %4O', cmd, message)
          replyTo = req[MeshDataIndex.Id]
          if (abort) {
            this._sinkMan.abort(abort)
          }
          this._sinkMan.addReadMesh({ replyTo })
          processed = true
        }
        break
      case MeshDataCmd.Res:
        res = message as MeshCmdResponse
        replyTo = res[MeshCmdResIndex.ReplyId]
        readMesh = this._readMeshMap[replyTo]
        if (readMesh) {
          this._logger.debug('recv response: %4O', message)
          readMesh.res(res)
          processed = true
        }
        break
      case MeshDataCmd.Continue:
        res = message as MeshCmdContinue
        replyTo = res[MeshCmdContinueIndex.ReplyId]
        readMesh = this._readMeshMap[replyTo]
        if (readMesh) {
          this._logger.debug('recv continue: %4O', message)
          readMesh.continue(res)
          processed = true
        }
        break
      case MeshDataCmd.End:
        res = message as MeshCmdEnd
        replyTo = res[MeshCmdResIndex.ReplyId]
        readMesh = this._readMeshMap[replyTo]
        if (readMesh) {
          this._logger.debug('recv end: %4O', message)
          readMesh.end(res)
          processed = true
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
      this._node.removePortStream(this)
    }
  }
}
