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
import { Debug } from '@jacobbubu/debug'

export enum MeshDataIndex {
  Id = 0,
  Cmd,
}

export enum MeshCmdOpenIndex {
  Id = 0,
  Cmd,
  SourceURI,
  DestURI,
  Abort,
}

export enum MeshCmdReqIndex {
  Id = 0,
  Cmd,
  DestURI,
  Abort,
}

export enum MeshCmdResIndex {
  Id = 0,
  Cmd,
  SourceURI,
  ReplyId,
  Payload,
}

export enum MeshCmdEndIndex {
  Id = 0,
  Cmd,
  SourceURI,
  ReplyId,
  EndOrError,
}

export enum MeshCmdPingIndex {
  Id = 0,
  Cmd,
  DestURI,
}

export enum MeshDataCmd {
  Open = 'open',
  Req = 'req',
  Res = 'res',
  End = 'end',
  Ping = 'ping',
}

export type Id = string
export type ReplyId = Id
export type SourceURI = string
export type DestURI = string

export type MeshCmdOpen = [Id, MeshDataCmd.Open, SourceURI, DestURI, pull.Abort]
export type MeshCmdRequest = [Id, MeshDataCmd.Req, DestURI, pull.Abort]
export type MeshCmdResponse = [Id, MeshDataCmd.Res, SourceURI, ReplyId, any[]]
export type MeshCmdEnd = [Id, MeshDataCmd.End, SourceURI, ReplyId, pull.EndOrError]
export type MeshCmdPing = [Id, MeshDataCmd.Ping, DestURI]
export type MeshData = MeshCmdOpen | MeshCmdRequest | MeshCmdResponse | MeshCmdEnd | MeshCmdPing

function isOpenMessage(message: MeshData) {
  return message[MeshDataIndex.Cmd] === MeshDataCmd.Open
}

export interface OpenPortResult {
  stream: pull.Duplex<any, any>
  portOpts?: Partial<PortStreamOptions>
}
export type OnOpenPort = (sourceURI: SourceURI, destURI: DestURI) => OpenPortResult | void

export class MeshNode {
  private readonly _onOpenPort: OnOpenPort | null = null
  private readonly _name: string
  private readonly _dup: Dup = new Dup()
  private readonly _logger: Debug
  private readonly _relayStreams: RelayStream[] = []
  private readonly _portStreams: PortStream<any>[] = []

  constructor(onOpenPort?: OnOpenPort | null | string, nodeId?: string) {
    if (typeof onOpenPort === 'string') {
      this._onOpenPort = null
      this._name = onOpenPort ?? uid3()
    } else if (typeof onOpenPort === 'function') {
      this._onOpenPort = onOpenPort
      this._name = nodeId ?? uid3()
    } else {
      this._onOpenPort = null
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
    return stream
  }

  broadcast(message: MeshData, source: MeshStream<any>) {
    if (isOpenMessage(message) && this._onOpenPort) {
      this.openPort(message as MeshCmdOpen)
    }

    for (let i = 0; i < this._portStreams.length; i++) {
      const stream = this._portStreams[i]
      if (stream !== source && this._portStreams[i].process(message)) {
        return
      }
    }

    this._relayStreams.forEach((stream) => {
      if (stream !== source) {
        stream.forward(message)
      }
    })
  }

  openPort(message: MeshCmdOpen) {
    if (!this._onOpenPort) return false

    const sourceURI = message[MeshCmdOpenIndex.SourceURI]
    const destURI = message[MeshCmdOpenIndex.DestURI]

    const result = this._onOpenPort(sourceURI, destURI)
    if (!result) return false

    const { stream, portOpts } = result
    const port = this.createPortStream(destURI, sourceURI, portOpts)
    pull(port, stream, port)
    return true
  }

  removePortStream(stream: PortStream<any>) {
    const pos = this._portStreams.indexOf(stream)
    if (pos >= 0) {
      this._portStreams.splice(pos, 1)
      return true
    }
    return false
  }

  removeRelayStream(stream: RelayStream) {
    const pos = this._relayStreams.indexOf(stream)
    if (pos >= 0) {
      this._relayStreams.splice(pos, 1)
      return true
    }
    return false
  }
}
