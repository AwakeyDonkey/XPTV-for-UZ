import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'xptv-for-uz-'))
fs.mkdirSync(dist, { recursive: true })

for (const name of ['local.json', 'env.json', 'vod']) {
  fs.cpSync(path.join(root, name), path.join(stage, name), { recursive: true })
}

const output = path.join(dist, 'XPTV-for-UZ.zip')
if (fs.existsSync(output)) fs.unlinkSync(output)
const result = spawnSync('zip', ['-qr', output, 'local.json', 'env.json', 'vod'], { cwd: stage, stdio: 'inherit' })
fs.rmSync(stage, { recursive: true, force: true })
if (result.status !== 0) process.exit(result.status || 1)
console.log(`Created ${output}`)
