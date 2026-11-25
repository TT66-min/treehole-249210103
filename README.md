# 一隅 · 树洞（Tree Hole V2.1）

《Web开发实践》期末大作业 —— 在课程 Tree Hole V2.0（Node.js + SQLite）基础上的二次开发版本。

- 学号：249210103
- 姓名：李婷婷
- 访问路径：`/249210103`

## 一、相对原模板做的改动

| 模块 | 改动 |
|---|---|
| 数据库 | `messages` 表新增 `likes INTEGER DEFAULT 0`、`ip TEXT`、`province TEXT`，另建 `ip_cache` 表缓存省份解析结果 |
| 后端路由 | 所有页面与接口挂在 `/{学号}` 子路由下；新增 `POST /249210103/api/like`；新增 `GET /249210103/api/messages` |
| 前端交互 | 点赞改为 `fetch` 异步提交，仅更新数字、不刷新页面；提交前用 JS 校验昵称/内容，错误以红字 + 抖动提示，校验不通过不发请求 |
| 界面 | 完全重写 CSS（纸感暖色主题、衬线标题、卡片阴影、入场动画、移动端适配），未使用模板样式 |
| IP 归属 | 服务端读取 `X-Forwarded-For` / `req.ip`，通过 ip-api 解析省份，异步回填数据库，前端静默刷新显示「来自 浙江」 |
| 部署 | 支持 Render（`render.yaml` + `PORT`/`DATA_DIR` 环境变量）与本地 ngrok / Cloudflare Tunnel |

## 二、目录结构

```
treehole/
├── server.js            # 入口：Express 应用、学号子路由、API
├── lib/
│   ├── db.js            # SQLite 建表、增删查改、演示数据
│   └── geo.js           # IP -> 省份解析（含缓存与降级）
├── public/
│   ├── index.html       # 页面结构（%BASE% 占位符由服务端替换为 /学号/）
│   ├── style.css        # 手写主题样式
│   └── app.js           # 列表渲染、输入校验、点赞、省份补齐
├── data/treehole.db     # SQLite 数据库（含演示数据）
├── package.json
└── render.yaml          # Render 蓝图
```

## 三、本地运行

```bash
npm install
npm start
# 浏览器打开 http://localhost:3000/249210103
```

可用环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 3000 | 监听端口 |
| `STUDENT_ID` | 249210103 | 学号路由前缀 |
| `DATA_DIR` | ./data | SQLite 存放目录 |

## 四、接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/249210103/api/messages` | 留言列表（含 `likes`、`province`） |
| POST | `/249210103/api/messages` | 提交留言，body `{nickname, content}`，服务端二次校验 |
| POST | `/249210103/api/like` | 点赞，body `{id}`，返回最新 `likes` |
| GET | `/healthz` | 健康检查（Render 用） |

## 五、部署

### Render

1. 把仓库推到 GitHub；
2. Render → New → Web Service → 选择仓库；
3. Build Command：`npm install`；Start Command：`npm start`；
4. 部署完成后访问 `https://<服务名>.onrender.com/249210103`。

> 免费实例重启会重置文件系统，SQLite 数据会回到初始状态（作业说明允许）。应用启动时会自动建表，并在空库时写入演示留言。

### 本地 + 隧道

```bash
npm start
# 另开终端
ngrok http 3000        # 或 cloudflared tunnel --url http://localhost:3000
```
用隧道给出的公网地址访问 `.../249210103`，同学从外网留言即可记录真实 IP 与省份。
