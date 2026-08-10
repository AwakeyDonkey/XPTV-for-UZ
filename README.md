# XPTV for UZ

把 XPTV `VOD/XPTV.json` 与 `VOD/XPAV.json` 中的 JavaScript 视频源合并并转换为 UZ `type:101` 订阅包。当前清单包含 27 个 XPTV 源、29 个 XPAV 源，以及 1 个无需联网的诊断源。

> 这是实验性兼容层。仓库会验证清单、路径、JavaScript 语法和 ZIP 结构，但每个站点仍需在 UZ App 中分别测试分类、详情和播放。上游站点或 XPTV 私有运行能力变化时，个别源可能需要单独修补。

## 订阅地址

仓库发布后，把下面地址中的 `OWNER/REPO` 换成你的仓库：

```text
https://github.com/OWNER/REPO/releases/download/uz-latest/XPTV-for-UZ.zip
```

在 UZ 中打开：`设置 → 数据管理 → 订阅 → +`，粘贴上述 URL。

## 工作方式

- `sources.json` 保存两个上游订阅及合并后的源快照。
- `scripts/sync.mjs` 每次通过代理订阅同步 XPTV 和 XPAV 的 `type:3` JavaScript 源。
- 同步时从每个 JS 的 `appConfig.site`、`SITE` 或配置字段提取真实网站主页，并写入 UZ type:101 必需的 `webSite`。
- `vod/js/xptv_*.js` 在 UZ 运行时下载相应 XPTV JS，并提供 `$fetch`、Cheerio、Crypto、`$html` 等兼容能力。
- GitHub Actions 每天构建一次，并覆盖固定 `uz-latest` Release 中的 ZIP，订阅 URL 保持不变。
- `诊断 - UZ 兼容层状态` 不访问网络；如果它也显示“暂无数据”，问题不在上游订阅源。

## 本地检查

```bash
npm run build
```

输出文件：`dist/XPTV-for-UZ.zip`。

如需联网检查 27 个上游 JS 是否仍可访问并包含完整的 XPTV 接口：

```bash
npm run audit:upstream
```

## 已知限制

- 动态加载依赖 UZ 运行时允许构造异步函数；若你的 UZ 版本禁用了这一能力，所有源都会加载失败。
- `$cache` 当前是会话内缓存，不保证 App 重启后保留。
- 使用特殊 XPTV 私有 API、加密库或表单细节的源，可能需要专门适配。
- 本项目不托管视频内容，仅转换第三方扩展接口；使用者应自行确认来源、版权和当地法律要求。
