// ignore
//@name:XPTV - LIBVIO
//@webSite:https://www.libvios.com
//@version:3
//@remark:XPTV 动态兼容适配器；首次使用需要联网加载原始源
//@isAV:0
//@deprecated:0
// ignore

const XPTV_SOURCE_NAME = "LIBVIO"
const XPTV_SOURCE_URL = "https://ghp.xptvhelper.link/https://raw.githubusercontent.com/fangkuia/XPTV/refs/heads/main/js/libvio.js"
const XPTV_SOURCE_KEY = "libvio"
const XPTV_HAS_SEARCH = true
const XPTV_HAS_FILTERS = false

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

function xptvScalar(value) {
  if (value == null) return ''
  if (typeof value === 'object') return 'xptv-filter:' + encodeURIComponent(JSON.stringify(value))
  return String(value)
}

function xptvFilterValue(value) {
  const text = String(value == null ? '' : value)
  if (!text.startsWith('xptv-filter:')) return text
  try { return JSON.parse(decodeURIComponent(text.slice(12))) } catch (_) { return text }
}

function xptvFilterTitles(rawFilter) {
  let groups = []
  if (Array.isArray(rawFilter)) groups = rawFilter
  else if (rawFilter && typeof rawFilter === 'object') {
    groups = Object.keys(rawFilter).map((key) => {
      const value = rawFilter[key]
      return Array.isArray(value) ? { key: key, name: key, value: value } : value
    })
  }
  return groups.map((group, groupIndex) => {
    if (!group || typeof group !== 'object') return null
    const values = group.value || group.values || group.list || group.options || []
    if (!Array.isArray(values) || values.length === 0) return null
    const title = new FilterTitle()
    title.name = String(group.name || group.title || group.label || group.key || ('筛选' + (groupIndex + 1)))
    const key = String(group.key == null ? (group.id == null ? groupIndex : group.id) : group.key)
    title.list = values.map((option) => {
      const item = option && typeof option === 'object' ? option : { n: option, v: option }
      const label = new FilterLabel()
      label.name = String(item.n == null ? (item.name == null ? (item.label == null ? item.v : item.label) : item.name) : item.n)
      label.id = xptvScalar(item.v == null ? (item.id == null ? item.value : item.id) : item.v)
      label.key = key
      return label
    })
    return title
  }).filter(Boolean)
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
      download: async (url, options) => {
        const opts = options || {}
        const response = await req(url, { method: 'get', headers: opts.headers || {}, responseType: 'arraybuffer' })
        let bytes = response.data
        if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes)
        else if (ArrayBuffer.isView(bytes)) bytes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        else if (Array.isArray(bytes)) bytes = new Uint8Array(bytes)
        const data = bytes && typeof bytes.length === 'number'
          ? Array.from(bytes, (byte) => Number(byte).toString(2).padStart(8, '0')).join('')
          : xptvText(bytes)
        return { data: data, headers: response.headers || {}, respHeaders: response.headers || {}, status: response.statusCode || response.status || 200 }
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
    const loadJSEncrypt = createJSEncrypt
    const jsonify = (value) => JSON.stringify(value)
    const argsify = (value) => xptvParse(value)
    const $print = function () {}
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    const factory = new AsyncFunction(
      'createCheerio', 'createCryptoJS', 'createJSEncrypt', 'loadJSEncrypt', '$config_str', '$fetch', '$html', '$cache', '$print', '$utils', 'jsonify', 'argsify',
      sourceCode + '\n;return {' +
        'getConfig: typeof getConfig === "function" ? getConfig : null,' +
        'getCards: typeof getCards === "function" ? getCards : null,' +
        'getTracks: typeof getTracks === "function" ? getTracks : null,' +
        'getPlayinfo: typeof getPlayinfo === "function" ? getPlayinfo : null,' +
        'search: typeof search === "function" ? search : null' +
      '}'
    )
    return factory(createCheerio, createCryptoJS, createJSEncrypt, loadJSEncrypt, '{}', $fetch, $html, $cache, $print, $utils, jsonify, argsify)
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
      item.hasSubclass = XPTV_HAS_FILTERS
      return item
    })
  } catch (error) { backData.error = String(error) }
  return JSON.stringify(backData)
}

async function getSubclassList(args) {
  const backData = new RepVideoSubclassList()
  try {
    if (!XPTV_HAS_FILTERS) return JSON.stringify(backData)
    const runtime = await xptvLoadRuntime()
    if (!runtime.getCards) throw new Error('XPTV source does not implement getCards')
    const ext = xptvDecode(args.url)
    ext.page = 1
    const result = xptvParse(await runtime.getCards(JSON.stringify(ext)))
    const data = new VideoSubclass()
    data.filter = xptvFilterTitles(result.filter || result.filters)
    backData.data = data
  } catch (error) { backData.error = String(error) }
  return JSON.stringify(backData)
}

async function getVideoList(args) {
  const backData = new RepVideoList()
  try {
    const runtime = await xptvLoadRuntime()
    if (!runtime.getCards) throw new Error('XPTV source does not implement getCards')
    const ext = xptvDecode(args.url)
    ext.page = args.page || 1
    const result = xptvParse(await runtime.getCards(JSON.stringify(ext)))
    const list = Array.isArray(result.list) ? result.list : []
    backData.data = list.map(xptvCardToVideo)
    backData.total = Number(result.total == null ? list.length : result.total)
  } catch (error) { backData.error = String(error) }
  return JSON.stringify(backData)
}

async function getSubclassVideoList(args) {
  const backData = new RepVideoList()
  try {
    const runtime = await xptvLoadRuntime()
    if (!runtime.getCards) throw new Error('XPTV source does not implement getCards')
    const ext = xptvDecode(args.subclassId || args.mainClassId || args.url)
    ext.page = args.page || 1
    ext.filters = {}
    const selected = Array.isArray(args.filter) ? args.filter : []
    selected.forEach((item) => {
      if (item && item.key != null) ext.filters[String(item.key)] = xptvFilterValue(item.id)
    })
    const result = xptvParse(await runtime.getCards(JSON.stringify(ext)))
    const list = Array.isArray(result.list) ? result.list : []
    backData.data = list.map(xptvCardToVideo)
    backData.total = Number(result.total == null ? list.length : result.total)
  } catch (error) { backData.error = String(error) }
  return JSON.stringify(backData)
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
    if (!XPTV_HAS_SEARCH || !runtime.search) throw new Error('XPTV source does not implement search')
    const keyword = String(args.searchWord || '').trim()
    if (!keyword) return JSON.stringify(backData)
    const result = xptvParse(await runtime.search(JSON.stringify({ text: keyword, wd: keyword, keyword: keyword, page: args.page || 1 })))
    const list = Array.isArray(result.list) ? result.list : []
    backData.data = list.map(xptvCardToVideo)
    backData.total = Number(result.total == null ? list.length : result.total)
  } catch (error) { backData.error = String(error) }
  return JSON.stringify(backData)
}
