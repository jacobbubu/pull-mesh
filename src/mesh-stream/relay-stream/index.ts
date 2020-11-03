import { MeshStream } from '../mesh-stream'
import { PushableDuplex, OnReceivedCallback, OnReadCallback } from '@jacobbubu/pull-pushable-duplex'
import {
  MeshNode,
  MeshData,
  MeshDataIndex,
  MeshDataCmd,
  MeshCmdOpen,
  MeshCmdRequest,
  MeshCmdResponse,
  MeshCmdSinkEnd,
  MeshCmdEnd,
  MeshCmdOpenIndex,
  MeshCmdReqIndex,
  MeshCmdResIndex,
  MeshCmdContinueIndex,
  MeshCmdContinue,
} from '../../mesh-node'
import { uid2, escapeRegExp, isPromise } from '../../utils'

export type RelayContext = Record<string, any>
export type FilterFunc = (message: MeshData) => boolean
export type VarsType = Record<string, string>

export interface RelayStreamOptions {
  name: string
  priority: number
  isDictator: boolean
  vars: VarsType
  outgoingFilter: (message: MeshData) => boolean
  incomingFilter: (message: MeshData) => boolean
}

type Replacer = [RegExp, string][]

export interface RelayStream {
  addListener(
    event: 'incoming' | 'outgoing',
    listener: (raw: MeshData, encoded: MeshData) => void
  ): this
  on(event: 'incoming' | 'outgoing', listener: (raw: MeshData, encoded: MeshData) => void): this
  once(event: 'incoming' | 'outgoing', listener: (raw: MeshData, encoded: MeshData) => void): this
  removeListener(
    event: 'incoming' | 'outgoing',
    listener: (raw: MeshData, encoded: MeshData) => void
  ): this
  off(event: 'incoming' | 'outgoing', listener: (raw: MeshData, encoded: MeshData) => void): this
  emit(event: 'incoming' | 'outgoing', raw: MeshData, encoded: MeshData): boolean

  addListener(event: 'ignored', listener: (message: MeshData) => void): this
  on(event: 'ignored', listener: (message: MeshData) => void): this
  once(event: 'ignored', listener: (message: MeshData) => void): this
  removeListener(event: 'ignored', listener: (message: MeshData) => void): this
  off(event: 'ignored', listener: (message: MeshData) => void): this
  emit(event: 'ignored', message: MeshData): boolean

  addListener(event: 'connect' | 'close', listener: () => void): this
  on(event: 'connect' | 'close', listener: () => void): this
  once(event: 'connect' | 'close', listener: () => void): this
  removeListener(event: 'connect' | 'close', listener: () => void): this
  off(event: 'connect' | 'close', listener: () => void): this
  emit(event: 'connect' | 'close'): boolean
}

export class RelayStream extends MeshStream<MeshData> {
  private _name: string
  private _outgoingFilter: FilterFunc | null
  private _incomingFilter: FilterFunc | null
  private _vars: VarsType
  private _priority: number
  private _isFirstRead = true
  private _isFirstGetSource = true
  private _replacer: Replacer = []
  private _reversed: Replacer = []
  private _innerDuplex: PushableDuplex<MeshData, MeshData, number>

  public kind = 'RELAY'

  constructor(node: MeshNode, private readonly _opts: Partial<RelayStreamOptions> = {}) {
    super(node)
    this._name = _opts.name ?? uid2()
    this._outgoingFilter = _opts.outgoingFilter ?? null
    this._incomingFilter = _opts.incomingFilter ?? null
    this._vars = _opts.vars ?? {}
    this._priority = _opts.priority ?? 100
    this._logger = node.logger.ns(`*${this._name}`)

    this._innerDuplex = new PushableDuplex({
      allowHalfOpen: false,
      initialState: 0,
      onReceived: this.onReceived.bind(this),
      onFinished: (end) => {
        this.finish()
      },
    })
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

  get outgoingFilter() {
    return this._outgoingFilter
  }

  get incomingFilter() {
    return this._incomingFilter
  }

  get source() {
    if (this._isFirstGetSource) {
      this._isFirstGetSource = false
      this._innerDuplex.push(this._vars as any)
    }
    return this._innerDuplex.source
  }

  get sink() {
    return this._innerDuplex.sink
  }

  forward(rawMessage: MeshData) {
    const encoded = this.preForward(rawMessage)
    this.emit('outgoing', rawMessage, encoded)
    this._logger.debug(`forward with relayStream(${this._name}):`, { rawMessage, encoded })
    this._innerDuplex.push(encoded)
  }

  protected preBroadcast(message: MeshData): MeshData {
    return formatMessage(this._replacer, message)
  }

  protected preForward(message: MeshData) {
    return formatMessage(this._reversed, message)
  }

  protected finish() {
    this.emit('close')
    this._node.removeRelayStream(this)
  }

  private onReceived(data: MeshData | VarsType, cb: OnReceivedCallback) {
    if (this._isFirstRead) {
      this._isFirstRead = false
      this.emit('connect')
      const peerVars = data as VarsType

      const vars = { ...this._vars, ...peerVars }
      const replacers = toReplacer(vars)
      this._replacer = replacers.replacer
      this._reversed = replacers.reversed
      this._logger.log('replacer:', this._replacer)
    } else {
      const message = data as MeshData
      const { dup } = this._node
      const id = message[MeshDataIndex.Id]
      if (!dup.check(id)) {
        dup.track(id)
        if (this._incomingFilter && !this._incomingFilter(message)) {
          this.emit('ignored', message)
        } else {
          const encoded = this.preBroadcast(message)
          this.emit('incoming', message, encoded)
          const result = this._node.broadcast(encoded, this)
          if (isPromise(result)) {
            // tslint:disable-next-line no-floating-promises
            result.then(() => cb())
            return
          }
        }
      } else {
        this.emit('ignored', message)
      }
    }
    cb()
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
      newMessage[MeshCmdResIndex.DestURI] = format(replacer, newMessage[MeshCmdResIndex.DestURI])
      break
    case MeshDataCmd.Continue:
      newMessage = [...message] as MeshCmdContinue
      newMessage[MeshCmdContinueIndex.DestURI] = format(
        replacer,
        newMessage[MeshCmdContinueIndex.DestURI]
      )
      break
    case MeshDataCmd.SinkEnd:
      newMessage = [...message] as MeshCmdSinkEnd
      newMessage[MeshCmdResIndex.DestURI] = format(replacer, newMessage[MeshCmdResIndex.DestURI])
      break
    case MeshDataCmd.End:
      newMessage = [...message] as MeshCmdEnd
      newMessage[MeshCmdResIndex.DestURI] = format(replacer, newMessage[MeshCmdResIndex.DestURI])
      break
    default:
      newMessage = message
  }
  return newMessage
}

export * from './filters'
