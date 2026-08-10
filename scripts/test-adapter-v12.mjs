import assert from 'node:assert/strict'
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

const upstream = `
async function getConfig() {
  return jsonify({ tabs: [{ name: '电影', ext: { id: 1 } }] })
}
async function getCards(ext) {
  ext = argsify(ext)
  return jsonify({
    list: [{ vod_id: 'card-1', vod_name: '筛选:' + ((ext.filters || {}).year || '全部'), ext: { id: 'card-1' } }],
    filter: [{ key: 'year', name: '年份', value: [{ n: '全部', v: '' }, { n: '2026', v: '2026' }] }]
  })
}
async function getTracks() { return jsonify({ list: [] }) }
async function getPlayinfo() { return jsonify({ urls: [] }) }
async function search(ext) {
  ext = argsify(ext)
  return jsonify({ list: [{ vod_id: 'search-1', vod_name: [ext.text, ext.wd, ext.keyword].join('|'), ext: { id: 'search-1' } }] })
}
`

const context = vm.createContext({
  ArrayBuffer,
  Crypto: {},
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
  req: async (url) => ({ data: upstream, headers: {}, statusCode: 200 }),
})

new vm.Script(adapterCode, { filename: 'vod/js/xptv_jpyy.js' }).runInContext(context)

const classes = JSON.parse(await context.getClassList({}))
assert.equal(classes.error, '')
assert.equal(classes.data.length, 1)
assert.equal(classes.data[0].hasSubclass, true)

const subclasses = JSON.parse(await context.getSubclassList({ url: classes.data[0].type_id }))
assert.equal(subclasses.error, '')
assert.equal(subclasses.data.filter[0].name, '年份')
assert.deepEqual(subclasses.data.filter[0].list.map((item) => [item.name, item.id, item.key]), [
  ['全部', '', 'year'],
  ['2026', '2026', 'year'],
])

const filtered = JSON.parse(await context.getSubclassVideoList({
  mainClassId: classes.data[0].type_id,
  subclassId: '',
  page: 1,
  filter: [{ name: '2026', id: '2026', key: 'year' }],
}))
assert.equal(filtered.error, '')
assert.equal(filtered.data[0].vod_name, '筛选:2026')
assert.equal(filtered.total, 1)

const searched = JSON.parse(await context.searchVideo({ searchWord: '测试', page: 1 }))
assert.equal(searched.error, '')
assert.equal(searched.data[0].vod_name, '测试|测试|测试')
assert.equal(searched.total, 1)

console.log('Verified v1.2 XPTV-to-UZ class, filter, selected-filter, and search mappings.')
