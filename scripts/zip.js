const fs = require('fs')
const path = require('path')
const archiver = require('archiver')

const projectRoot = path.join(__dirname, '..')
const inPath = path.join(projectRoot, 'dist')
const outPath = path.join(inPath, 'index.zip')

fs.mkdirSync(inPath, { recursive: true })

const output = fs.createWriteStream(outPath)
const archive = archiver('zip', { zlib: { level: 9 } })

output.on('close', () => {
  console.log('Created', outPath, `(${archive.pointer()} bytes)`)
})

archive.on('error', (err) => {
  console.error('Zip failed:', err)
  process.exit(1)
})

archive.pipe(output)
// Add everything from dist, but ignore the output zip if it already exists
archive.glob('**/*', { cwd: inPath, ignore: ['index.zip'] })
archive.finalize()
