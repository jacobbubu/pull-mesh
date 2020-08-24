import * as pull from '@jacobbubu/pull-stream'
import { encode, decode } from '@jacobbubu/pull-length-prefixed'
import { window } from '@jacobbubu/pull-window'
import * as json from './json-serializer'

export function wrap(duplex: pull.Duplex<any, any>, opts: Partial<json.JsonOptions> = {}) {
  const zipped = opts.zipped ?? false
  const windowed = zipped || (opts.windowed ?? false)

  const sourceThroughs = [duplex.source]
    .concat(windowed ? [window.recent<any, any[]>(null, 100)] : [])
    .concat([json.serialize({ zipped, windowed })])
    .concat(encode())

  const sinkThroughs = [decode()].concat([json.parse({ zipped, windowed })]).concat(duplex.sink)

  const source = pull.apply(pull, sourceThroughs) as pull.Source<Buffer>
  const sink = pull.apply(pull, sinkThroughs) as pull.Sink<Buffer>
  return { source, sink }
}

export * from './mesh-node'
export * from './mesh-stream'
