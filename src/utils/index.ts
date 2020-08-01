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
