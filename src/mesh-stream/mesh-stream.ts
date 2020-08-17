import * as pull from '@jacobbubu/pull-stream'
import { MeshNode } from '../mesh-node'
import { Debug } from '@jacobbubu/debug'
import { EventEmitter } from 'events'

export class MeshStream<T> extends EventEmitter {
  protected _finished = false

  protected _logger: Debug
  protected _node: MeshNode
  protected _source: pull.Source<T> | null = null
  protected _sink: pull.Sink<T> | null = null
  protected _sourceEnd: pull.Abort | null = null
  protected _sinkEnd: pull.EndOrError | null = null

  public kind = 'BASE'

  get name() {
    return 'base'
  }

  get node() {
    return this._node
  }

  constructor(node: MeshNode) {
    super()
    this._node = node
    this._logger = node.logger.ns(this.name)
  }
}
