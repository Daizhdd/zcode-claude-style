# zcode-claude-style

把 [dsh-claude-style](https://github.com/Nwflower/dsh-claude-style) 的设计语言搬到
**ZCode 桌面客户端**：暖色编辑风色卡、衬线标题、细边框、Deepy 小鲸鱼，以及一个
以及一条挂在侧栏里的 **「cc-风格」** 导航项 —— 点进去是一整页设置，切色卡、开关鲸鱼与字体。

```
┌─────────────┬──────────────────────────────────────────┐
│  ZCode      │  Claude 风格落地                          │
│  ─────      │                                          │
│  今天       │              ┌────────────────────────┐  │
│ ▸ 落地记录  │              │ 把 ZCode 换成 Claude 风格 │  │
│   dsh 调研  │              └────────────────────────┘  │
│   token 映射 │  实现方式                                 │
│             │  ZCode 的界面是 Tailwind v4 语义 token，    │
│             │  换肤的关键不是复制 CSS，而是翻译设计梯度。 │
│             │  ┌────────────────────────────────────┐  │
│             │  │ const theme = buildCss({...})      │  │
│             │  └────────────────────────────────────┘  │
│  › cc-风格  │  ┃ 初版先对齐颜色与形状                   │
└─────────────┴──────────────────────────────────────────┘
```

## 和上游的关系

上游是 DeepSeek Harness 的 Web GUI 主题插件，靠宿主的 `--dsw-alias-*` 别名注入。
ZCode 用的是另一套 Tailwind v4 语义 token（`--color-*`），所以这里**不是复制 CSS，
而是把同一套设计令牌翻译过去**：

| 上游 | 这里 | 说明 |
| --- | --- | --- |
| `--dsw-alias-bg-base` | `--color-background` | 画布 |
| `--dsw-alias-bg-layer-1..3` | `--color-background-alt` / `--color-card` / `--color-input` | 层叠面 |
| `--dsw-alias-brand-primary` | `--color-brand` | 唯一强调色（Claude 陶土 / DeepSeek 蓝） |
| `--dsw-alias-label-primary/secondary/tertiary` | `--color-foreground` / `-subtle` / `-subtlest` | 三级墨色 |
| `--dsw-alias-border-l1..3` | `--color-border` / `-hover` / `--color-card-border` | 1px 边线（深色是白色高光） |
| `--dsh-claude-*` 私有令牌 | `--zcs-*` | 面板、鲸鱼、动效时长 |
| `--tw-prose-*`（ZCode 专属） | 由色卡重写 | 标题/引用/代码块的墨色，否则深色下看不见 |

三处刻意的取舍：

1. **字体**：上游只提供 Anthropic 字体的下载副本，没有公开授权。这里改用 OFL 授权的
   Inter（正文）、Noto Serif（标题）、JetBrains Mono（代码），观感接近而非逐像素一致。
2. **明暗**：不做「强制亮/暗」开关。ZCode 的 `dark:` 工具类由它自己的 `.dark`
   决定，硬掰只会让一半组件打架；皮肤跟随应用主题。
3. **鲸鱼**：上游是宿主内建的八态精灵图；这里的八个 GIF 来自上游仓库，
   状态是从 ZCode 的 DOM 推断的（停止按钮 / 子代理标记 / 审批对话框 / alert / 静默时长）。

## 原理

```
CLI ── CDP ──▶ ZCode 渲染进程
                ├── #zcode-claude-style-fonts   @font-face（Inter / Noto Serif / JetBrains Mono）
                ├── #zcode-claude-style-theme   当前色卡的 token + 形状覆盖
                ├── #zcode-claude-style-mascot  Deepy（fixed 定位，跟随输入框）
                └── #zcode-claude-style-panel-host  左下角 ◐ 设置面板（Shadow DOM）
```

- **常驻方式见下节**；注入通过 `Page.addScriptToEvaluateOnNewDocument` 注册，窗口重载后自动恢复；
- payload 里带四套样式表（2 色卡 × 明暗），面板切换不需要再连 CLI；
- 面板选择写进 `localStorage`，`--zcs-*` 私有变量保证不和宿主 token 撞名；
- 不改 `app.asar`，不写 ZCode 安装目录。

## 安装

### 前置条件：ZCode 必须带调试端口启动

皮肤是通过 Chrome DevTools Protocol 注入渲染进程实现的，所以 ZCode 得开着调试端口：

```
ZCode.exe --remote-debugging-port=9222
```

最省事的做法：右键 ZCode 快捷方式 → 属性 →「目标」末尾加一个空格，
再粘贴 `--remote-debugging-port=9222`。以后双击快捷方式就自带端口。

> **没有端口会怎样**：插件能装上、常驻 host 也会起来，但皮肤不生效，
> 日志里会一直重复 `waiting for a debug port`。这是唯一必须做的准备工作。

### 方式一：从 GitHub 添加市场（推荐）

ZCode → 设置 → 插件市场 → 发现 → `+` → 添加插件市场，来源填：

```
Daizhdd/zcode-claude-style
```

（那个输入框支持「GitHub 仓库、Git URL、文件或目录」三种形式，`owner/repo` 可以直接填。）
勾选风险确认后添加，然后在市场里找到 `zcode-claude-style` 点「安装」。

### 方式二：本地目录

```bash
git clone https://github.com/Daizhdd/zcode-claude-style
```

添加插件市场 → 选择目录 → 指向 clone 下来的目录（里面有 `marketplace.json`）。

### 方式三：命令行（开发用）

```bash
node scripts/install.mjs    # 写插件缓存与安装记录（幂等，会先备份配置）
node src/cli.mjs launch     # 带调试端口启动 ZCode 并注入
```

`scripts/install.mjs` 会先备份 `known_marketplaces.json` / `installed_plugins.json`，
再写入市场与安装记录，可以重复执行。

### 装完怎么确认

- 侧栏出现「cc-风格」这一行 → 注入成功
- 点它能打开色卡 / 字体 / 动效设置页
- 命令行：`node src/cli.mjs status` 看端口与运行状态，
  `node src/cli.mjs resident status` 看常驻 host

### 卸载

面板最下方「复位」只是撤掉皮肤（配置留在 localStorage）；彻底移除用
插件市场 → 已安装 → 卸载。

## 使用

```bash
node src/cli.mjs status          # 端口、进程、当前皮肤状态
node src/cli.mjs launch          # 带调试端口启动 ZCode 并注入（首次/重启后）
node src/cli.mjs apply           # 注入到已在跑的实例（需端口）
node src/cli.mjs apply --card deepseek --no-mascot
node src/cli.mjs reset           # 撤回皮肤
node src/cli.mjs resident status # 常驻 MCP host 状态
node src/cli.mjs css --card claude --scheme dark --out theme.css   # 导出样式
```

在 ZCode 会话里也可以用 `/claude-style` 让 agent 代跑这些步骤。

侧栏里的 **「cc-风格」**（在「插件市场」下面一行）：

- 点开 → 覆盖对话列的一整页设置，`←` 或 `Esc` 退回；
- **色卡** Claude ↔ DeepSeek，每张卡带四个预览色块；
- **Deepy 鲸鱼** 开 / 关；
- **字体** 开 / 关（关闭时退回系统字体栈）；
- **动效** 开 / 关（独立样式表，关掉立刻回到宿主节奏）；
- **明暗** 跟随 ZCode，不做强制覆盖；
- **复位** 回到 Claude 色卡。

导航行是从「插件市场」按钮克隆的（连 class 一起），所以 hover 态、高度、圆角、图标尺寸都和宿主一致；
React 重渲染把它冲掉时，MutationObserver 会自动补回来。

## 实机验收记录（2026-11-12）

在真实 ZCode 窗口上跑通并逐项确认：

| 检查 | 结果 |
| --- | --- |
| 注入 | `已注入 1/1 个渲染进程（payload 2170 KB）` |
| token 生效 | `--color-background: #191919`、`--color-brand: #d97757`、`--color-foreground: #fdfdfd` |
| 字体 | body 计算字体为 `"ZCS Inter", …` |
| 导航项 | 侧栏第 4 行 `cc-风格`，几何 `8,168 · 248×32`，与「插件市场」同规格 |
| 设置页 | 点开后覆盖 `264,0 · 1138×640`；切 DeepSeek 后 `--color-brand` 变 `#4d6bfe`、canvas 变 `#15161d`；`Esc` 关闭且聊天完好 |
| 持久化 | 选择写入 `localStorage["zcs:state"]`，刷新后保留 |
| 鲸鱼 | 运行时读到 `typing` 状态，位置锚定在输入框上方居中 |
| 动效 | 导航按钮实测 `0.12s` + `cubic-bezier(0.16,1,0.3,1)`；关掉开关后回落到宿主 `0.15s`，`#zcs-motion` 从 DOM 移除 |
| 折叠面板 | 保持宿主自己的 `0.3s`，没有被动效层误伤 |
| 扫光 | 「正在执行」标签实测 `--animated-gradient-text-soft: rgba(217,119,87,.4)`，`animation-name` 仍是宿主的 `gradient-flow`，时长被定到 `2.8s` |
| 新字暖光 | 在 `[data-zcode-reveal=new]` 上把动画定格采样：0% 无光晕 · 22% 峰值 `8.34px / rgba(217,119,87,.28)` · 61% 几乎散去 · 100% 归零 |
| 推理滑块 | 合成同构节点实测 fill `rgb(217,119,87)`、最高档渐变 `accent → accent-hover`、拖手 accent `1px` 环、刻度点用 on-accent |
| 满档沸腾 | 合成节点实测气泡 `rgb(255,255,255)` + `rgba(217,119,87,.3) 0 0 6px` 光晕；满档渐变 `zcs-fill-tide 3.2s alternate`、`background-size 220% 100%` |
| 换卡转场 | `svtCalls: 1`（真实点击路径）；五个 `::view-transition-*` 伪元素全部出现；`old(root) 150ms` / `new(root) 320ms` / 总 365ms（UA 默认是 250ms 对称） |
| 流式拦截 | 有 turn 在跑时同样的点击 → `svtCalls: 0`，直接瞬切，符合设计 |
| 字体族 | 中文实测为思源宋体（笔画比 SimSun 实、均匀）；西文 `ZCS Serif` 宽度 298.08 vs Georgia 310.37（确为新字体）；`opsz` 轴实测 708→569px；深色补偿规则在 CSSOM 里（`--font-weight-normal: 360`） |
| 静态验收 | `node scripts/verify.mjs` → 0 失败 0 提醒 |

期间修掉的几个真问题，值得记下来：

1. **选择器与元素 id 不一致**：CSS 写 `#zcs-mascot`，运行时建的是 `#zcode-claude-style-mascot`，
   于是 token 生效但鲸鱼/面板完全没样式（`position` 还是 `static`）。现在统一用 `zcs-` 前缀。
2. **`--tw-prose-*` 必须声明在 `.prose` 上**：声明在 `html` 上即使是 `!important` 也会输给
   `.prose` 自己的本地声明（本地声明永远胜过继承值），深色下标题会变成黑字。
3. **渲染进程的 CSP 会丢掉 `innerHTML` 里的 `style="..."`**：色卡的预览色块一开始全是透明。
   改成 `style.setProperty()` 写 CSS 变量（CSSOM 不受 CSP 限制）+ 样式表里读变量。
4. **鲸鱼在没有输入框的地方不该存在**：ZCode 的设置/插件页会把聊天列整个卸载，
   而 `place()` 找不到锚点时会退回"底部居中"继续画 —— 于是鲸鱼浮在插件列表中间。
   现在改成：无锚点、锚点无布局、或皮肤自己的设置页打开时，一律 `data-visible="0"`。
5. **幂等判据从手写版本号改成源码指纹**：`runtimeId` 由 CLI 对 `client.js` 做 sha1 得到，
   运行时代码一改就自动整块重建。之前靠手动升 `RUNTIME_VERSION`，忘了升就会静默继续跑旧代码
   （这次连坏三轮：鲸鱼无样式、面板不重建、色块透明都是它）。
6. **"皮肤在线"不等于"皮肤是新的"**：巡检原来只判断有没有 `#zcs-theme`，于是改完样式表、
   只要窗口没重载，它就一直认为一切正常。现在 `applyTheme()` 会把整包样式的指纹写到
   `data-zcs-style-id`，巡检拿它和自己的 `styleId` 比对，不一致就补注入。
   `styleId` 和 `runtimeId` 是两把尺子：前者管样式，后者管运行时代码——只改 CSS 时
   后者不变，早先正是这个缺口让改动到达不了活着的窗口。
7. **`teardown()` 忘了卸动效层**：`#zcs-motion` 是独立 `<style>`，`reset` 之后它还挂在 DOM 里，
   于是宿主的按钮仍带着我们的过渡。现在按名字一起删。
8. **两个注入器会互相覆盖，而且是肉眼可见的闪烁**：上面第 6 条的指纹比对有个致命缺口——
   它只问"指纹一样吗"，没问"谁更新"。结果是：改完插件后用 CLI 推新皮肤，**常驻的老 host**
   每 4 秒巡检一次，看到指纹不同就认定窗口过期，拿**它自己那份旧 payload** 盖回去；
   CLI 再推、它再盖，皮肤就在两个版本之间闪。日志里留下了现场：
   `stylesheet moved to a555f9262de2 — re-injected 1/1` 反复出现。
   修法是给每个进程一个**构建时间戳** `builtAt`，写进 `data-zcs-style-at`；巡检只在
   `窗口时间戳 < 自己的构建时间` 时才接管，否则打一行
   `window carries a newer skin — leaving it alone` 主动让位。
   教训：**任何"自动纠正"都要能判断方向**，否则两个好意的执行者会互相拆台。

## 动效

分三档，做完前两档。

**第一档：纯 CSS，不碰 DOM。**

| 做了什么 | 怎么做的 |
| --- | --- |
| 控件反馈 120ms | 给 `[data-slot=button]` / 导航行 / tab / menuitem 补 `transition-property`，宿主原本是瞬变 |
| 按压回弹 | `:active` 下 `translateY(0.5px)`，像实体键 |
| 浮层进出 | 只给元素 `--tw-duration` / `--tw-ease` 赋值，复用宿主自己的 `animate-in` / `animate-out` 关键帧，不重写 |
| 浮层方向 | 按 `data-side` 给 `--tw-enter-translate-*`，从锚定边展开 |
| 输入框聚焦 | 120ms 边框/底色过渡（陶土色焦点环） |
| 消息进场 | **不做** —— 宿主已有 `[data-zcode-reveal]`（0.26s）和 `zcode-stream-text-in`，重复实现只会打架 |

时序取自 dsh 的梯度：instant 80 / feedback 120 / surface 150 / exit 120 / enter 260–320ms，
缓动用 `cubic-bezier(.16, 1, .3, 1)`（宿主自己的 `--zcode-enter-ease` 也是这条，撞对了）。

两个实测踩坑：

- **不能用 `[class*="animate-in"]` 做子串匹配**：折叠面板的 class 里带
  `[&>div]:animate-in`（那是给子元素用的），子串匹配会把宿主 300ms 的高度动画
  压成 150ms，展开看起来被切掉。改成只认 `[data-radix-popper-content-wrapper] > *`。
- **ZCode 的浮层没有 `role=menu/dialog`**：实测当前版本里 radix 包装和 `data-side`
  一个都还没出现（模型选择器是内联展开，不是浮层）。所以浮层那条规则属于
  "有则生效、无则无害"的前瞻写法，不是我验证过的——这点得说清楚。

**第二档：接宿主自己的钩子，不另造轮子。**

| 做了什么 | 怎么做的 |
| --- | --- |
| 扫光 shimmer | 宿主本来就有 `.animated-gradient-text`（`background-clip: text` + 4s `gradient-flow` 循环），用在「工作中 42 秒」和还在跑的工具标签上。只把它的 `--animated-gradient-text-strong/soft` 换成色卡墨色 + accent 半透明带，扫光就变暖色；4s 定到 2.8s |
| 新字暖光 | 宿主给每个流入的文字单元打 `data-zcode-reveal="new"`，随后改 `settled`。挂一条 520ms 的 `text-shadow` 关键帧：0 → 9px accent 光晕 → 0 |
| 推理滑块上色 | `.composer-thought-slider-fill` 宿主用 `--color-success`，最高档渐变用 `--color-blue-500`。**没有全局改 `--color-success`**（成功提示还得是绿的），只在滑块组件内把 fill / 最高档渐变 / 刻度点 / 拖手描边换成 accent |

第二档为什么比预想的稳：三个效果全部挂在**宿主自己的契约**上——宿主自己的 class、
自己的 `data-` 属性、自己的 CSS 变量，没有一处是"我猜的元素"。宿主换实现时效果静默消失，
不会留下错位的浮层或卡住的动画。选 `text-shadow` 也是同样的考虑：它对非文本节点
（代码块、图片）天然无效，不存在"忘了排除"的漏洞。

一个真踩到的坑：**动效表引用的 `--zcs-*` 变量如果在配色表里没定义，整条声明会静默失效**
（不会报错，效果就是没了）。`verify.mjs` 的 `[4c]` 现在专门校验这一点：把动效表里所有
`var(--zcs-*)` 抽出来，逐张配色表比对是否有定义。

**第三档目前只取了两项（用户挑的），剩下没做。**

| 做了什么 | 怎么做的 |
| --- | --- |
| 满档"沸腾" | 推理滑块拉到最高档时，宿主的 `::before` 渐变改为 220% 宽、3200ms 交替平移；气泡用 `--zcs-on-accent` 加暖色外发光 |
| 换色卡整页 crossfade | 切卡包在 `document.startViewTransition()` 里。旧快照 150ms 退、新快照 320ms 进（用 `--zcs-duration-surface` / `--zcs-duration-enter`），实测总时长 365ms |

**气泡为什么不能真的染成 accent**：气泡是画在 accent 填充**上面**的，染同色等于让它隐形。
所以"染色"落到实处是两件事——用色卡的 `on-accent`（换到 DeepSeek 会变成偏冷白，跟着卡走）
＋ 一圈暖色光晕，真正在 accent 上看得见的是光晕。

**换卡的三个跳过条件**（都是有意为之）：动效开关关掉、`prefers-reduced-motion`、**有 turn 正在流式输出**。
最后一条是因为 View Transition 会给整页拍快照，流式期间屏幕会冻住 300ms 再追赶——比不做还难受。
API 不存在时直接降级为瞬切，不留异常。

第三档剩下的（墨点涟漪、色盘弹簧）成本高收益低，暂不做。

## 字体族：思源宋体 + Source Serif 4

Claude 官网用的是私有字体（`anthropic-serif` 家族名，Tiempos 一类），不对外分发，
所以这里用观感接近的开源等价物：

| 用途 | 字体 | 来源 |
| --- | --- | --- |
| 西文 / 标题 / 正文 | **Source Serif 4**（可变 `wght 200–900` + `opsz 8–60`） | 打包，119 KB |
| 中文 | **Noto Serif SC**（思源宋体，可变字重） | 系统字体，不打包 |
| 代码 | JetBrains Mono | 打包 |

字体栈：`"ZCS Serif", "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif`。

**中文那一项之前是缺的**，所以 Windows 上一路掉到 SimSun——那才是"字体难看"的真正原因，
不是思源宋体的问题。完整 CJK 字库约 25 MB，每次注入都传一遍不现实，所以走系统字体：
没装思源宋体的机器会依次退到 `Source Han Serif SC` → `Songti SC` → 系统 `serif`。

两条排版规则来自 open-claude-ui 的逆向文档：

1. **光学尺寸轴** — `font-optical-sizing: auto`，大字号自动取更紧、更细的切面。
   实测 `opsz 8` 与 `opsz 60` 下同一串西文宽度差 139px（708 → 569），轴确实在动。
2. **深色字重逆补偿** — 白字黑底会光渗膨胀，深色下把字重降一档
   （`400→360`、`500→460`、`600→550`）。Claude 还会把 bold 从 600 抬到 660，这里不动：
   我们的 bold 基准已经是 620，比它更稳。

两条都**只在可变字体上有效**——正好三套字体都是可变版。静态字体只会吸附到最近的字重，
补偿会变成空操作。

关掉面板里的「衬线字体」就整体回到 Inter。

## 常驻：交给 ZCode 自己管

插件的 `.zcode-plugin/plugin.json` 声明了 `mcpServers`，所以 **ZCode 启动时会自动 spawn
`src/mcp/server.mjs` 并一直保持它** —— 皮肤的寿命正好等于应用的寿命，不需要计划任务、
不需要守护进程、也不用问"它还在不在"。

这个 host 做三件事：

1. **MCP 工具**（ZCode 的 Agent 可调用）：`claude_style_status` / `_apply` / `_reset` /
   `_launch` / `_watch` —— 用户在对话里说"换成 DeepSeek 色卡"，agent 直接调工具；
2. **启动即注入**：ZCode 一开、端口一通，皮肤就回来了；
3. **巡检**：确认皮肤还在，窗口重载（注入被清掉）自动补上。

```bash
node src/cli.mjs resident status   # 看 host 在不在、最近的日志
node src/cli.mjs resident off      # 停掉残留的 host（重启 ZCode 会重新拉起）
```

### 巡检是双速的

两种情况的代价完全不同，所以间隔也不同：

| 状态 | 间隔 | 为什么 |
| --- | --- | --- |
| 皮肤在线 | `30s` | 单次探测 11.8ms，30 秒一次 ≈ 每天 34 秒。皮肤不会自己衰减，勤查没有收益 |
| 皮肤丢失 / 刚修复 | `2s` | 窗口重载后注入脚本随 CDP 会话一起消失，这个等待用户看得见 |
| 没有调试端口 | `10s` | 失败是瞬时的，而且用户可能一整场都这样开着 |

三个值都能用环境变量覆盖：`ZCS_WATCH_INTERVAL` / `ZCS_WATCH_RECOVER` / `ZCS_WATCH_IDLE`。

探测走**只读路径**：一条 `Runtime.evaluate`，不 enable 任何 CDP domain、不注册脚本。
早先它复用了注入函数，每次顺带执行 `Runtime.enable` + `Page.enable` +
`addScriptToEvaluateOnNewDocument`，实测 22.9ms/次；瘦身后 11.8ms，已经贴近纯 evaluate 的
10ms 下限（剩下的基本是本地 HTTP 拿 target 列表）。配合 30 秒间隔，每天的巡检开销从
约 8 分钟降到约 34 秒。

MCP 协议是**零依赖手写**的（纯 JSON-RPC over stdio）：插件要在裸 `node` 下跑，
不该为了一个握手引入 SDK。代价是 stdout 只能写 JSON-RPC 帧，任何 `console.log`
都会污染传输流 —— 所以日志一律走 `~/.zcode/.../mcp.log`。

### 为什么不用计划任务

先试过 Scheduled Task（每 5 分钟健康检查 + 单例锁），能用，但方向是错的：它是
"ZCode 死了也跑、靠定时器去碰"。皮肤只在 ZCode 活着时有意义，让宿主自己管生命周期
更简单也更可靠。中间还踩到一个坑值得记下来：`<Repetition>` 一旦写了 `<Duration>P1D`
就只重复一天（我用了固定的过去日期，所以任务静默失效）—— 正确写法是**不写 Duration**。

## 已知限制

- **必须带调试端口启动**。ZCode 生产版不开放 CDP，且单实例锁让运行中的实例无法被追加参数：
  先在托盘里完全退出，再 `launch`。
- **重启后自动恢复**：插件声明了 MCP host，ZCode 启动时自己拉起它，不需要手动 apply。
  前提是 **ZCode 带 `--remote-debugging-port` 启动**（这台机器的快捷方式已经带了）。
- **改了源码要重装**：插件管理里装的是 `~/.zcode/cli/plugins/cache/.../0.1.0` 的副本，
  改完 `src/` 后重跑 `node scripts/install.mjs`；只想立刻看效果可以直接跑源目录的 CLI。
- **鲸鱼状态是启发式的**：ZCode 改 DOM 后可能需要重新校准探针；
  探针全部包在 try/catch 里，失效时只会退回 idle，不会影响聊天。
- **对比度**：按钮字 / 强调底色是 3.0–4.2:1（Claude 官方配色本身如此），
  正文与次级文本均 ≥ 4.5:1，已由 `npm run verify` 校验。

## 开发

```bash
node scripts/verify.mjs    # 静态验收：token 存在性、选择器、语法、对比度、payload 体积
node scripts/probe.mjs "document.title"   # 在真实渲染进程里跑一段 JS（验收/调探针）
node src/cli.mjs shot --out a.png         # CDP 截当前窗口，比对改动前后
node scripts/preview.mjs   # 生成 4 张静态预览页（用 ZCode 真实样式表）
node scripts/install.mjs   # 注册到 ZCode 插件管理（带备份）
```

`verify.mjs` 会直接从 `D:\zcode\resources\app.asar` 读 ZCode 的渲染层样式表，
核对「我们写的每个变量宿主都真的声明过」，可以在不重启 ZCode 的情况下验收改动。

## 目录

```
.zcode-plugin/plugin.json   插件清单（命令 + 技能）
marketplace.json            本地市场描述
src/theme/palette.mjs       两张色卡的令牌取值
src/theme/css.mjs           令牌映射 + 形状/字体层
src/runtime/client.js       注入到渲染进程的运行时
src/lib/{cdp,inject,launcher,config}.mjs
src/cli.mjs                 apply / launch / watch / status / reset / css
scripts/{verify,preview,install}.mjs
assets/fonts                 Inter / Noto Serif / JetBrains Mono（OFL）
assets/mascot                Deepy 八态 GIF
```

## 许可

MIT。设计令牌与鲸鱼素材来自 dsh-claude-style（MIT, Nwflower），字体为 OFL，
详见 [NOTICE.md](NOTICE.md)。
