import ShortUniqueId from 'short-unique-id'

export const uid = new ShortUniqueId()
export const uid2 = new ShortUniqueId({ length: 2 })
export const uid3 = new ShortUniqueId({ length: 3 })

export function hash(str: string) {
  let hash = 5381
  const len = str.length

  for (let i = 0; i < len; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }

  return hash >>> 0
}

const CHARSET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export function base62(int: number) {
  if (int === 0) {
    return CHARSET[0]
  }

  let res = ''
  while (int > 0) {
    res = CHARSET[int % 62] + res
    int = Math.floor(int / 62)
  }
  return res
}

export function hashedURI(str: string) {
  return base62(hash(str))
}

export function noop() {
  /**/
}

export function now() {
  return +new Date()
}
