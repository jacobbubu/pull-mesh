import * as pull from '@jacobbubu/pull-stream'

export const createDuplex = (values: any[], cb: (err: pull.EndOrError, data: any) => void) => {
  return {
    source: pull.values(values),
    sink: pull.collect((err, results) => {
      cb(err, results)
    }),
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
