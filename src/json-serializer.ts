import through from '@jacobbubu/pull-through'
import {
  MeshDataIndex,
  MeshDataCmd,
  MeshCmdOpenIndex,
  MeshCmdReqIndex,
  MeshCmdEndIndex,
  MeshCmdSinkEndIndex,
} from './mesh-node'
import { stringify as zipStringify, parse as zipParse } from 'zipson'

export interface JsonOptions {
  zipped: boolean
  windowed: boolean
}

function encodeError(e: any) {
  return e instanceof Error ? ['__ERROR__', e.message] : e
}

function decodeError(e?: ['__ERROR__', string]) {
  return Array.isArray(e) ? new Error(e[1]) : e
}

const preSerialization = (data: any) => {
  if (Array.isArray(data)) {
    switch (data[MeshDataIndex.Cmd]) {
      case MeshDataCmd.Open:
        data[MeshCmdOpenIndex.Abort] = encodeError(data[MeshCmdOpenIndex.Abort])
        break
      case MeshDataCmd.Req:
        data[MeshCmdReqIndex.Abort] = encodeError(data[MeshCmdReqIndex.Abort])
        break
      case MeshDataCmd.End:
        data[MeshCmdEndIndex.EndOrError] = encodeError(data[MeshCmdEndIndex.EndOrError])
        break
      case MeshDataCmd.SinkEnd:
        data[MeshCmdSinkEndIndex.EndOrError] = encodeError(data[MeshCmdSinkEndIndex.EndOrError])
        break
    }
  }
  return data
}

const serialize = function (opts: Partial<JsonOptions> = {}) {
  const zipped = opts.zipped ?? false
  const windowed = zipped || (opts.windowed ?? false)
  const stringify = zipped ? zipStringify : JSON.stringify
  return through(function (data) {
    if (windowed) {
      if (!Array.isArray(data)) {
        throw new Error('Array type is required for serializing windowed data')
      }

      data.forEach((d) => {
        preSerialization(d)
      })
      this.queue(Buffer.from(stringify(data), 'binary'))
    } else {
      preSerialization(data)
      this.queue(Buffer.from(stringify(data), 'binary'))
    }
  })
}

const postParse = (data: any) => {
  if (Array.isArray(data)) {
    switch (data[MeshDataIndex.Cmd]) {
      case MeshDataCmd.Open:
        data[MeshCmdOpenIndex.Abort] = decodeError(data[MeshCmdOpenIndex.Abort])
        break
      case MeshDataCmd.Req:
        data[MeshCmdReqIndex.Abort] = decodeError(data[MeshCmdReqIndex.Abort])
        break
      case MeshDataCmd.End:
        data[MeshCmdEndIndex.EndOrError] = decodeError(data[MeshCmdEndIndex.EndOrError])
        break
      case MeshDataCmd.SinkEnd:
        data[MeshCmdSinkEndIndex.EndOrError] = decodeError(data[MeshCmdSinkEndIndex.EndOrError])
        break
    }
  }
  return data
}

const parse = function (opts: Partial<JsonOptions> = {}) {
  const zipped = opts.zipped ?? false
  const windowed = zipped || (opts.windowed ?? false)
  const parse = zipped ? zipParse : JSON.parse
  return through(function (data: Buffer | string) {
    const self = this
    const rawStr = Buffer.isBuffer(data) ? data.toString('binary') : data.toString()
    const parsed = parse(rawStr)

    if (windowed) {
      if (!Array.isArray(parsed)) {
        throw new Error(`Array type is required for parsing windowed data. raw: ${rawStr}`)
      }

      parsed.forEach((d) => {
        postParse(d)
        self.queue(d)
      })
    } else {
      postParse(parsed)
      self.queue(parsed)
    }
  })
}

export { serialize }
export { parse }
