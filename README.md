# 人话翻译器

将网页上的专业/难懂文本，通过你自备的 LLM API「翻译成人话」。

已上架：
- [Chrome](https://chromewebstore.google.com/detail/genddacnaonloeecodkncflhpcdbcmdh)
- [Edge](https://microsoftedge.microsoft.com/addons/detail/%E4%BA%BA%E8%AF%9D%E7%BF%BB%E8%AF%91%E5%99%A8/nfcgnclfgdeocdakoconadlbonnjaglj)
- [Firefox](https://addons.mozilla.org/zh-CN/firefox/addon/%E4%BA%BA%E8%AF%9D%E7%BF%BB%E8%AF%91%E5%99%A8/)

## 功能

- **侧边栏工作台**（Chrome / Edge）：点击扩展图标打开常驻侧边栏，适合长文
- **页内划词翻译**：选中文本后浮动按钮 / 右键 / `Alt+H`
- **流式输出** + 思考过程展示
- **历史记录**（导入 / 导出）
- **BYOK**：DeepSeek / OpenAI 等兼容接口

## 使用

1. 安装扩展，打开侧边栏（点图标）或设置页配置 API Key
2. 网页选中文本 → 点「译」/ 右键「翻译成人话」/ `Alt+H`
3. 或在侧边栏直接粘贴文本，`Enter` 发送（`Shift+Enter` 换行）

## 开发

```bash
npm install
npm run build          # 打包 background.js（OpenAI SDK）
```

在 `chrome://extensions` 加载本目录（需先 build）。

## 结构

```
├── sidepanel/          # 侧边栏 UI
├── content/content.js  # 页内弹窗 + 划词按钮
├── options/            # 设置页
├── src/background/     # Service Worker 源码
├── background.js       # build 产物
├── manifest.json
└── scripts/build.mjs
```
