// ignore
//@name:诊断 - UZ 兼容层状态
//@webSite:https://github.com/AwakeyDonkey/XPTV-for-UZ
//@version:1
//@remark:无需联网；用于确认 UZ type:101 扩展是否正常运行
//@isAV:0
//@deprecated:0
// ignore

const appConfig = {
  _webSite: '',
  get webSite() { return this._webSite },
  set webSite(value) { this._webSite = value },
  _uzTag: '',
  get uzTag() { return this._uzTag },
  set uzTag(value) { this._uzTag = value },
}

async function getClassList(args) {
  const backData = new RepVideoClassList()
  const item = new VideoClass()
  item.type_id = 'diagnostic-ok'
  item.type_name = '兼容层运行正常'
  item.hasSubclass = false
  backData.data = [item]
  return JSON.stringify(backData)
}

async function getSubclassList(args) {
  return JSON.stringify(new RepVideoSubclassList())
}

async function getVideoList(args) {
  const backData = new RepVideoList()
  const item = new VideoDetail()
  item.vod_id = 'diagnostic-detail'
  item.vod_name = 'UZ 已成功执行订阅扩展'
  item.vod_remarks = '若其他源为空，请检查远程 JS 加载或站点访问'
  item.vod_content = '该条目完全由本地 JavaScript 生成，不依赖任何网络请求。'
  backData.data = [item]
  backData.total = 1
  return JSON.stringify(backData)
}

async function getSubclassVideoList(args) {
  return getVideoList(args)
}

async function getVideoDetail(args) {
  const backData = new RepVideoDetail()
  const item = new VideoDetail()
  item.vod_id = 'diagnostic-detail'
  item.vod_name = 'UZ 兼容层诊断通过'
  item.vod_content = '订阅包、local.json 路径和 type:101 JavaScript 执行均正常。'
  item.vod_play_from = '诊断'
  item.vod_play_url = '无需播放$diagnostic-play'
  backData.data = item
  return JSON.stringify(backData)
}

async function getVideoPlayUrl(args) {
  const backData = new RepVideoPlayUrl()
  backData.error = '这是诊断条目，不提供视频播放。'
  return JSON.stringify(backData)
}

async function searchVideo(args) {
  return getVideoList(args)
}
