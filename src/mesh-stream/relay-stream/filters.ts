import {
  MeshData,
  MeshDataIndex,
  MeshDataCmd,
  MeshCmdOpenIndex,
  MeshCmdReqIndex,
} from '../../mesh-node'

export function makeDestFilter(fn: (destURI: string) => boolean) {
  return function (message: MeshData) {
    let destURI: string
    const cmd = message[MeshDataIndex.Cmd]
    if (cmd === MeshDataCmd.Open) {
      // only the destURI of an Open message is the fourth item.
      destURI = message[MeshCmdOpenIndex.DestURI]
    } else {
      destURI = message[MeshCmdReqIndex.DestURI]
    }
    return fn(destURI)
  }
}

export function makeDestPrefixFilter(prefix: RegExp | string) {
  const predicate = (destURI: string) =>
    prefix instanceof RegExp ? prefix.test(destURI) : destURI.startsWith(prefix)
  return makeDestFilter(predicate)
}
