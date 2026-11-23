# 在 Windows 上用飞书继续已有的 Codex 会话

这份交接适用于项目和 Codex 会话已经在 Windows 上的使用者。飞书机器人把消息交给这台电脑上的 Bridge，Codex 在原项目目录工作，模型请求经过 SSH 隧道送到 VPS 的 Magpie。手机只需打开飞书。Windows 电脑需要开机、联网，后台任务需要该用户已登录。

Linux 已在 `ecddc0d350cdbaacc7fb3b4e60bd5caa94817141` 通过类型检查、128 项测试和构建。该版本修复了会话结束后的写锁释放，移除了 Bridge 写入 Codex 标题的调用，并把飞书历史预览限定为助手回复。Windows 实机验收见文末。

## 1. 先拿到设备公钥和网关凭据

在平时使用 Codex 的 **Windows 用户** 下打开 PowerShell。以下命令会复用同名密钥，首次使用时才生成。把最后一条输出的整行公钥交给 VPS 管理员，私钥留在 Windows。

```powershell
$key = "$env:USERPROFILE\.ssh\magpie_research"
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh" | Out-Null
if (!(Test-Path $key) -and !(Test-Path "$key.pub")) {
    ssh-keygen -t ed25519 -f $key -C "research-windows-magpie"
}
Get-Content "$key.pub"
```

管理员需要回传 SSH 主机、端口、隧道用户名、主机公钥指纹，以及单独交付的一枚 **Magpie gateway key**。SSH 公钥决定这台电脑能否接通隧道；网关 key 决定能用哪些模型，以及请求记在哪台设备名下。

- VPS 延用现有 Magpie 实例。给新设备使用普通隧道账号，在该账号安装公钥。可在 sshd 的该用户 `Match User` 段设置 `AllowTcpForwarding local`、`PermitOpen 127.0.0.1:3425` 和 `MaxSessions 0`，限制其只能做所需转发。变更 sshd 时先用 `sshd -t` 验证并保留现有管理连接。
- 在 VPS 的 Magpie 服务所属用户下运行 `magpie gateway-key add research-windows`，把返回的密钥通过私密渠道交付。再用 `magpie gateway-key list` 找到该条目的 **ID**，执行 `magpie gateway-key models <ID> '<供应商>/<模型>'` 限定所需模型。尖括号内替换为实际值。管理命令用条目 ID，Windows 发请求用密钥正文。
- 请管理员确认 VPS 上已接入目标供应商。要用 DeepSeek，就授权并实测一个 DeepSeek 路由。另一台电脑的本地 Magpie 给远端起的 `singapore/…` 别名未必存在于 VPS 上。

## 2. 在 Windows 打通网关

将以下片段合并到 `%USERPROFILE%\.ssh\config`，替换主机、用户名及实际端口。示例让 Windows 的 `3426` 端口通过 SSH 转到 VPS 上的网关 `3425`。

```sshconfig
Host research-magpie
    HostName VPS_HOST
    User TUNNEL_USER
    Port 22
    IdentityFile ~/.ssh/magpie_research
    IdentitiesOnly yes
    LocalForward 127.0.0.1:3426 127.0.0.1:3425
    ExitOnForwardFailure yes
    ServerAliveInterval 15
    ServerAliveCountMax 4
```

运行 `ssh -NT research-magpie`，首次连接对照管理员提供的主机指纹。保持窗口打开。在另一个 PowerShell 中输入专属网关 key 并查询模型，命令历史中只会留下读取密钥的命令。

```powershell
$secret = Read-Host "Magpie gateway key" -AsSecureString
$env:MAGPIE_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
$headers = @{ Authorization = "Bearer $env:MAGPIE_API_KEY" }
$models = Invoke-RestMethod -Uri 'http://127.0.0.1:3426/v1/models' -Headers $headers
$models.data | Select-Object -ExpandProperty id
```

记下准备使用的完整模型 ID。连接被拒绝先看 SSH 窗口和本地端口，HTTP 401 先检查网关 key。模型列表可读后，仍需在文末用一次实际回复验收模型权限。

## 3. 安装 fork 并连接个人飞书企业

在同一 Windows 用户的 PowerShell 中确认 `git --version`、`node --version`、`npm.cmd --version`、`codex --version` 均可运行。Linux 验证环境使用 Node 22.22.3；项目声明最低 20.12.0。若原来的 Codex 在 WSL 中，先在原环境确认项目和会话，下面的原生 Windows 安装按会话也在原生 Windows 用户下编写。

选择长期保留的安装目录，执行以下命令。`npx.cmd` 直接运行项目指定的 pnpm 版本。

