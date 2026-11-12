---
description: 给 ZCode 桌面客户端套上 Claude Code Desktop 风格（暖色色卡 / 衬线标题 / Deepy 鲸鱼）
argument-hint: "[claude|deepseek] [--no-mascot] [--no-fonts] [--no-motion]"
---

# ZCode Claude Style

用户想把这台机器上的 ZCode 桌面客户端换成 Claude Code Desktop 的观感。$ARGUMENTS

## 先弄清一件事

ZCode 生产版没有内置调试端口，皮肤只能通过 CDP 注入渲染进程。所以：

- 注入随 ZCode 进程结束失效 —— **每次重启 ZCode 之后都要重新注入**；
- 单实例锁意味着「已经开着的 ZCode」不能被追加上调试端口，必须先在托盘里完全退出。

## 步骤

1. **先看状态**：`node <plugin-root>/src/cli.mjs status`
   - 输出里有 `调试端口  无可用目标` → 说明需要走 launch 路径。
2. **注入**：`node <plugin-root>/src/cli.mjs apply [--card claude|deepseek] [--no-mascot] [--no-fonts]`
   - 成功时会打印 payload 大小与注入的渲染进程数。
3. **如果端口已经在监听**（用户此前用过带调试端口的启动方式），`apply` 直接成功，不需要重启。
4. **想让它一直在线**：`node <plugin-root>/src/cli.mjs watch --detach`，
   后台每 4 秒检查一次，皮肤丢失（重载、重启后带端口启动）时自动补注入。
5. **如果 apply 报「连不上 CDP」**：
   - 告诉用户完全退出 ZCode（托盘右键退出），然后运行
     `node <plugin-root>/src/cli.mjs launch`（会带 `--remote-debugging-port=9222` 启动并自动注入）；
   - 或者用户自己愿意的话，直接 `launch` 也行 —— 它检测到端口已在监听时就只做注入。
6. **换色卡 / 关鲸鱼**：apply 加 `--card deepseek`、`--no-mascot`；
   也可以让用户点左下角 ◐ 面板实时切换（写入 localStorage，立刻生效）。
7. **回复时要说明**：
   - 皮肤由三段构成：语义 token 覆盖（`--color-*`）、形状与字体层、Deepy 鲸鱼；
   - 鲸鱼状态（空闲/思考/打字/指挥子代理/等你操作/失败/完成/睡着）是从 DOM 推断的，
     启发式，ZCode 大版本升级后可能需要重新校准；
   - 想撤回：`node <plugin-root>/src/cli.mjs reset`。

## 不要做的事

- 不要修改 `D:\zcode\resources\app.asar` 或任何安装目录文件；
- 不要替用户重启 ZCode 却不提前说明「当前会话窗口会关闭，历史记录保留」；
- 不要在用户没要求时改快捷方式或开机启动项。
