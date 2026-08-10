import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const adapterCode = fs.readFileSync(path.join(root, 'vod/js/xptv_jpyy.js'), 'utf8')

class VideoClass { constructor() { this.type_id = ''; this.type_name = ''; this.hasSubclass = false } }
class FilterLabel { constructor() { this.name = ''; this.id = ''; this.key = '' } }
class FilterTitle { constructor() { this.name = ''; this.list = [] } }
class VideoSubclass { constructor() { this.class = []; this.filter = [] } }
class VideoDetail { constructor() { this.vod_id = ''; this.vod_name = ''; this.vod_pic = ''; this.vod_remarks = '' } }
class RepVideoClassList { constructor() { this.data = []; this.error = '' } }
class RepVideoSubclassList { constructor() { this.data = new VideoSubclass(); this.error = '' } }
class RepVideoList { constructor() { this.data = []; this.error = ''; this.total = 0 } }
class RepVideoDetail { constructor() { this.data = null; this.error = '' } }
class RepVideoPlayUrl { constructor() { this.data = ''; this.error = ''; this.urls = [] } }

const digest = (algorithm, value) => ({
  toString: () => crypto.createHash(algorithm).update(String(value)).digest('hex'),
})

async function req(url, options = {}) {
  const target = new URL(url)
  for (const [key, value] of Object.entries(options.queryParameters || {})) target.searchParams.set(key, value)
  const response = await fetch(target, {
    method: String(options.method || 'get').toUpperCase(),
    headers: options.headers || {},
    body: options.data == null ? undefined : options.data,
  })
  const data = options.responseType === 'arraybuffer' ? await response.arrayBuffer() : await response.text()
  return { data, headers: Object.fromEntries(response.headers.entries()), statusCode: response.status }
}

const context = vm.createContext({
  ArrayBuffer,
  Crypto: { MD5: (value) => digest('md5', value), SHA1: (value) => digest('sha1', value) },
  Encrypt: {},
  FilterLabel,
  FilterTitle,
  RepVideoClassList,
  RepVideoDetail,
  RepVideoList,
  RepVideoPlayUrl,
  RepVideoSubclassList,
  Uint8Array,
  VideoClass,
  VideoDetail,
  VideoSubclass,
  cheerio: {},
  console,
  encodeURIComponent,
  decodeURIComponent,
  req,
})

new vm.Script(adapterCode, { filename: 'vod/js/xptv_jpyy.js' }).runInContext(context)

const classes = JSON.parse(await context.getClassList({}))
assert.equal(classes.error, '')
assert.ok(classes.data.length > 0)
assert.equal(classes.data[0].hasSubclass, true)

const subclasses = JSON.parse(await context.getSubclassList({ url: classes.data[0].type_id }))
assert.equal(subclasses.error, '')
assert.ok(subclasses.data.filter.length >= 4)
assert.ok(subclasses.data.filter.some((group) => group.name === '年份'))

const searched = JSON.parse(await context.searchVideo({ searchWord: '斗罗', page: 1 }))
assert.equal(searched.error, '')
assert.ok(searched.data.length > 0)

console.log(`Live v1.2 smoke passed: ${classes.data.length} classes, ${subclasses.data.filter.length} filter groups, ${searched.data.length} search results.`)
