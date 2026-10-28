# dsh-screenshot-pro

给 DeepSeek Harness 用的截图插件：**框完先确认，再出图**。

> 本项目是 [paicat1/dsh-screenshot](https://github.com/paicat1/dsh-screenshot)（MIT）的修改版（fork）。
> 原版行为是「松手即截」；本版改成「松手后画面停住，点确定才截」。
> 具体改动清单见 [NOTICE](./NOTICE)。

## 和原版的区别

| 能力 | 原版 | 本版 |
|---|---|---|
| 界面按钮 | 无，只有热键 | 右下角两个按钮（整屏 / 框选） |
| 框选后 | 松手立刻裁剪出图 | 画面停住，等「确定 / 取消」 |
| 点选窗口 | 立刻出图 | 停住，等确认 |
| 点空白截整屏 | 立刻出图 | 停住，等确认 |
| 截图范围 | 整个虚拟桌面（多屏拼接） | 仅主屏 |
| 副屏 125% 缩放 | 遮罩被拉伸 1.25 倍 | 正常（Per-Monitor V2） |
| 悬停高亮 | 松手后仍会把光标下窗口点亮 | 有选区时禁用，画面保持静止 |

## 安装

```sh
dsh plugin --profile desktop add github:USER/dsh-screenshot-pro
```

或本地目录：

```sh
dsh plugin --profile desktop add file:E:\path\to\dsh-screenshot-pro
```

装完重启 DeepSeek Harness。

## 使用

### 按钮

| 按钮 | 作用 |
|---|---|
| 📷 | 一点截整屏，路径直接进输入框 |
| ⬚ | 进入框选 |

### 快捷键

| 按键 | 作用 |
|---|---|
| `Ctrl + Alt + S` | 进入框选（先给提示条，桌面可操作，点一下才冻结） |
| `Ctrl + Shift + Alt + S` | 立即截整屏 |

### 框选流程

1. 拖出选区 → 选区外压暗，选区内保持原色
2. **松手后画面停住**
3. 320ms 后出现「确定 / 取消」
4. 点确定（或 `Enter`）才裁剪；点取消（或 `Esc`）放弃

点某个窗口 = 选区变成该窗口；点桌面空白 = 选区变成整屏。三种方式都要确认。

### 输出

- 图片存 `%USERPROFILE%\Downloads\modlens-screenshots\`
- PNG 路径自动写入输入框，发出后由 Agent 按路径读图

## 已知限制

- 只截主屏。需要副屏请用系统截图或等后续版本。
- 按钮有 320ms 延迟出现，这是为了避免松手那一下被当成点击。
- 依赖系统 PowerShell 5.1（Windows 自带），无需额外安装。

## 许可

MIT，见 [LICENSE](./LICENSE)。
原版权：Copyright (c) 2026 paicat1。修改说明见 [NOTICE](./NOTICE)。
