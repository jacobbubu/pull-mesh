import { now } from '../utils'
import { globalTimer } from './global-timer'

export class TouchMan {
  private _touchedAt = 0
  private _totalTouched = 0
  private _started = false

  constructor(
    private readonly _onTimeout: (touched: number) => void,
    private _expiresAfter: number = 30e3
  ) {
    this.timeout = this.timeout.bind(this)
    this.start()
  }

  private timeout() {
    if (now() - this._touchedAt >= this._expiresAfter) {
      this._onTimeout(this._totalTouched)
    }
  }

  private start() {
    if (!this._started) {
      this._started = true
      this._touchedAt = now()
      globalTimer.on('1s', this.timeout)
    }
  }

  extendTo(newTimeout: number) {
    this._expiresAfter = newTimeout
  }

  stop() {
    if (this._started) {
      globalTimer.off('1s', this.timeout)
      this._started = false
    }
  }

  touch() {
    this._touchedAt = now()
    this._totalTouched++
  }

  get touchedAt() {
    return this._touchedAt
  }

  get totalTouched() {
    return this._totalTouched
  }
}
