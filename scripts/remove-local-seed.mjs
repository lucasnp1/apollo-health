import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

if (process.env.INCLUDE_LOCAL_SEED !== '1') {
  rmSync(resolve('dist/local-seed'), { force: true, recursive: true })
}
