# CodePreview

CodePreview 是一个个人代码复习网页：电脑端管理代码，手机横屏后逐行渐进阅读。项目只展示代码文本，不会编译或运行代码；所有内容保存在服务器本地 JSON 文件中。

## 功能

- 手机横屏代码阅读，当前进度会保存在手机浏览器中
- 上一行、下一行、自动播放、速度调整、重置和全屏
- 支持左右滑动与键盘方向键，空格键控制播放/暂停
- 手机端按“目录 → 代码库”两级浏览内容
- 电脑端新增、重命名、删除和排序目录
- 电脑端在目录中新增、编辑、移动、删除和排序代码
- JSON 文件持久化，不使用数据库
- JSON 写入采用队列和原子替换，降低并发保存造成的数据损坏风险

## 访问地址

- 手机查看：`http://服务器公网IP:16022/`
- 电脑管理：`http://服务器公网IP:16022/admin`
- 健康检查：`http://127.0.0.1:3022/api/health`

运行时数据位于 `/opt/CodePreview/backend/data/snippets.json`。第一次启动时会自动创建该文件。
旧版 JSON 数据会自动升级，原有代码会归入“未分类”目录。

## 架构

```text
公网访问 :16022
       ↓
Nginx 反向代理
       ↓
Node.js 127.0.0.1:3022
       ↓
backend/data/snippets.json
```

## Ubuntu 完整部署步骤

以下命令全部使用 `root` 用户执行，不需要 `sudo`。

### 1. 安装基础软件

```bash
apt update
apt install -y nodejs npm nginx git
node --version
npm --version
```

项目要求 Node.js 18 或更高版本。如果 Ubuntu 软件源中的版本低于 18，请先安装较新的 Node.js LTS 版本。

### 2. 创建项目目录并获取代码

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/LIKE9426334946/CodePreview.git
cd /opt/CodePreview
npm ci --omit=dev
```

### 3. 创建并启用 systemd 服务

仓库中的完整服务文件位于 `deploy/systemd/CodePreview.service`，部署目标为 `/etc/systemd/system/CodePreview.service`。

```bash
cp /opt/CodePreview/deploy/systemd/CodePreview.service /etc/systemd/system/CodePreview.service
systemctl daemon-reload
systemctl enable --now CodePreview
systemctl status CodePreview --no-pager
curl http://127.0.0.1:3022/api/health
```

服务使用以下固定设置：

- `User=root`
- `WorkingDirectory=/opt/CodePreview`
- `HOST=127.0.0.1`
- `PORT=3022`
- 异常退出后自动重启

### 4. 创建并启用 Nginx 配置

仓库中的完整配置位于 `deploy/nginx/CodePreview`，部署目标为 `/etc/nginx/sites-available/CodePreview`。

```bash
cp /opt/CodePreview/deploy/nginx/CodePreview /etc/nginx/sites-available/CodePreview
ln -sfn /etc/nginx/sites-available/CodePreview /etc/nginx/sites-enabled/CodePreview
nginx -t
systemctl enable nginx
systemctl reload nginx
```

Nginx 监听公网端口 `16022`，并转发到只监听本机的 Node.js 端口 `3022`。配置已包含真实 IP、转发协议和 WebSocket 所需请求头。

### 5. 检查项目

```bash
systemctl status CodePreview --no-pager
systemctl status nginx --no-pager
ss -lntp | grep -E ':(3022|16022)'
curl http://127.0.0.1:3022/api/health
curl http://127.0.0.1:16022/api/health
```

然后在浏览器访问 `http://服务器公网IP:16022`。云服务器安全组或防火墙需要允许 TCP `16022` 端口入站；不要对公网开放 `3022`。

## 更新项目

运行时 JSON 文件已被 Git 忽略，正常更新代码不会覆盖已添加的内容。

```bash
cd /opt/CodePreview
git pull origin main
npm ci --omit=dev
systemctl restart CodePreview
nginx -t && systemctl reload nginx
```

## 日志与备份

```bash
journalctl -u CodePreview -f
tail -f /var/log/nginx/codepreview_error.log
cp /opt/CodePreview/backend/data/snippets.json /root/codepreview-snippets-backup.json
```

由于管理页面按要求不包含登录系统，请仅供个人使用，并根据需要在服务器防火墙或云安全组中限制 `16022` 的来源 IP。

## 本地开发和测试

```bash
npm install
npm test
HOST=127.0.0.1 PORT=3022 npm start
```
