import * as pull from 'pull-stream'
import Abortable from '@jacobbubu/pull-abortable'

export const delay = (ms: number) => new Promise((resolve) => setTimeout(() => resolve(), ms))

export const createDuplex = (values: any[], cb: (err: pull.EndOrError, data: any) => void) => {
  return {
    source: pull.values(values),
    sink: pull.collect((err, results) => {
      cb(err, results)
    }),
  }
}

export const createAbortSinkDuplex = (
  values: any[],
  cb: (err: pull.EndOrError, data: any) => void
) => {
  return {
    source: pull.values(values),
    sink: (read: pull.Source<any>) => {
      read(true, cb)
    },
  }
}

export const createDelayedDuplex = (
  values: any[],
  delay: number,
  cb: (err: pull.EndOrError, data: any) => void
) => {
  return {
    source: pull(
      pull.values(values),
      pull.asyncMap((data, cb) => {
        setTimeout(() => cb(null, data), delay)
      })
    ),
    sink: pull.collect((err, results) => {
      cb(err, results)
    }),
  }
}

export const makeAbortable = <In, Out>(duplex: pull.Duplex<In, Out>) => {
  const sourceAbortable = Abortable()
  const sinkAbortable = Abortable()
  return {
    source: pull(duplex.source, sourceAbortable),
    sink: pull(sinkAbortable, duplex.sink),
    sourceAbortable,
    sinkAbortable,
  }
}
