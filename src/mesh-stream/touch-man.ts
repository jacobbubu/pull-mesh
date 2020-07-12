import { now } from '../utils'

const CHECK_INTERVAL = 2e3

export class TouchMan {
  private _touchedAt = 0
  private _totalTouched = 0
  private _timer: NodeJS.Timeout | null = null

  constructor(
    private readonly _onTimeout: (touched: number) => void,
    private readonly _expiresAfter: number = 30e3,
    private readonly _checkingInterval = CHECK_INTERVAL
  ) {
    this.timeout = this.timeout.bind(this)
  }

  private get started() {
    return !!this._timer
  }

  private timeout() {
    this._timer = null
    if (now() - this._touchedAt >= this._expiresAfter) {
      this._onTimeout(this._totalTouched)
    } else {
      this.start()
    }
  }

  private start() {
    this.stop()
    this._timer = setTimeout(this.timeout, this._checkingInterval)
  }

  stop() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  }

  touch() {
    this._touchedAt = now()
    this._totalTouched++
    if (!this.started) {
      this.start()
    }
  }

  get totalTouched() {
    return this._totalTouched
  }
}