```powershell
git clone https://github.com/lsylsy0516/feishu-codex-bridge.git
Set-Location feishu-codex-bridge
git switch --detach ecddc0d350cdbaacc7fb3b4e60bd5caa94817141
npx.cmd --yes pnpm@10.26.1 install --frozen-lockfile
npx.cmd --yes pnpm@10.26.1 build
node bin/feishu-omp-bridge.mjs setup
```

每条成功后再执行下一条。用个人企业的飞书账号扫码，确认租户，创建这台电脑专用的机器人。管理员在该企业内批准权限、发布应用，并将可用范围限定到使用者。若 Linux 和 Windows 同时在线，分别使用不同应用，方便从飞书直接选中目标电脑。保留 Windows 自己生成的配置和凭据；无需迁移另一台电脑的 `.codex`、Bridge 数据目录或聊天数据库。

## 4. 配置模型和项目

先在 Windows 的“编辑账户的环境变量”中新建用户变量 `MAGPIE_API_KEY`，值为这台设备的网关 key。它会供以后启动的用户进程使用。当前测试终端已有第 2 步设置的临时值。用户环境变量可以被该 Windows 用户的其他程序读取。

备份她现有的 `%USERPROFILE%\.codex\config.toml`，若已设置 `CODEX_HOME` 则使用该目录。以下例子会将这个用户新启动的本机 Codex CLI 和 Bridge 一起指向 VPS。合并时把 `model` 和 `model_provider` 放在文件开头的顶层，已有同名设置就修改原行。保留其他供应商、项目设置和登录文件。

```toml
model_provider = "research_magpie"
model = "MODEL_ID_FROM_VPS"

[model_providers.research_magpie]
name = "Research Magpie"
base_url = "http://127.0.0.1:3426/v1"
wire_api = "responses"
env_key = "MAGPIE_API_KEY"
requires_openai_auth = false
```

在 `%USERPROFILE%\.feishu-omp-bridge\config.json` 的 `preferences` 中合并这三个字段，保留 `setup` 写入的应用信息。两处 `MODEL_ID_FROM_VPS` 都换成第 2 步查到的同一个 ID。目录替换成她已有 Codex 会话的实际项目目录。

```json
{
  "agentBackend": "codex",
  "codexModel": "MODEL_ID_FROM_VPS",
  "projectRoots": ["D:\\Research\\MyProject"]
}
```

先运行 `node bin/feishu-omp-bridge.mjs run --skip-check-lark-cli` 前台联调。若 PowerShell 能运行 Codex，但 Bridge 日志出现 `spawn codex ENOENT` 或 `EINVAL`，执行 `Get-Command codex -All`。如果结果只有脚本入口，找到此安装附带的原生 `codex.exe`，用 `& '实际路径\codex.exe' --version` 验证，再把完整路径写入 `preferences.codexAppServerBinary` 并重启 Bridge。

## 5. 验收后再切后台

1. 在 Windows 本机记下一条未归档旧会话的标题、项目目录和一条能辨认的历史回复。先结束这条会话上正在执行的任务。
2. 在飞书私聊新机器人，发送「项目」。选中项目，在项目群点「查看会话」→ 选中原会话 →「继续此会话」。进入对应话题，点历史预览或发送 `/session history`，确认看到刚才那条助手回复。
3. 在同一话题发「只回复 OK」。确认收到回复，让管理员在 VPS 的 Magpie 用量记录中核对设备 key 和模型。再回到 Windows 本机续聊，确认原会话有这轮消息、原标题保留，且本机可以接手。如果出现新会话 ID，记录原 ID 和错误信息；有些旧会话无法恢复时 Bridge 会自动新建会话，此情形仍需排查。
4. 前台 Bridge 用 `Ctrl+C` 退出。运行 `node bin/feishu-omp-bridge.mjs start --skip-check-lark-cli`，然后运行 `node bin/feishu-omp-bridge.mjs status`。Bridge 会为当前 Windows 用户注册登录时运行的计划任务。安装目录应保留在原位置。
5. SSH 隧道也要常驻。先结束手动隧道，确认同一用户可运行 `ssh -NT -o BatchMode=yes research-magpie` 并从另一窗口再次查到模型。有密钥口令时先让 Windows `ssh-agent` 加载该设备密钥。然后结束测试隧道，在任务计划程序为该用户创建登录时运行的任务，程序填 `ssh.exe` 的完整路径（`(Get-Command ssh.exe).Source`），参数填 `-NT -o BatchMode=yes research-magpie`，设置失败后重新启动并取消执行时长上限。手动启动该任务，再从飞书测试。
6. Windows 重启并登录后，保持电脑联网且未睡眠，在飞书的原话题里再发一条消息。这一步成功即完成迁移。若前台成功而重登后失败，依次检查隧道任务、`/v1/models`、Bridge `status` 提供的日志路径，以及计划任务运行用户是否有 `MAGPIE_API_KEY`。
