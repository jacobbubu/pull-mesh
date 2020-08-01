import * as pull from 'pull-stream'
import { Debug } from '@jacobbubu/debug'
import { MeshStream } from './mesh-stream'
import {
  MeshNode,
  MeshData,
  MeshDataIndex,
  MeshCmdPing,
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
  MeshCmdPingIndex,
} from '../mesh-node'
import { uid } from '../utils'
import { ReadMesh } from './read-mesh'
import { SourceMan } from './source-man'
import { SinkMan } from './sink-man'
import { TouchMan } from './touch-man'

export interface PortStreamOptions {
  pingInterval: number
  connectionTimeout: number
}

export class PortStream<T> extends MeshStream<T> {
  private _pingInterval: number
  private _connectionTimeout: number

  private _isFirstRead: boolean = true
  private _sourceMan = new SourceMan<T>(this)
  private _sinkMan: SinkMan<T>
  private _readMeshMap: Record<Id, ReadMesh<T>> = {}
  private _sendTouch: TouchMan
  private _recvTouch: TouchMan

  protected _logger: Debug
  protected _node: MeshNode
  protected _source: pull.Source<T> | null = null
  protected _sink: pull.Sink<T> | null = null
  protected _sourceEnd: pull.Abort | null = null
  protected _sinkEnd: pull.EndOrError | null = null

  public kind = 'PORT'

  constructor(
    private readonly _sourceURI: string,
    private readonly _destURI: string,
    node: MeshNode,
    opts: Partial<PortStreamOptions> = {}
  ) {
    super()
    this._node = node
    this._pingInterval = opts.pingInterval ?? 20e3
    this._connectionTimeout = opts.connectionTimeout ?? 30e3

    this._logger = node.logger.ns(this._sourceURI)

    this._sinkMan = new SinkMan(this)

    this._sendTouch = new TouchMan(() => {
      this._logger.debug('ping')
      this.postToMesh(this.createPingMessage())
    }, this._pingInterval)

    this._recvTouch = new TouchMan(() => {
      this._logger.debug('connection timed-out')
      this._sendTouch.stop()
      this._recvTouch.stop()
      const end = new Error(`readMesh exceeds read timeout`)
      this.abortAllReadMesh(end)
      this._sinkMan.abort(end)
      this._sourceEnd = end
    }, this._connectionTimeout)
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

  createPingMessage(): MeshCmdPing {
    return [uid(), MeshDataCmd.Ping, this._destURI]
  }

  postToMesh(message: MeshData) {
    this._logger.debug('post to mesh: %4O', message)
    this._sendTouch.touch()
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
          } else {
            this._recvTouch.touch()
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
          this._recvTouch.touch()
          readMesh.res(res)
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
      case MeshDataCmd.Ping:
        destURI = message[MeshCmdPingIndex.DestURI]
        if (destURI === this._sourceURI) {
          this._logger.debug('recv ping')
          this._recvTouch.touch()
          processed = true
        }
        break
      default:
        throw new Error(`unknown message: ${JSON.stringify(message)}`)
    }
    return processed
  }

  private abortAllReadMesh(abort: pull.Abort) {
    const keys = Object.keys(this._readMeshMap)
    for (let key in this._readMeshMap) {
      const readMesh = this._readMeshMap[key]
      readMesh.abort(abort)
    }
  }

  protected finish() {
    if (!this._finished && this._sourceEnd && this._sinkEnd) {
      this._logger.log('stream finished')
      this._finished = true
      this._node.removePortStream(this)
    }
  }
}
