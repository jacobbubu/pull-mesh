export interface DupOptions {
  age: number
}

const DefaultOptions: DupOptions = {
  age: 1e3 * 27,
}

export class Dup {
  private _cache: Record<string, number> = {}
  private _timer: NodeJS.Timeout | null = null
  private _opts: DupOptions

  constructor(opts: Partial<DupOptions> = {}) {
    this._opts = { ...DefaultOptions, ...opts }
  }

  check(id: string) {
    return this._cache[id] ? this.track(id) : false
  }

  track(id: string) {
    this._cache[id] = +new Date()

    if (!this._timer) {
      const self = this
      const opts = this._opts
      this._timer = setTimeout(function () {
        Object.keys(self._cache).forEach(function (id) {
          const time = self._cache[id]
          if (opts.age > +new Date() - time) {
            return
          }
          delete self._cache[id]
        })
        self._timer = null
      }, this._opts.age)
    }
    return id
  }
}
