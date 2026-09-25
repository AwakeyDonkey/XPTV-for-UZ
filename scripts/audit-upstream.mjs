import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { sites } = JSON.parse(fs.readFileSync(path.join(root, 'sources.json'), 'utf8'))
const knownRuntimeNames = new Set([
  'createCheerio', 'createCryptoJS', 'createJSEncrypt', 'loadJSEncrypt', '$fetch', '$html', '$cache', '$print', '$utils', 'jsonify', 'argsify',
])
const discovered = new Set()
const identifierSites = new Map()
const failures = []
const warnings = []
const FETCH_TIMEOUT_MS = 30000

// Upstream ext URLs are wrapped in a GitHub proxy (e.g. https://ghp.xptvhelper.link/https://raw.githubusercontent.com/...).
// When the proxy stalls, fall back to the canonical URL embedded after it.
function candidateUrls(url) {
  const nested = url.indexOf('/https://', 8)
  return nested === -1 ? [url] : [url, url.slice(nested + 1)]
}

async function fetchSource(url) {
  const errors = []
  for (const candidate of candidateUrls(url)) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(candidate, {
          headers: { 'User-Agent': 'XPTV-for-UZ-audit/1.0' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.text()
      } catch (error) {
        errors.push(`${new URL(candidate).host}#${attempt} ${error.message}`)
      }
    }
  }
  throw new Error(errors.join('; '))
}

for (const site of sites) {
  try {
    const code = await fetchSource(site.ext)
    if (!code || /<html/i.test(code)) throw new Error('not JavaScript')
    new vm.Script(code, { filename: site.ext })
    for (const match of code.matchAll(/(?:create|load)[A-Z]\w*|\$[A-Za-z_]\w*/g)) {
      discovered.add(match[0])
      if (!identifierSites.has(match[0])) identifierSites.set(match[0], new Set())
      identifierSites.get(match[0]).add(site.name)
    }
    for (const fn of ['getConfig', 'getCards', 'getTracks', 'getPlayinfo']) {
      if (!new RegExp(`(?:async\\s+)?function\\s+${fn}\\b`).test(code)) failures.push(`${site.name}: missing ${fn}`)
    }
    if (!/(?:async\s+)?function\s+search\b/.test(code)) warnings.push(`${site.catalog || 'XPTV'} - ${site.name}: search not implemented`)
  } catch (error) {
    failures.push(`${site.name}: ${error.message}`)
  }
}

const unknown = [...discovered].filter((name) => !knownRuntimeNames.has(name)).sort()
console.log(`Fetched and parsed ${sites.length - failures.filter((item) => !item.includes('missing ')).length}/${sites.length} upstream source files.`)
console.log(`Detected compatibility APIs: ${[...discovered].filter((name) => knownRuntimeNames.has(name)).sort().join(', ') || '(none)'}`)
if (warnings.length) console.warn(warnings.map((item) => `- ${item}`).join('\n'))
if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join('\n'))
  process.exit(1)
}
