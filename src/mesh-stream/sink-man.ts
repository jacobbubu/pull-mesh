import * as pull from 'pull-stream'
import { Id } from '../mesh-node'
import { PortStream } from './port-stream'

export interface ReadMeshItem {
  replyTo: Id
}

interface InternalReadMeshItem extends ReadMeshItem {
  timeout?: NodeJS.Timeout
}

export class SinkMan<T> {
  private readonly _limit = 3
  private readonly _windowTime = 200

  private _rawRead: pull.Source<T> | null = null
  private _readMeshList: InternalReadMeshItem[] = []
  private _abort: pull.Abort = null
  private readonly _buffer: [pull.EndOrError, T[] | null][] = []
  private _reading = false
  private _timer: NodeJS.Timeout | null = null
  private _dataList: T[] = []
  private _ended = false

  constructor(private readonly _port: PortStream<T>) {}

  private hasReadMesh() {
    return this._readMeshList.length > 0
  }

  get node() {
    return this._port.node
  }

  addRead(read: pull.Source<T>) {
    if (this._rawRead) {
      throw new Error('read function already exists')
    }
    this._rawRead = read
    this.drain()
  }

  addReadMesh(item: ReadMeshItem) {
    const replyTo = item.replyTo

    const timedOutFunc = (item: InternalReadMeshItem) => {
      this._port.postToMesh(this._port.createContinueMessage(replyTo))
      item.timeout = setTimeout(timedOutFunc, this._port.continueInterval, item)
    }

    const internalReadMeshItem: InternalReadMeshItem = {
      replyTo,
    }
    if (this._port.continueInterval > 0) {
      internalReadMeshItem.timeout = setTimeout(
        timedOutFunc,
        this._port.continueInterval,
        internalReadMeshItem
      )
    }

    this._readMeshList.push(internalReadMeshItem)
    this.drain()
  }

  abort(abort: pull.Abort = true) {
    this.read(abort)
  }

  drain() {
    let endOrError
    while (this.hasReadMesh()) {
      if (endOrError) {
        // once end always end
        const item = this._readMeshList.shift()!
        if (item.timeout) clearTimeout(item.timeout)
        this._port.postToMesh(this._port.createEndMessage(item.replyTo, endOrError))
      } else {
        const r = this._buffer.shift()
        if (r) {
          const item = this._readMeshList.shift()!
          if (item.timeout) clearTimeout(item.timeout)
          const [end, dataList] = r
          if (end) {
            this._port.postToMesh(this._port.createEndMessage(item.replyTo, end))
            endOrError = end
          } else {
            this._port.postToMesh(this._port.createResMessage(item.replyTo, dataList!))
          }
        } else {
          break
        }
      }
    }
    if (this._rawRead && this.hasReadMesh()) {
      this.read()
    }
  }

  private get logger() {
    return this._port.logger
  }

  private collect() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    if (this._dataList.length > 0) {
      this._buffer.push([null, this._dataList])
      this._dataList = []
    }
  }

  // calling by sink
  private read(abort: pull.Abort = null) {
    this._abort = abort
    if (this._rawRead) {
      if (!this._abort && this._reading) {
        // use this._reading to prevent reentering for non-abort request
        return
      }

      this._reading = true

      const rawRead = this._rawRead
      const self = this

      rawRead(self._abort, function next(endOrError, data) {
        if (self._ended) return

        if (endOrError) {
          self._ended = true
          self.collect()
          self._buffer.push([endOrError, null])
          self._reading = false
          self.drain()
          self._port.sinkEnds(endOrError)
          return
        }

        self._dataList.push(data!)

        // start a timeout check after fetching data for the first time
        if (!self._timer) {
          self._timer = setTimeout(() => {
            self._timer = null
            self.collect()
            self.drain()
          }, self._windowTime)
        }

        // stop the rawRead loop when the previous _buffer has not been read
        if (self._dataList.length >= self._limit || self._buffer.length > 0) {
          self.collect()
          self._reading = false
          self.drain()
          return
        }

        rawRead(self._abort, next)
      })
    }
  }
}
