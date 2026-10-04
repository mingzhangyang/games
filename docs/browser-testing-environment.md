# 浏览器测试环境恢复与复用

本文记录 PR #75 在 2026-10-04 的实际排障结果。后续 session 先验证现有浏览器，
不要直接沿用本次临时目录。安装包和解压文件放在仓库外，不提交到 Git。

## 入口与最短路径

项目使用 `puppeteer-core`，它不附带浏览器。统一入口是
`tools/lib/browser.mjs`，测试通过 `tests/lib/browser.mjs` 引用它。
已有可用 Chrome 时，只需为命令设置绝对路径 `CHROME_BIN`，无需修改测试源码。
入口当前只检查文件存在；存在不代表可执行或完整，因此先运行 `--version`。

```bash
"$CHROME_BIN" --version
CHROME_BIN="$CHROME_BIN" npm run verify -- --jobs=2
CHROME_BIN="$CHROME_BIN" node tests/lib/run-smoke-dist.mjs tests/verify-math-rain-styles.mjs
```

第三条命令使用已有 `dist/`，需先运行 `npm run build`。

## 安装显示成功，但二进制不完整

本次没有发现系统或缓存浏览器。以下两次安装都报告成功：

```bash
node node_modules/@puppeteer/browsers/lib/main-cli.js install chrome@stable --path "$BROWSER_ROOT/chrome"
node node_modules/@puppeteer/browsers/lib/main-cli.js install chrome-headless-shell@stable --path "$BROWSER_ROOT/headless"
```

但实际提取的文件权限均为 `0644`，而且文件不完整：Chrome 只有 134,610,944 字节，
ELF section headers 指向 294,038,720；headless shell 只有 175,439,872 字节，
section headers 指向 197,868,744。因此仅 `chmod +x` 不能修好。
这是本次环境的观测，尚未确定原生解压流程为什么产出了不完整文件。

成功的恢复方法：从 Chrome for Testing 官方地址下载 ZIP，用 Python 检查 CRC，
解压到新目录，逐文件核对长度并恢复 ZIP 内记录的权限，再检查 `--version`。
本次验证版本为 Linux x64 `154.0.8037.92`；它是复现记录，不代表后续最新版本。

在仓库根目录执行以下示例。`mktemp` 创建全新目录，避免复用损坏安装：

```bash
export BROWSER_ROOT="$(mktemp -d /tmp/games-browser-XXXXXX)"
export BROWSER_VERSION=154.0.8037.92
export BROWSER_URL="$(node --input-type=module -e '
import {getDownloadUrl, Browser, BrowserPlatform} from "@puppeteer/browsers";
console.log(getDownloadUrl(Browser.CHROMEHEADLESSSHELL, BrowserPlatform.LINUX,
  process.env.BROWSER_VERSION).toString());
')"
python3 - <<'PY'
import os
import pathlib
import shutil
import urllib.request
import zipfile

root = pathlib.Path(os.environ['BROWSER_ROOT'])
archive = root / 'browser.zip'
with urllib.request.urlopen(os.environ['BROWSER_URL']) as response:
    with archive.open('wb') as target:
        shutil.copyfileobj(response, target)
destination = root / 'verified'
destination.mkdir()
with zipfile.ZipFile(archive) as bundle:
    bad = bundle.testzip()
    if bad is not None:
        raise RuntimeError(f'ZIP CRC failed: {bad}')
    for entry in bundle.infolist():
        path = (destination / entry.filename).resolve()
        if not path.is_relative_to(destination.resolve()):
            raise RuntimeError(f'Unsafe archive path: {entry.filename}')
    bundle.extractall(destination)
    for entry in bundle.infolist():
        path = destination / entry.filename
        if entry.is_dir():
            continue
        if path.stat().st_size != entry.file_size:
            raise RuntimeError(f'Incomplete extraction: {entry.filename}')
        path.chmod((entry.external_attr >> 16) & 0o777 or 0o644)
print(destination / 'chrome-headless-shell-linux64' / 'chrome-headless-shell')
PY
export CHROME_BIN="$BROWSER_ROOT/verified/chrome-headless-shell-linux64/chrome-headless-shell"
"$CHROME_BIN" --version
```

本次 ZIP CRC、全部文件长度和 `--version` 均通过，随后真实浏览器测试成功启动。
CRC 和长度检查验证传输及解压完整性，不替代下载来源验证；使用上面生成的官方 URL。

## 本地服务与浏览器必须能互通

本次在一个独立执行调用里启动静态服务器，再在另一个调用里运行浏览器，出现
`ERR_CONNECTION_REFUSED`，尽管服务器已报告启动。不同执行调用可能处于不同网络环境；
本次未进一步确认隔离机制，不应将这一现象判为应用故障。

可复用的做法是让服务器与测试由同一执行树启动：

- 全量测试使用 `npm run verify -- --jobs=2`，现有 runner 管理服务器和子测试。
- 构建产物测试使用 `node tests/lib/run-smoke-dist.mjs <测试路径>`，由 wrapper 同时管理二者。
- 若下一次单独执行命令，重新传入 `CHROME_BIN`；不要假设前一个调用的环境变量仍然存在。

## 区分外网故障和应用断言

修复浏览器后，全量 95 步中 94 步通过。唯一失败为 Tetris drawer 的外部统计请求
`https://games-analytics.orangely.workers.dev/event` 返回 `ERR_EMPTY_RESPONSE`；
布局与交互断言本身通过。

为定位原因，临时复制同一个测试，仅将该统计端点响应替换为 HTTP 204（含所需 CORS
响应头），其他请求正常放行，保留原始断言。在生产构建上 158 个断言全部通过。
诊断副本已删除，提交中的原测试未修改。这是外网问题的隔离证据，不能将原始全量
结果写成全部通过，也不应通过全局忽略网络错误来掩盖其他问题。

后续遇到失败，按顺序确认：二进制完整与可执行 → 本地服务可达 → 外部请求可达 →
应用断言。浏览器安装、执行网络和应用回归分别记录，避免在产品代码中修复环境问题。
