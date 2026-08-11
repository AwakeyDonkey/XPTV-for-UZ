import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const local = JSON.parse(fs.readFileSync(path.join(root, 'local.json'), 'utf8'))
const env = JSON.parse(fs.readFileSync(path.join(root, 'env.json'), 'utf8'))
const sources = JSON.parse(fs.readFileSync(path.join(root, 'sources.json'), 'utf8'))
const errors = []

if (!Array.isArray(local)) errors.push('local.json must be an array')
if (!Array.isArray(env)) errors.push('env.json must be an array')
if (!Array.isArray(sources.sites)) errors.push('sources.json sites must be an array')
if (local.length !== sources.sites.length + 1) errors.push(`source count mismatch: ${sources.sites.length} upstream + 1 diagnostic vs ${local.length} entries`)
for (const source of sources.sites || []) {
  if (typeof source.hasSearch !== 'boolean') errors.push(`missing search capability metadata: ${source.name}`)
  if (typeof source.hasFilters !== 'boolean') errors.push(`missing filter capability metadata: ${source.name}`)
}

const names = new Set()
for (const item of local) {
  if (!item.name || item.type !== 101 || !item.api) errors.push(`invalid local.json item: ${JSON.stringify(item)}`)
  if (typeof item.webSite !== 'string' || !/^https?:\/\//.test(item.webSite)) errors.push(`missing/invalid webSite: ${item.name}`)
  if (names.has(item.name)) errors.push(`duplicate name: ${item.name}`)
  names.add(item.name)
  const file = path.join(root, item.api)
  if (!fs.existsSync(file)) {
    errors.push(`missing adapter: ${item.api}`)
    continue
  }
  const code = fs.readFileSync(file, 'utf8')
  try { new vm.Script(code, { filename: item.api }) } catch (error) { errors.push(`${item.api}: ${error.message}`) }
  for (const fn of ['getClassList', 'getSubclassList', 'getVideoList', 'getSubclassVideoList', 'getVideoDetail', 'getVideoPlayUrl', 'searchVideo']) {
    if (!new RegExp(`async function ${fn}\\b`).test(code)) errors.push(`${item.api}: missing ${fn}`)
  }
  if (item.api.startsWith('vod/js/xptv_')) {
    if (item.version !== 3) errors.push(`${item.api}: expected adapter version 3`)
    if (item.name.startsWith('XPAV - ')) {
      for (const helper of ['xptvFilterTitles', 'xptvFilterValue', 'XPTV_HAS_FILTERS']) {
        if (code.includes(helper)) errors.push(`${item.api}: XPAV adapter must use the pre-filter format (found ${helper})`)
      }
      if (!code.includes('item.hasSubclass = false')) errors.push(`${item.api}: XPAV adapter must not advertise subclasses`)
      if (!code.includes('return JSON.stringify(new RepVideoSubclassList())')) errors.push(`${item.api}: XPAV adapter must use the legacy empty subclass response`)
    } else {
      for (const helper of ['xptvFilterTitles', 'xptvFilterValue', 'XPTV_HAS_SEARCH', 'XPTV_HAS_FILTERS']) {
        if (!code.includes(helper)) errors.push(`${item.api}: missing v1.2 helper ${helper}`)
      }
    }
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'))
  process.exit(1)
}

console.log(`Verified ${sources.sites.length} adapters plus 1 diagnostic source, JSON manifests, paths, and JavaScript syntax.`)
