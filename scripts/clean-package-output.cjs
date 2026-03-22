const fs = require('node:fs')
const path = require('node:path')

const { sync: rimrafSync } = require('rimraf')

const rootDir = path.resolve(__dirname, '..')
const foldersToRemove = [
  path.join(rootDir, 'release', 'app', 'dist'),
  path.join(rootDir, 'release', 'build'),
  path.join(rootDir, '.erb', 'dll'),
]

for (const folder of foldersToRemove) {
  if (fs.existsSync(folder)) {
    rimrafSync(folder)
  }
}
