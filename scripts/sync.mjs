import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcesPath = path.join(root, 'sources.json')
const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'))
const shouldFetch = !process.argv.includes('--offline')

if (shouldFetch) {
  try {
    if (!Array.isArray(sources.upstreams) || sources.upstreams.length === 0) throw new Error('upstreams[] is empty')
    const catalogs = await Promise.all(sources.upstreams.map(async (item) => {
      let response
      let primaryError = ''
      try {
        response = await fetch(item.url, { headers: { 'User-Agent': 'XPTV-for-UZ-sync/2.0' } })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
      } catch (error) {
        primaryError = error.message
        if (!item.fallbackUrl) throw error
        response = await fetch(item.fallbackUrl, { headers: { 'User-Agent': 'XPTV-for-UZ-sync/2.0' } })
        if (!response.ok) throw new Error(`${item.catalog}: primary ${primaryError}; fallback HTTP ${response.status}`)
        console.warn(`${item.catalog}: primary proxy unavailable (${primaryError}); used canonical fallback`)
      }
      const upstream = await response.json()
      if (!Array.isArray(upstream.sites) || upstream.sites.length === 0) throw new Error(`${item.catalog}: sites[] is empty`)
      return upstream.sites
        .filter((site) => site && site.type === 3 && typeof site.ext === 'string' && site.ext.startsWith('http'))
        .map((site) => ({ ...site, catalog: item.catalog, isAV: Boolean(item.isAV) }))
    }))
    const merged = catalogs.flat()
    const seen = new Set()
    sources.sites = merged.filter((site) => {
      const key = `${site.catalog}:${site.api || site.name}:${site.ext}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    sources.syncedAt = new Date().toISOString()
    fs.writeFileSync(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`)
  } catch (error) {
    console.warn(`Upstream sync unavailable; using checked-in snapshot: ${error.message}`)
  }
}

const outputDir = path.join(root, 'vod', 'js')
fs.mkdirSync(outputDir, { recursive: true })

const slugCounts = new Map()
const slugify = (site, index) => {
  const fromApi = String(site.api || '').replace(/^csp_/i, '')
  let slug = fromApi.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  if (!slug) slug = `source_${String(index + 1).padStart(2, '0')}`
  const count = (slugCounts.get(slug) || 0) + 1
  slugCounts.set(slug, count)
  return count === 1 ? slug : `${slug}_${count}`
}

const jsString = (value) => JSON.stringify(String(value))

const adapter = (site, slug) => `// ignore
//@name:${site.catalog || 'XPTV'} - ${site.name}
//@webSite:${site.ext}
//@version:1
//@remark:XPTV 动态兼容适配器；首次使用需要联网加载原始源
//@isAV:${site.isAV ? 1 : 0}
//@deprecated:0
// ignore

const XPTV_SOURCE_NAME = ${jsString(site.name)}
const XPTV_SOURCE_URL = ${jsString(site.ext)}
const XPTV_SOURCE_KEY = ${jsString(slug)}

const appConfig = {
  _webSite: '',
  get webSite() { return this._webSite },
  set webSite(value) { this._webSite = value },
  _uzTag: '',
  get uzTag() { return this._uzTag },
  set uzTag(value) { this._uzTag = value },
}

let xptvRuntimePromise = null
const xptvMemoryCache = {}

function xptvText(value) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function xptvParse(value) {
  if (value == null || value === '') return {}
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch (_) { return {} }
}

function xptvEncode(value) {
  return 'xptv:' + encodeURIComponent(JSON.stringify(value || {}))
}

function xptvDecode(value) {
  const text = String(value || '')
  if (!text.startsWith('xptv:')) return { id: text, url: text }
  try { return JSON.parse(decodeURIComponent(text.slice(5))) } catch (_) { return {} }
}

function xptvCheerioTools() {
  return {
    elements(html, selector) {
      const $ = cheerio.load(String(html || ''))
      return $(selector).toArray().map((node) => $.html(node))
    },
    text(html, selector) {
      const $ = cheerio.load(String(html || ''))
      const found = selector ? $(selector).first() : $.root()
      return found.text()
    },
    attr(html, selector, name) {
      const $ = cheerio.load(String(html || ''))
      return ($(selector).first().attr(name) || '')
    },
    html(html, selector) {
      const $ = cheerio.load(String(html || ''))
      return ($(selector).first().html() || '')
    },
  }
}

async function xptvRequest(method, url, options) {
  const opts = options || {}
  const reqOptions = {
    method: method,
    headers: opts.headers || {},
    responseType: 'plain',
  }
  if (opts.params) reqOptions.queryParameters = opts.params
  if (opts.data != null) reqOptions.data = opts.data
  if (opts.body != null) reqOptions.data = opts.body
  const response = await req(url, reqOptions)
  return {
    data: xptvText(response.data),
    headers: response.headers || {},
    respHeaders: response.headers || {},
    status: response.statusCode || response.status || 200,
  }
}

async function xptvLoadRuntime() {
  if (xptvRuntimePromise) return xptvRuntimePromise
  xptvRuntimePromise = (async () => {
    const sourceResponse = await req(XPTV_SOURCE_URL, { method: 'get', responseType: 'plain' })
    const sourceCode = xptvText(sourceResponse.data)
    if (!sourceCode || sourceCode.includes('<html')) throw new Error('XPTV source download returned invalid JavaScript')

    const $fetch = {
      get: (url, options) => xptvRequest('get', url, options),
      post: (url, dataOrOptions, maybeOptions) => {
        if (maybeOptions) return xptvRequest('post', url, Object.assign({}, maybeOptions, { data: dataOrOptions }))
        if (dataOrOptions && typeof dataOrOptions === 'object') return xptvRequest('post', url, dataOrOptions)
        return xptvRequest('post', url, { data: dataOrOptions })
      },
    }
    const $cache = {
      get: (key) => xptvMemoryCache[key],
      set: (key, value) => { xptvMemoryCache[key] = value },
      remove: (key) => { delete xptvMemoryCache[key] },
    }
    const $html = xptvCheerioTools()
    const $utils = {
      openSafari: (url, ua) => {
        if (typeof goToVerify === 'function') return goToVerify(url, {}, ua || '')
      },
    }
    const createCheerio = () => cheerio
    const createCryptoJS = () => Crypto
    const createJSEncrypt = () => {
      if (typeof Encrypt !== 'undefined' && Encrypt.JSEncrypt) return new Encrypt.JSEncrypt()
      throw new Error('JSEncrypt is not available in this UZ build')
    }
    const jsonify = (value) => JSON.stringify(value)
    const argsify = (value) => xptvParse(value)
    const $print = function () {}
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    const factory = new AsyncFunction(
      'createCheerio', 'createCryptoJS', 'createJSEncrypt', '$fetch', '$html', '$cache', '$print', '$utils', 'jsonify', 'argsify',
      sourceCode + '\\n;return {' +
        'getConfig: typeof getConfig === "function" ? getConfig : null,' +
        'getCards: typeof getCards === "function" ? getCards : null,' +
        'getTracks: typeof getTracks === "function" ? getTracks : null,' +
        'getPlayinfo: typeof getPlayinfo === "function" ? getPlayinfo : null,' +
        'search: typeof search === "function" ? search : null' +
      '}'
    )
    return factory(createCheerio, createCryptoJS, createJSEncrypt, $fetch, $html, $cache, $print, $utils, jsonify, argsify)
  })()
  return xptvRuntimePromise
}

function xptvCardToVideo(card) {
  const video = new VideoDetail()
  const ext = card.ext || { id: card.vod_id || '', url: card.vod_id || '' }
  video.vod_id = xptvEncode({ ext: ext, card: card })
  video.vod_name = card.vod_name || card.name || ''
  video.vod_pic = card.vod_pic || card.pic || ''
  video.vod_remarks = card.vod_remarks || card.remarks || ''
  video.type_name = card.type_name || ''
  return video
}

async function getClassList(args) {
  const backData = new RepVideoClassList()
  try {
    const runtime = await xptvLoadRuntime()
    if (!runtime.getConfig) throw new Error('XPTV source does not implement getConfig')
    const config = xptvParse(await runtime.getConfig())
    const tabs = Array.isArray(config.tabs) ? config.tabs : []
    backData.data = tabs.map((tab, index) => {
      const item = new VideoClass()
      item.type_id = xptvEncode(tab.ext || { id: index })
      item.type_name = tab.name || String(index + 1)
      item.hasSubclass = false
      return item
    })
  } catch (error) { backData.error = String(error) }
  return JSON.stringify(backData)
}

async function getSubclassList(args) {
  return JSON.stringify(new RepVideoSubclassList())
}

async function getVideoList(args) {
  const backData = new RepVideoList()
  try {
    const runtime = await xptvLoadRuntime()
    if (!runtime.getCards) throw new Error('XPTV source does not implement getCards')
    const ext = xptvDecode(args.url)
    ext.page = args.page || 1
    const result = xptvParse(await runtime.getCards(JSON.stringify(ext)))
    backData.data = (Array.isArray(result.list) ? result.list : []).map(xptvCardToVideo)
    backData.total = Number(result.total || 0)
  } catch (error) { backData.error = String(error) }
  return JSON.stringify(backData)
}

async function getSubclassVideoList(args) {
  return getVideoList({ url: args.subclassId || args.mainClassId || args.url, page: args.page || 1 })
}

async function getVideoDetail(args) {
  const backData = new RepVideoDetail()
  try {
    const runtime = await xptvLoadRuntime()
    if (!runtime.getTracks) throw new Error('XPTV source does not implement getTracks')
    const payload = xptvDecode(args.url)
    const card = payload.card || {}
    const detail = xptvCardToVideo(card)
    detail.vod_id = args.url
    const result = xptvParse(await runtime.getTracks(JSON.stringify(payload.ext || payload)))
    const groups = Array.isArray(result.list) ? result.list : []
    detail.vod_play_from = groups.map((group, index) => group.title || ('线路' + (index + 1))).join('$$$')
    detail.vod_play_url = groups.map((group) => {
      const tracks = Array.isArray(group.tracks) ? group.tracks : []
      return tracks.map((track, index) => {
        const name = String(track.name || ('第' + (index + 1) + '集')).replace(/[#$]/g, ' ')
        return name + '$' + xptvEncode(track.ext || { url: track.url || '' })
      }).join('#')
    }).join('$$$')
    backData.data = detail
  } catch (error) { backData.error = String(error) }
  return JSON.stringify(backData)
}

async function getVideoPlayUrl(args) {
  const backData = new RepVideoPlayUrl()
  try {
    const runtime = await xptvLoadRuntime()
    if (!runtime.getPlayinfo) throw new Error('XPTV source does not implement getPlayinfo')
    const result = xptvParse(await runtime.getPlayinfo(JSON.stringify(xptvDecode(args.url))))
    const urls = Array.isArray(result.urls) ? result.urls : []
    backData.data = typeof urls[0] === 'string' ? urls[0] : ((urls[0] && urls[0].url) || result.url || '')
    backData.headers = result.headers || undefined
    backData.urls = urls.map((item, index) => typeof item === 'string'
      ? { name: '线路' + (index + 1), url: item, headers: result.headers || {}, priority: urls.length - index }
      : item)
  } catch (error) { backData.error = String(error) }
  return JSON.stringify(backData)
}

async function searchVideo(args) {
  const backData = new RepVideoList()
  try {
    const runtime = await xptvLoadRuntime()
    if (!runtime.search) throw new Error('XPTV source does not implement search')
    const result = xptvParse(await runtime.search(JSON.stringify({ text: args.searchWord || '', page: args.page || 1 })))
    backData.data = (Array.isArray(result.list) ? result.list : []).map(xptvCardToVideo)
    backData.total = Number(result.total || 0)
  } catch (error) { backData.error = String(error) }
  return JSON.stringify(backData)
}
`

const generated = []
const local = [{
  name: '诊断 - UZ 兼容层状态',
  version: 1,
  remark: '无需联网；用于确认订阅包和 UZ type:101 扩展运行是否正常',
  api: 'vod/js/diagnostic.js',
  type: 101,
}]
sources.sites.forEach((site, index) => {
  const slug = slugify(site, index)
  const fileName = `xptv_${slug}.js`
  generated.push(fileName)
  fs.writeFileSync(path.join(outputDir, fileName), adapter(site, slug))
  local.push({
    name: `${site.catalog || 'XPTV'} - ${site.name}`,
    version: 1,
    remark: `${site.catalog || 'XPTV'} 动态兼容适配器（实验性）`,
    api: `vod/js/${fileName}`,
    type: 101,
  })
})

for (const fileName of fs.readdirSync(outputDir)) {
  if (fileName.startsWith('xptv_') && fileName.endsWith('.js') && !generated.includes(fileName)) {
    fs.unlinkSync(path.join(outputDir, fileName))
  }
}

fs.writeFileSync(path.join(root, 'local.json'), `${JSON.stringify(local, null, 2)}\n`)
console.log(`Generated ${sources.sites.length} UZ adapters plus 1 diagnostic source.`)
