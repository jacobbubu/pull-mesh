import * as pull from 'pull-stream'
import { pushable, Read } from '@jacobbubu/pull-pushable'
import { Debug } from '@jacobbubu/debug'
import { MeshStream } from './mesh-stream'
import { MeshNode, MeshData, MeshDataIndex } from '../mesh-node'
import { uid2 } from '../utils'

export class RelayStream extends MeshStream<MeshData> {
  protected _logger: Debug
  protected _node: MeshNode
  protected _source: pull.Source<MeshData> | null = null
  protected _sink: pull.Sink<MeshData> | null = null
  protected _sourceEnd: pull.Abort | null = null
  protected _sinkEnd: pull.EndOrError | null = null

  public kind = 'RELAY'

  constructor(node: MeshNode, private readonly _name = uid2()) {
    super()
    this._node = node
    this._logger = node.logger.ns(`*${_name}`)
  }

  get name() {
    return this._name
  }

  get node() {
    return this._node
  }

  get source() {
    if (!this._source) {
      this._source = pushable(() => {
        this._sourceEnd = true
        this.finish()
      })
    }
    return this._source
  }

  get sink() {
    if (!this._sink) {
      const self = this
      this._sink = function (rawRead: pull.Source<MeshData>) {
        rawRead(self._sourceEnd, function next(endOrError: pull.EndOrError, data?: MeshData) {
          if (endOrError) {
            self._sinkEnd = true
            if (!self._sourceEnd && self._source) {
              ;(self._source as Read<MeshData>).end()
            }
            self.finish()
            return
          }
          const message = data!
          const { dup } = self._node
          const id = message[MeshDataIndex.Id]
          if (!dup.check(id)) {
            dup.track(id)
            self._node.broadcast(message, self)
          } else {
            self._logger.log('ignore duplicated message', message)
          }
          rawRead(self._sourceEnd, next)
        })
      }
    }
    return this._sink
  }

  forward(message: MeshData) {
    ;(this.source as Read<MeshData>).push(message)
  }

  protected finish() {
    if (!this._finished && this._sourceEnd && this._sinkEnd) {
      this._logger.log('stream finished')
      this._finished = true
      this._node.removeRelayStream(this)
    }
  }
}
