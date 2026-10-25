// ignore
//@name:XPAV - KanAV
//@webSite:https://kanav.info
//@version:5
//@remark:XPTV 动态兼容适配器；首次使用需要联网加载原始源
//@isAV:1
//@deprecated:0
// ignore

const XPTV_SOURCE_NAME = "KanAV"
const XPTV_SOURCE_URL = "https://ghp.xptvhelper.link/https://raw.githubusercontent.com/fangkuia/XPTV/refs/heads/main/js/kanav.js"
const XPTV_SOURCE_KEY = "kanav"

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
  if (value == null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

// Expose response headers under their original, lower-case and Title-Case names, so upstream
// code such as respHeaders['Set-Cookie'].split(';') works whatever casing UZ returns.
function xptvHeaders(raw) {
  const headers = {}
  if (!raw || typeof raw !== 'object') return headers
  Object.keys(raw).forEach((key) => {
    const value = raw[key]
    const text = Array.isArray(value) ? value.join(', ') : String(value == null ? '' : value)
    headers[key] = value
    const lower = key.toLowerCase()
    const title = lower.replace(/(^|-)([a-z])/g, (_, dash, ch) => dash + ch.toUpperCase())
    if (!(lower in headers)) headers[lower] = text
    if (!(title in headers)) headers[title] = text
  })
  return headers
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

// UZ req() never throws: on a network failure it resolves with data null and the reason in
// error. Surface that reason instead of letting upstream code fail on JSON.parse('null').data.
function xptvCheckResponse(url, response) {
  if (response.data != null || !response.error) return
  const code = response.code ? ' (HTTP ' + response.code + ')' : ''
  throw new Error('网络请求失败' + code + ': ' + response.error + ' — ' + String(url).split('?')[0])
}

function xptvStatus(response) {
  return response.code || response.statusCode || response.status || 200
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
  const response = (await req(url, reqOptions)) || {}
  xptvCheckResponse(url, response)
  const headers = xptvHeaders(response.headers)
  return {
    data: xptvText(response.data),
    headers: headers,
    respHeaders: headers,
    status: xptvStatus(response),
  }
}

async function xptvLoadRuntime() {
  if (xptvRuntimePromise) return xptvRuntimePromise
  xptvRuntimePromise = (async () => {
    const sourceResponse = (await req(XPTV_SOURCE_URL, { method: 'get', responseType: 'plain' })) || {}
    xptvCheckResponse(XPTV_SOURCE_URL, sourceResponse)
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
  xptvRuntimePromise.catch(() => { xptvRuntimePromise = null })
  return xptvRuntimePromise
}

// Many XPTV sources set cookies or tokens inside getConfig(). UZ can open search results,
// details or playback without calling getClassList first, so run it once before any entry point.
let xptvConfigPromise = null
function xptvLoadConfig(runtime) {
  if (!runtime.getConfig) return Promise.resolve({})
  if (!xptvConfigPromise) {
    xptvConfigPromise = Promise.resolve().then(() => runtime.getConfig()).then(xptvParse)
    xptvConfigPromise.catch(() => { xptvConfigPromise = null })
  }
  return xptvConfigPromise
}

async function xptvReady() {
  const runtime = await xptvLoadRuntime()
  try { await xptvLoadConfig(runtime) } catch (_) {}
  return runtime
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
    const runtime = await xptvReady()
    if (!runtime.getConfig) throw new Error('XPTV source does not implement getConfig')
    const config = await xptvLoadConfig(runtime)
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
    const runtime = await xptvReady()
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
    const runtime = await xptvReady()
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
    const runtime = await xptvReady()
    if (!runtime.getPlayinfo) throw new Error('XPTV source does not implement getPlayinfo')
    const result = xptvParse(await runtime.getPlayinfo(JSON.stringify(xptvDecode(args.url))))
    const urls = Array.isArray(result.urls) ? result.urls : []
    const playHeaders = Array.isArray(result.headers)
      ? ((result.headers[0] && typeof result.headers[0] === 'object') ? result.headers[0] : {})
      : ((result.headers && typeof result.headers === 'object') ? result.headers : {})
    backData.data = typeof urls[0] === 'string' ? urls[0] : ((urls[0] && urls[0].url) || result.url || '')
    backData.headers = playHeaders || undefined
    backData.urls = urls.map((item, index) => typeof item === 'string'
      ? { name: '线路' + (index + 1), url: item, headers: playHeaders || {}, priority: urls.length - index }
      : item)
  } catch (error) { backData.error = String(error) }
  return JSON.stringify(backData)
}

async function searchVideo(args) {
  const backData = new RepVideoList()
  try {
    const runtime = await xptvReady()
    if (!runtime.search) throw new Error('XPTV source does not implement search')
    const result = xptvParse(await runtime.search(JSON.stringify({ text: args.searchWord || '', page: args.page || 1 })))
    backData.data = (Array.isArray(result.list) ? result.list : []).map(xptvCardToVideo)
    backData.total = Number(result.total || 0)
  } catch (error) { backData.error = String(error) }
  return JSON.stringify(backData)
}
