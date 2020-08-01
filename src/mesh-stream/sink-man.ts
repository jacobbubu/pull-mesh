import * as pull from 'pull-stream'
import { Id } from 'src/mesh-node'
import { PortStream } from './port-stream'

export interface ReadMeshItem {
  replyTo: Id
}

export class SinkMan<T> {
  private readonly _limit = 3
  private readonly _windowTime = 200

  private _rawRead: pull.Source<T> | null = null
  private _readMeshList: ReadMeshItem[] = []
  private _abort: pull.Abort = null
  private readonly _buffer: [pull.EndOrError, T[] | null][] = []
  private _reading = false

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
    this._readMeshList.push(item)
    this.drain()
  }

  abort(abort: pull.Abort = true) {
    this._abort = abort
  }

  drain() {
    let endOrError
    while (this.hasReadMesh()) {
      if (endOrError) {
        // once end always end
        const item = this._readMeshList.shift()!
        this._port.postToMesh(this._port.createEndMessage(item.replyTo, endOrError))
      } else {
        const r = this._buffer.shift()
        if (r) {
          const item = this._readMeshList.shift()!
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
      this.read(this._abort)
    }
  }

  private get logger() {
    return this._port.logger
  }

  // calling by sink
  private read(abort: pull.Abort) {
    if (this._rawRead && !this._reading) {
      // use this._reading to prevent reentering
      this._reading = true

      let dataList: T[] = []
      let timer: NodeJS.Timeout | null = null

      const rawRead = this._rawRead
      const self = this

      const collect = () => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        if (dataList.length > 0) {
          self._buffer.push([null, dataList])
          dataList = []
        }
      }

      rawRead(abort, function next(endOrError, data) {
        if (endOrError) {
          collect()
          self._buffer.push([endOrError, null])
          self._reading = false
          self.drain()
          return
        }

        dataList.push(data!)

        // start a timeout check after fetching data for the first time
        if (!timer) {
          timer = setTimeout(() => {
            collect()
            self.drain()
          }, self._windowTime)
        }

        // stop the rawRead loop when the previous _buffer has not been read
        if (dataList.length >= self._limit || self._buffer.length > 0) {
          collect()
          self._reading = false
          self.drain()
          return
        }

        rawRead(abort, next)
      })
    }
  }
}