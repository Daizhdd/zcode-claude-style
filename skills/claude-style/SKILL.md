---
name: claude-style
description: 给 ZCode 桌面客户端套用 Claude Code Desktop 风格皮肤（暖色色卡、衬线标题、Deepy 鲸鱼、双色卡切换面板）。当用户说“换成 Claude 风格”“装 claude-style”“把 ZCode 弄成 Claude Code 的样子”“换回默认外观”时使用。
---

# ZCode Claude Style

把 [dsh-claude-style](https://github.com/Nwflower/dsh-claude-style) 的设计令牌
（颜色梯度、字体、圆角、动效）翻译到 ZCode 桌面客户端的 Tailwind v4 语义 token 上，
并通过 CDP 注入渲染进程实现。不修改 ZCode 安装文件。

## 结构

| 层 | 位置 | 作用 |
| --- | --- | --- |
| 色卡 | `src/theme/palette.mjs` | Claude / DeepSeek 两张卡的明暗取值，逐项照搬上游设计令牌表 |
| 令牌 + 形状 | `src/theme/css.mjs` | 映射到 `--color-*`、重映射中性色阶、字体/圆角/滚动条/链接/内联码 |
| 动效 | `src/theme/motion.mjs` | 独立样式表：控件反馈、按压回弹、浮层进出、聚焦过渡；扫光、逐词入场暖光、推理滑块上色、满档沸腾渐变、换卡 View Transition 伪元素动画。面板可实时开关 |
| 运行时 | `src/runtime/client.js` | 注入到渲染进程：主题切换、Deepy 鲸鱼状态机、侧栏「cc-风格」导航项 + 整页设置 |
| 注入 | `src/lib/{cdp,inject,launcher}.mjs` | CDP 连接、payload 构建、带调试端口启动 ZCode |
| 常驻 | `src/mcp/server.mjs` | 清单声明的 MCP host：ZCode 启动即拉起，开机注入 + 4 秒巡检；暴露 5 个工具 |
| CLI | `src/cli.mjs` | `apply` / `launch` / `status` / `reset` / `css` / `shot` / `resident` |

## 常驻与工具

插件清单里的 `mcpServers` 让 **ZCode 自己 spawn `src/mcp/server.mjs`** 并保持它，
所以不需要手动 apply，也不需要守护进程。优先用 MCP 工具而不是 CLI：

- `claude_style_status` — 皮肤是否在线、当前色卡、端口
- `claude_style_apply` — 换色卡 / 开关鲸鱼·字体·动效
- `claude_style_reset` — 撤回皮肤
- `claude_style_launch` — 带调试端口启动 ZCode
- `claude_style_watch` — 开关巡检

## 何时用哪个命令

- 用户要换风格、或打开 ZCode 后皮肤没了 → `apply`（先 `status` 看端口）
- 报“连不上 CDP” → 让用户完全退出 ZCode，再 `launch`
- 只想调色卡 / 关鲸鱼 / 关字体 / 关动效 → `apply --card deepseek --no-mascot --no-fonts --no-motion`
- 想恢复原样 → `reset`
- 想检查设计令牌对不对 → `css --card claude --scheme dark --out <file>`

## 已知限制

- 皮肤随 ZCode 进程存活；重启 ZCode 后由常驻 MCP host 自动补注入，不用手动 apply。
  改完插件目录里的 CSS 后也一样：巡检比对样式指纹（4 秒内推上去）。
  巡检与 CLI 各带构建时间戳，只会接管比自己更旧的窗口，不会互相覆盖。
- 字体族默认**全衬线**：西文 Source Serif 4 + 中文思源宋体（Noto Serif SC，走系统字体，
  不打包），代码块保持 JetBrains Mono。不喜欢就关面板里的「衬线字体」或 `apply --no-serif`。
  附带两条排版规则：光学尺寸轴 `font-optical-sizing: auto`、深色下字重降一档（400→360）。
- 设置入口是侧栏导航项，不是浮窗；它克隆「插件市场」那条按钮，宿主改结构时会自动补插。
- 鲸鱼状态是 DOM 启发式推断（停止按钮、子代理标记、对话框、alert），
  不保证与上游 dsh 版的八态完全一致；ZCode 改 DOM 后要重新校准。
- 上游 Anthropic 自有字体未公开分发，这里用的是 OFL 授权的
  Inter / Noto Serif / JetBrains Mono，观感接近而非逐像素一致。
