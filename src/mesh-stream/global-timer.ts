import { EventEmitter } from 'events'

const CHECKING_INTERVAL = 1e3

interface RefCountTimer {
  on(event: '1s', fn: () => void): this
  once(event: '1s', fn: () => void): this
  off(event: '1s', fn: () => void): this
}

class RefCountTimer extends EventEmitter {
  private _count = 0
  private _timer: NodeJS.Timeout | null = null

  constructor() {
    super()
    this.onFired = this.onFired.bind(this)
  }

  private tryStart() {
    if (this._timer === null) {
      this._timer = setTimeout(this.onFired, CHECKING_INTERVAL)
    }
  }

  private onFired() {
    this._timer = null
    this.emit('1s')
    if (this.listenerCount('1s') > 0) {
      this._timer = setTimeout(this.onFired, CHECKING_INTERVAL)
    }
  }

  private tryStop() {
    if (this._timer !== null && this.listenerCount('1s') < 1) {
      const t = this._timer
      this._timer = null
      clearTimeout(t)
    }
  }

  on(event: '1s', fn: () => void) {
    super.on(event, fn)
    this.tryStart()
    return this
  }

  once(event: '1s', fn: () => void) {
    super.once(event, fn)
    this.tryStart()
    return this
  }

  off(event: '1s', fn: () => void) {
    super.off(event, fn)
    this.tryStop()
    return this
  }
}

export const globalTimer = new RefCountTimer()
