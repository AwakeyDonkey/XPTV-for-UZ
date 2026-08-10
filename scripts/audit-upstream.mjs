import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { sites } = JSON.parse(fs.readFileSync(path.join(root, 'sources.json'), 'utf8'))
const knownRuntimeNames = new Set([
  'createCheerio', 'createCryptoJS', 'createJSEncrypt', '$fetch', '$html', '$cache', '$print', '$utils', 'jsonify', 'argsify',
])
const discovered = new Set()
const identifierSites = new Map()
const failures = []

for (const site of sites) {
  try {
    const response = await fetch(site.ext, { headers: { 'User-Agent': 'XPTV-for-UZ-audit/1.0' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const code = await response.text()
    if (!code || /<html/i.test(code)) throw new Error('not JavaScript')
    new vm.Script(code, { filename: site.ext })
    for (const match of code.matchAll(/create[A-Z]\w*|\$[A-Za-z_]\w*/g)) {
      discovered.add(match[0])
      if (!identifierSites.has(match[0])) identifierSites.set(match[0], new Set())
      identifierSites.get(match[0]).add(site.name)
    }
    for (const fn of ['getConfig', 'getCards', 'getTracks', 'getPlayinfo', 'search']) {
      if (!new RegExp(`(?:async\\s+)?function\\s+${fn}\\b`).test(code)) failures.push(`${site.name}: missing ${fn}`)
    }
  } catch (error) {
    failures.push(`${site.name}: ${error.message}`)
  }
}

const unknown = [...discovered].filter((name) => !knownRuntimeNames.has(name)).sort()
console.log(`Fetched and parsed ${sites.length - failures.filter((item) => !item.includes('missing ')).length}/${sites.length} upstream source files.`)
console.log(`Runtime identifiers: ${[...discovered].sort().join(', ') || '(none)'}`)
if (unknown.length) {
  console.warn('Identifiers requiring manual review:')
  for (const name of unknown) console.warn(`- ${name}: ${[...identifierSites.get(name)].join(', ')}`)
}
if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join('\n'))
  process.exit(1)
}
