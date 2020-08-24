import * as pull from '@jacobbubu/pull-stream'
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
  MeshDataCmd,
  MeshCmdContinue,
  Id,
  ReplyId,
  PortId,
  MeshCmdOpenIndex,
  MeshCmdReqIndex,
  MeshCmdResIndex,
  MeshCmdContinueIndex,
  MeshCmdEndIndex,
  MeshCmdSinkEndIndex,
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
  private _readMeshMap: Map<Id, ReadMesh<T>> = new Map()

  private readonly _portId = uid()
  private _peerPortId: PortId | null = null

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

  get destURI() {
    return this._destURI
  }

  get continueInterval() {
    return this._continueInterval
  }

  get readTimeout() {
    return this._readTimeout
  }

  get portId() {
    return this._portId
  }

  get peerPortId() {
    return this._peerPortId
  }

  createOpenMessage(abort: pull.Abort, id: Id): MeshCmdOpen {
    return [id, MeshDataCmd.Open, this._sourceURI, this._destURI, this._portId, abort]
  }

  createReqMessage(abort: pull.Abort, id: Id): MeshCmdRequest {
    return [id, MeshDataCmd.Req, this._destURI, this._peerPortId!, abort]
  }

  createEndMessage(replyTo: ReplyId, endOrError: pull.EndOrError): MeshCmdEnd {
    return [uid(), MeshDataCmd.End, this._destURI, this._peerPortId!, replyTo, endOrError]
  }

  createSinkEndMessage(endOrError: pull.EndOrError): MeshCmdSinkEnd {
    return [uid(), MeshDataCmd.SinkEnd, this._destURI, this._peerPortId!, endOrError]
  }

  createResMessage(replyTo: ReplyId, dataList: any[]): MeshCmdResponse {
    return [uid(), MeshDataCmd.Res, this._sourceURI, this._peerPortId!, replyTo, dataList]
  }

  createContinueMessage(replyTo: ReplyId): MeshCmdContinue {
    return [uid(), MeshDataCmd.Continue, this._sourceURI, this._peerPortId!, replyTo]
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
            self._readMeshMap.delete(id)
          })
          self._readMeshMap.set(readMesh.id, readMesh)
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
            self._sourceMan.pushList(dataList!)
          }
        })

        self._readMeshMap.set(readMesh.id, readMesh)
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

  sinkEnds(endOrError: pull.EndOrError = true) {
    this.postToMesh(this.createSinkEndMessage(endOrError))
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
    let portId

    switch (message[MeshDataIndex.Cmd]) {
      case MeshDataCmd.Open:
      case MeshDataCmd.Req:
        cmd = message[MeshDataIndex.Cmd]

        if (cmd === MeshDataCmd.Open) {
          req = message as MeshCmdOpen
          destURI = message[MeshCmdOpenIndex.DestURI]
          abort = req[MeshCmdOpenIndex.Abort]
          portId = req[MeshCmdOpenIndex.PortId]
          matched = !this._peerPortId && portId !== this._portId && destURI === this._sourceURI
          if (matched) {
            this._peerPortId = this._peerPortId ?? portId
          }
        } else {
          req = message as MeshCmdRequest
          portId = req[MeshCmdReqIndex.PeerPortId]
          destURI = message[MeshCmdReqIndex.DestURI]
          abort = req[MeshCmdReqIndex.Abort]
          matched = portId === this._portId
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
        portId = res[MeshCmdResIndex.PeerPortId]
        replyTo = res[MeshCmdResIndex.ReplyId]
        readMesh = this._readMeshMap.get(replyTo)
        if (portId === this._portId && readMesh) {
          this._logger.debug('recv response: %4O', message)
          readMesh.res(res)
          processed = true
        }
        break
      case MeshDataCmd.Continue:
        res = message as MeshCmdContinue
        portId = res[MeshCmdContinueIndex.PeerPortId]
        replyTo = res[MeshCmdContinueIndex.ReplyId]
        readMesh = this._readMeshMap.get(replyTo)
        if (portId === this._portId && readMesh) {
          this._logger.debug('recv continue: %4O', message)
          readMesh.continue(res)
          processed = true
        }
        break
      case MeshDataCmd.End:
        res = message as MeshCmdEnd
        portId = res[MeshCmdEndIndex.PeerPortId]
        replyTo = res[MeshCmdEndIndex.ReplyId]
        readMesh = this._readMeshMap.get(replyTo)
        if (portId === this._portId && readMesh) {
          this._logger.debug('recv end: %4O', message)
          readMesh.end(res)
          processed = true
        }
        break
      case MeshDataCmd.SinkEnd:
        res = message as MeshCmdSinkEnd
        portId = res[MeshCmdSinkEndIndex.PeerPortId]
        if (portId === this._portId) {
          this._logger.debug('recv sinkEnd: %4O', message)
          this._readMeshMap.forEach((readMesh) => readMesh.sinkEnd(message as MeshCmdSinkEnd))
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
