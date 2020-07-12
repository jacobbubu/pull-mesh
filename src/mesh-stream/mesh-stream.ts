import * as pull from 'pull-stream'
import { MeshNode } from '../mesh-node'
import { Debug } from '@jacobbubu/debug'

export abstract class MeshStream<T> {
  protected _finished = false

  protected abstract _logger: Debug
  protected abstract _node: MeshNode
  protected abstract _source: pull.Source<T> | null = null
  protected abstract _sink: pull.Sink<T> | null = null
  protected abstract _sourceEnd: pull.Abort | null = null
  protected abstract _sinkEnd: pull.EndOrError | null = null

  abstract kind: string
  abstract get name(): string
  abstract get node(): MeshNode
}
