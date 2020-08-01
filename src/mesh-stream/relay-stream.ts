import * as pull from 'pull-stream'
import { pushable, Read } from '@jacobbubu/pull-pushable'
import { Debug } from '@jacobbubu/debug'
import { MeshStream } from './mesh-stream'
import {
  MeshNode,
  MeshData,
  MeshDataIndex,
  MeshDataCmd,
  MeshCmdOpen,
  MeshCmdRequest,
  MeshCmdResponse,
  MeshCmdEnd,
  MeshCmdOpenIndex,
  MeshCmdReqIndex,
  MeshCmdResIndex,
  MeshCmdPing,
} from '../mesh-node'
import { uid2, escapeRegExp } from '../utils'

export type RelayContext = Record<string, any>
export type FilterFunc = (message: MeshData) => boolean
export type VarsType = Record<string, string>

export interface RelayStreamOptions {
  name: string
  priority: number
  isDictator: boolean
  vars: VarsType
  filter: (message: MeshData) => boolean
}

type Replacer = [RegExp, string][]

export class RelayStream extends MeshStream<MeshData> {
  protected _logger: Debug
  protected _node: MeshNode
  protected _source: pull.Source<MeshData> | null = null
  protected _sink: pull.Sink<MeshData> | null = null
  protected _sourceEnd: pull.Abort | null = null
  protected _sinkEnd: pull.EndOrError | null = null

  private _name: string
  private _filter: FilterFunc | null
  private _vars: VarsType
  private _priority: number
  private _isDictator: boolean
  private _isFirstRead = true
  private _replacer: Replacer = []
  private _reversed: Replacer = []

  public kind = 'RELAY'

  constructor(node: MeshNode, private readonly _opts: Partial<RelayStreamOptions> = {}) {
    super()
    this._node = node
    this._name = _opts.name ?? uid2()
    this._filter = _opts.filter ?? null
    this._vars = _opts.vars ?? {}
    this._priority = _opts.priority ?? 100
    this._isDictator = _opts.isDictator ?? false
    this._logger = node.logger.ns(`*${this._name}`)
  }

  get name() {
    return this._name
  }

  get node() {
    return this._node
  }

  get priority() {
    return this._priority
  }

  get source() {
    if (!this._source) {
      this._source = pushable(() => {
        this._sourceEnd = true
        this.finish()
      })
      ;(this._source as Read<RelayContext>).push(this._vars)
    }
    return this._source
  }

  get sink() {
    if (!this._sink) {
      const self = this
      this._sink = function (rawRead: pull.Source<MeshData>) {
        rawRead(self._sourceEnd, function next(
          endOrError: pull.EndOrError,
          data?: MeshData | RelayContext
        ) {
          const isFirstRead = self._isFirstRead
          if (self._isFirstRead) self._isFirstRead = false

          if (endOrError) {
            self._sinkEnd = true
            if (!self._sourceEnd && self._source) {
              ;(self._source as Read<MeshData>).end()
            }
            self.finish()
            return
          }
          if (isFirstRead) {
            const peerVars = data as VarsType

            const vars = { ...self._vars, ...peerVars }
            const replacers = toReplacer(vars)
            self._replacer = replacers.replacer
            self._reversed = replacers.reversed
            self._logger.log('replacer:', self._replacer)
          } else {
            const message = data as MeshData
            const { dup } = self._node
            const id = message[MeshDataIndex.Id]
            if (!dup.check(id)) {
              dup.track(id)
              self._node.broadcast(self.preBroadcast(message), self)
            } else {
              self._logger.log('ignore duplicated message', message)
            }
          }
          rawRead(self._sourceEnd, next)
        })
      }
    }
    return this._sink
  }

  forward(message: MeshData) {
    ;(this.source as Read<MeshData>).push(this.preForward(message))
  }

  protected preBroadcast(message: MeshData): MeshData {
    this._logger.debug('preBroadcast: %4O', message)
    return formatMessage(this._replacer, message)
  }

  protected preForward(message: MeshData) {
    this._logger.debug('preForward: %4O', message)
    return formatMessage(this._reversed, message)
  }

  protected finish() {
    if (!this._finished && this._sourceEnd && this._sinkEnd) {
      this._logger.log('stream finished')
      this._finished = true
      this._node.removeRelayStream(this)
    }
  }
}

function toReplacer(d: Record<string, string>) {
  const replacers = Object.keys(d).reduce(
    (prev: { replacer: Replacer; reversed: Replacer }, curr) => {
      prev.replacer.push([new RegExp(escapeRegExp(curr), 'g'), d[curr]])
      prev.reversed.push([new RegExp(escapeRegExp(d[curr]), 'g'), curr])
      return prev
    },
    { replacer: [], reversed: [] }
  )
  return replacers
}

function format(replacer: Replacer, str: string) {
  let res = str
  replacer.forEach(([reg, replaceTo]) => {
    res = res.replace(reg, replaceTo)
  })
  return res
}

function formatMessage(replacer: Replacer, message: MeshData) {
  if (!replacer || Object.keys(replacer).length === 0) {
    return message
  }
  let newMessage
  const cmd = message[MeshDataIndex.Cmd]
  switch (cmd) {
    case MeshDataCmd.Open:
      newMessage = [...message] as MeshCmdOpen
      newMessage[MeshCmdOpenIndex.SourceURI] = format(
        replacer,
        newMessage[MeshCmdOpenIndex.SourceURI]
      )
      newMessage[MeshCmdOpenIndex.DestURI] = format(replacer, newMessage[MeshCmdOpenIndex.DestURI])
      break
    case MeshDataCmd.Req:
      newMessage = [...message] as MeshCmdRequest
      newMessage[MeshCmdReqIndex.DestURI] = format(replacer, newMessage[MeshCmdReqIndex.DestURI])
      break
    case MeshDataCmd.Res:
      newMessage = [...message] as MeshCmdResponse
      newMessage[MeshCmdResIndex.SourceURI] = format(
        replacer,
        newMessage[MeshCmdResIndex.SourceURI]
      )
      break
    case MeshDataCmd.End:
      newMessage = [...message] as MeshCmdEnd
      newMessage[MeshCmdResIndex.SourceURI] = format(
        replacer,
        newMessage[MeshCmdResIndex.SourceURI]
      )
      break
    case MeshDataCmd.Ping:
      newMessage = [...message] as MeshCmdPing
      newMessage[MeshCmdReqIndex.DestURI] = format(replacer, newMessage[MeshCmdReqIndex.DestURI])
      break
    default:
      newMessage = message
  }
  return newMessage
}
