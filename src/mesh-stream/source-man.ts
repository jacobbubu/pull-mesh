import * as pull from 'pull-stream'
import { PortStream } from './port-stream'

export class SourceMan<T> {
  private _cbs: pull.SourceCallback<T>[] = []
  private _buffer: [pull.EndOrError, T | undefined][] = []

  private _reentered = false

  constructor(private readonly _port: PortStream<T>) {}

  private get logger() {
    return this._port.logger
  }

  get reentered() {
    return this._reentered
  }

  addCb(cb: pull.SourceCallback<T>) {
    this._cbs.push(cb)
    return this.drain()
  }

  end(end: pull.EndOrError = true) {
    this._buffer.push([end, undefined])
    this.drain()
  }

  abort(abort: pull.EndOrError = true) {
    this._buffer = []
    while (this._cbs.length > 0) {
      const cb = this._cbs.shift()!
      cb(abort)
    }
  }

  push(data: T) {
    this._buffer.push([null, data])
    return this.drain()
  }

  pushList(dataList: T[]) {
    const self = this
    dataList.forEach((x) => {
      self._buffer.push([null, x])
    })
    return this.drain()
  }

  private drain() {
    if (this._reentered) return false

    this._reentered = true
    try {
      while (this._buffer.length > 0) {
        const cb = this._cbs.shift()
        if (cb) {
          const [end, data] = this._buffer.shift()!
          cb(end, data)
        } else {
          break
        }
      }
    } finally {
      this._reentered = false
    }
    return this._cbs.length > this._buffer.length
  }
}
