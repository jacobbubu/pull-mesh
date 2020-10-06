import { MeshData, MeshDataIndex } from '../../mesh-node'

export function makeDestFilter(fn: (destURI: string) => boolean) {
  return function (message: MeshData) {
    const destURI = message[MeshDataIndex.DestURI]
    return fn(destURI)
  }
}

export function makeDestPrefixFilter(prefix: RegExp | string) {
  const predicate = (destURI: string) =>
    prefix instanceof RegExp ? prefix.test(destURI) : destURI.startsWith(prefix)
  return makeDestFilter(predicate)
}
