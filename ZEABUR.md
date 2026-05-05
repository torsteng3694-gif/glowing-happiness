# 在 Zeabur 上部署 AI Hub

本项目已针对 [Zeabur](https://zeabur.com) 自动部署做好适配。本指南只讲 Zeabur 流程，通用云部署见 `DEPLOY.md`。

---

## 总览

- 部署方式：**Zeabur 原生 zbpack**（自动识别 Next.js + Node.js 20，自动启用 standalone）。
- 数据库：Zeabur Marketplace 的 **PostgreSQL** 模板，一键开通。
- 文件存储：腾讯云 COS（Zeabur 容器是无状态的，**绝对不能**用本地磁盘存上传文件）。
- Dockerfile：项目里有 `Dockerfile`，但被 `zbpack.json` 中 `ignore_dockerfile: true` 关掉了，仅作可移植备用。

---

## 一、首次部署步骤

### 1. 准备 Git 仓库

把代码推到 GitHub / GitLab。

### 2. 在 Zeabur 创建项目

1. 登录 https://zeabur.com → New Project → 选地区（**香港 / 新加坡 / 东京**对国内访问较友好）。
2. **先添加 PostgreSQL**：
   - Add Service → Marketplace → 搜 `PostgreSQL` → 部署
   - 等服务变成 Running
3. **再添加 Web 服务**：
   - Add Service → Git → 选你的仓库 → 选 main 分支
   - Zeabur 会自动检测到 Next.js + `zbpack.json`，开始构建

### 3. 配置 Web 服务的环境变量

在 Web 服务 → Variables 标签里添加（**所有 Secret 一律在这里加，不要写进代码**）：

| Key | Value | 说明 |
|---|---|---|
| `DATABASE_URL` | `${POSTGRES_CONNECTION_STRING}` | Zeabur 引用变量，自动指向同项目的 PG |
| `JWT_SECRET` | `<openssl rand -base64 48 的结果>` | 必填，32+ 字节随机串 |
| `MOCK_PROVIDERS` | `false` | 走真实模型 |
| `ADMIN_EMAIL` | `admin@yourdomain.com` | 注册后自动标记为 admin |
| `PUBLIC_BASE_URL` | `https://your-app.zeabur.app` | Zeabur 给的域名，绑定自定义域后改成自定义域 |
| `TENCENT_COS_SECRET_ID` | `<新生成的密钥>` | **不要**用之前泄露的那对 |
| `TENCENT_COS_SECRET_KEY` | `<新生成的密钥>` | 同上 |
| `TENCENT_COS_BUCKET` | `ai-hub-1335106858` | 含 APPID 后缀 |
| `TENCENT_COS_REGION` | `ap-nanjing` | |
| `TENCENT_COS_PUBLIC_HOST` | 留空或自定义 CDN 域名 | |

按需追加 `OPENAI_API_KEY` / `XINGYE_API_KEY` 等上游 key。

### 4. 触发重新构建

环境变量改完后，Zeabur 会自动重启。也可以手动 Redeploy。

### 5. 绑定域名（可选）

Web 服务 → Networking → Domains → 加自定义域，按提示加 CNAME。

---

## 二、为什么这样配置

### `zbpack.json` 解析

```json
{
  "ignore_dockerfile": true,
  "build_command": "npx prisma generate && npx prisma migrate deploy && next build",
  "start_command": "next start -H 0.0.0.0 -p ${PORT:-3000}",
  "node": { "version": "20" }
}
```

- **`ignore_dockerfile: true`**：让 Zeabur 用 zbpack 自动构建（识别 Next.js → 自动 standalone → 镜像最小，缓存最优）。如果想切回 Docker 路线，把这行删掉即可。
- **`build_command`**：在 `next build` 之前跑 `prisma generate`（生成客户端）和 `prisma migrate deploy`（应用迁移）。Zeabur build 阶段已经能读到 `${POSTGRES_CONNECTION_STRING}`。
- **`start_command`**：用 `${PORT:-3000}` 适配 Zeabur 动态注入的端口。
- **`node.version: "20"`**：锁定 Node 20 LTS，与 React 19 / Next 15 / Prisma 5 兼容。

### 为什么 `DATABASE_URL` 用 `${POSTGRES_CONNECTION_STRING}`

Zeabur 里同一个项目内的服务可以**互相引用变量**。这个写法会自动展开为内网连接串（走 `.zeabur.internal`），延迟最低、不走公网、不算流量费。

---

## 三、首次迁移注意事项

如果你**之前没有 `prisma/migrations/` 目录**（schema 第一次切到 PG），先在本地生成 init 迁移再推上来：

```bash
# 本地连一个空的 PG（可以是 docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:18）
$env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/ai_hub?schema=public"

npx prisma migrate dev --name init

git add prisma/migrations
git commit -m "chore(db): init postgres migration"
git push
```

否则 Zeabur build 会报 `No migration found in prisma/migrations`。

---

## 四、种子数据

Zeabur build 阶段不会自动跑 `npm run db:seed`。两种做法：

**做法 A（推荐）**：进 Zeabur Web 服务 → Console（容器内终端）→ 执行：

```bash
npx tsx prisma/seed.ts
```

**做法 B**：把 seed 也加进 build_command（**只适合首次**，否则每次 build 都会跑）：

```json
"build_command": "npx prisma generate && npx prisma migrate deploy && npx tsx prisma/seed.ts && next build"
```

部署成功后记得改回去。

---

## 五、健康检查

`/api/health` 已经实现，Zeabur 会自动用它做探活。
- 200 + `{ status: "ok", db: "ok" }` 表示正常
- 503 表示数据库连不上

---

## 六、Worker / 长任务

`ComicProjectV3` / `EcomProject` 等表用 `runLockId` 做跨进程互斥，能在多副本下安全运行。
如果 Web 副本数 > 1，建议：
- 给 Web 服务保持 1 副本，足够前期使用；
- 流量上来后再单独建一个 Zeabur 服务跑 worker（同一仓库、不同 `start_command`）。

---

## 七、常见问题

**Q: build 报 `Can't reach database server`？**
A: 检查 `DATABASE_URL` 是否填了 `${POSTGRES_CONNECTION_STRING}`，且 PG 服务已经 Running。

**Q: 上传图片后访问 404 或重启就丢？**
A: 说明走了本地 `/uploads/...` 兜底。检查 4 个 `TENCENT_COS_*` 变量是否都配了，COS 桶是否「公有读私有写」。

**Q: 想用 Dockerfile 部署，不走 zbpack？**
A: 删掉 `zbpack.json` 里的 `"ignore_dockerfile": true`，Zeabur 会自动切回 Docker 构建。

**Q: 怎么本地测试 zbpack 的构建命令？**
A: 直接跑 `npm run build:deploy`（package.json 里已经有了）。
