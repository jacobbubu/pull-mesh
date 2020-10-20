import * as pull from 'pull-stream'
import { Dup } from './dup'
import { uid3 } from './utils'
import {
  RelayStream,
  RelayStreamOptions,
  PortStream,
  PortStreamOptions,
  MeshStream,
} from './mesh-stream'
import AsyncLock = require('async-lock')
import { Debug } from '@jacobbubu/debug'

export enum MeshDataIndex {
  Id = 0,
  Cmd,
  SourceURI,
  DestURI,
}

export enum MeshCmdOpenIndex {
  Id = 0,
  Cmd,
  SourceURI,
  DestURI,
  PortId,
  Abort,
}

export enum MeshCmdReqIndex {
  Id = 0,
  Cmd,
  SourceURI,
  DestURI,
  PortId,
  Abort,
}

export enum MeshCmdResIndex {
  Id = 0,
  Cmd,
  SourceURI,
  DestURI,
  PeerPortId,
  ReplyId,
  Payload,
}

export enum MeshCmdEndIndex {
  Id = 0,
  Cmd,
  SourceURI,
  DestURI,
  PeerPortId,
  ReplyId,
  EndOrError,
}

export enum MeshCmdContinueIndex {
  Id = 0,
  Cmd,
  SourceURI,
  DestURI,
  PortId,
  ReplyId,
}

export enum MeshCmdSinkEndIndex {
  Id = 0,
  Cmd,
  SourceURI,
  DestURI,
  PortId,
  EndOrError,
}

export enum MeshDataCmd {
  Open = 'open',
  Req = 'req',
  Res = 'res',
  Continue = 'con',
  End = 'end',
  SinkEnd = 'sinkEnd',
}

export type Id = string
export type ReplyId = Id
export type PortId = Id
export type PeerPortId = Id
export type SourceURI = string
export type DestURI = string

export type MeshCmdOpen = [Id, MeshDataCmd.Open, SourceURI, DestURI, PortId, pull.Abort]
export type MeshCmdRequest = [Id, MeshDataCmd.Req, SourceURI, DestURI, PortId, pull.Abort]
export type MeshCmdResponse = [Id, MeshDataCmd.Res, SourceURI, DestURI, PeerPortId, ReplyId, any[]]
export type MeshCmdContinue = [Id, MeshDataCmd.Continue, SourceURI, DestURI, PortId, ReplyId]
export type MeshCmdEnd = [
  Id,
  MeshDataCmd.End,
  SourceURI,
  DestURI,
  PeerPortId,
  ReplyId,
  pull.EndOrError
]
export type MeshCmdSinkEnd = [Id, MeshDataCmd.SinkEnd, SourceURI, DestURI, PortId, pull.EndOrError]

export type MeshData =
  | MeshCmdOpen
  | MeshCmdRequest
  | MeshCmdResponse
  | MeshCmdContinue
  | MeshCmdEnd
  | MeshCmdSinkEnd

export interface OpenPortResult {
  stream: pull.Duplex<any, any>
  portOpts?: Partial<PortStreamOptions>
}
export type OnOpenPort = (
  sourceURI: SourceURI,
  destURI: DestURI
) => Promise<OpenPortResult | void> | OpenPortResult | void

const LockName = 'PortStreamList'

export class MeshNode {
  private readonly _onOpenPortHooks: OnOpenPort[] = []
  private readonly _name: string
  private readonly _dup: Dup = new Dup()
  private readonly _logger: Debug
  private readonly _relayStreams: RelayStream[] = []
  private readonly _portStreams: PortStream<any>[] = []
  private _portStreamCounter = 0
  private _lock: AsyncLock = new AsyncLock()

  constructor(onOpenPort?: OnOpenPort | null | string, nodeId?: string) {
    if (typeof onOpenPort === 'string') {
      this._name = onOpenPort ?? uid3()
    } else if (typeof onOpenPort === 'function') {
      this._onOpenPortHooks.push(onOpenPort)
      this._name = nodeId ?? uid3()
    } else {
      this._name = nodeId ?? uid3()
    }
    this._logger = Debug.create('mesh').ns(this._name)
  }

