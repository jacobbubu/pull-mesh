import * as pull from 'pull-stream'

export const createDuplex = (values: any[], cb: (err: pull.EndOrError, data: any) => void) => {
  return {
    source: pull.values(values),
    sink: pull.collect((err, results) => {
      cb(err, results)
    }),
  }
}
