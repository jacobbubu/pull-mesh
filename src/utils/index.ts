import * as pull from 'pull-stream'
import ShortUniqueId from 'short-unique-id'

export const uid = new ShortUniqueId()
export const uid2 = new ShortUniqueId({ length: 2 })
export const uid3 = new ShortUniqueId({ length: 3 })
export * from './escape-regexp'

export function noop() {
  /**/
}

export function now() {
  return +new Date()
}

export function isPromise(obj: any) {
  return (
    !!obj &&
    (typeof obj === 'object' || typeof obj === 'function') &&
    typeof obj.then === 'function'
  )
}

export function trueToNull(endOrError: pull.EndOrError) {
  return endOrError === true ? null : endOrError
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(() => resolve(), ms))