  get dup() {
    return this._dup
  }

  get logger() {
    return this._logger
  }

  get name() {
    return this._name
  }

  get portStreamsLength() {
    return this._portStreams.length
  }

  get relayStreamsLength() {
    return this._relayStreams.length
  }

  get portStreams() {
    return this._portStreams as ReadonlyArray<PortStream<any>>
  }

  get onOpenPortHooks() {
    return this._onOpenPortHooks
  }

  getNextPortStreamCounter() {
    return this._portStreamCounter++
  }

  createPortStream<T>(sourceURI: string, destURI: string, opts?: Partial<PortStreamOptions>) {
    const stream = new PortStream<T>(sourceURI, destURI, this, opts)
    this._portStreams.push(stream)
    return stream
  }

  createRelayStream(opts?: Partial<RelayStreamOptions> | string) {
    let t: Partial<RelayStreamOptions> | undefined = undefined
    if (typeof opts === 'string') {
      t = { name: opts }
    } else {
      t = opts
    }
    const stream = new RelayStream(this, t)
    this._relayStreams.push(stream)
    this.sortRelayStreams()
    return stream
  }

  async broadcast(message: MeshData, source: MeshStream<any>) {
    return this._lock.acquire(LockName, async () => {
      if (this.isNewOpenMessage(message) && this._onOpenPortHooks.length > 0) {
        await this.openPort(message as MeshCmdOpen)
      }

      for (let i = 0; i < this._portStreams.length; i++) {
        const stream = this._portStreams[i]
        if (stream !== source && this._portStreams[i].process(message)) {
          return
        }
      }

      this._relayStreams.forEach((stream) => {
        if (stream !== source) {
          if (stream.outgoingFilter) {
            if (stream.outgoingFilter(message)) {
              stream.forward(message)
            }
          } else {
            stream.forward(message)
          }
        }
      })
    })
  }

  removePortStream(stream: PortStream<any>) {
    return this._lock.acquire(LockName, async () => {
      const pos = this._portStreams.indexOf(stream)
      if (pos >= 0) {
        this._portStreams.splice(pos, 1)
        return true
      }
      return false
    })
  }

  removeRelayStream(stream: RelayStream) {
    const pos = this._relayStreams.indexOf(stream)
    if (pos >= 0) {
      this._relayStreams.splice(pos, 1)
      return true
    }
    return false
  }

  addOpenPortHook(hook: OnOpenPort) {
    if (this._onOpenPortHooks.indexOf(hook) < 0) {
      this._onOpenPortHooks.push(hook)
    }
  }

  private async openPort(message: MeshCmdOpen) {
    const sourceURI = message[MeshCmdOpenIndex.SourceURI]
    const destURI = message[MeshCmdOpenIndex.DestURI]

    for (let i = 0; i < this._onOpenPortHooks.length; i++) {
      const result = await this._onOpenPortHooks[i](sourceURI, destURI)
      if (result) {
        const { stream, portOpts } = result
        const port = this.createPortStream(destURI, sourceURI, portOpts)
        pull(port, stream, port)
        return true
      }
    }
    return false
  }

  private sortRelayStreams() {
    this._relayStreams.sort((a, b) => {
      if (a.priority < b.priority) {
        return -1
      } else if (a.priority > b.priority) {
        return 1
      } else {
        return 0
      }
    })
  }

  private isNewOpenMessage(message: MeshData) {
    if (message[MeshDataIndex.Cmd] !== MeshDataCmd.Open) return false

    const destURI = message[MeshDataIndex.DestURI]
    const portId = (message as MeshCmdOpen)[MeshCmdOpenIndex.PortId]
    for (let i = 0; i < this._portStreams.length; i++) {
      const portStream = this._portStreams[i]
      if (destURI === portStream.sourceURI && portId === portStream.peerPortId) {
        return false
      }
    }
    return true
  }
}
