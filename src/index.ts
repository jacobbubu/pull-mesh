import * as pull from 'pull-stream'
import { encode, decode } from '@jacobbubu/pull-length-prefixed'
import { window } from '@jacobbubu/pull-window'
import * as json from './json-serializer'

export function wrap(duplex: pull.Duplex<any, any>, opts: Partial<json.JsonOptions> = {}) {
  const zipped = opts.zipped ?? false
  const windowed = zipped || (opts.windowed ?? false)

  const sourceThroughs: any[] = [duplex.source]
  if (windowed) sourceThroughs.push(window.recent(null, 100))
  sourceThroughs.push(json.serialize({ zipped, windowed }), encode())

  const sinkThroughs: any[] = [decode(), json.parse({ zipped, windowed }), duplex.sink]

  const source = pull.apply(pull, sourceThroughs) as pull.Source<Buffer>
  const sink = pull.apply(pull, sinkThroughs) as pull.Sink<Buffer>
  return { source, sink }
}

export * from './mesh-node'
export * from './mesh-stream'
export { uid, uid2, uid3, escapeRegExp } from './utils'
