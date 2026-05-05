# AI Hub 上云部署指南

本文档配合本次"上云改造"使用，记录如何把项目部署到生产环境（容器 / K8s / Serverless）。

---

## 0. 紧急前置：轮换已泄露的密钥

之前 `.env` 里写了真实可用的腾讯云 COS 永久密钥，**必须先去 CAM 控制台禁用并重新生成**：

1. https://console.cloud.tencent.com/cam/user → 找到对应子用户
2. 「API 密钥」tab → 禁用旧的 `AKID...` → 新建一对
3. 新密钥**只通过部署平台的环境变量注入**，不要写回 `.env` 文件

同样需要重新生成 `JWT_SECRET`：

```bash
openssl rand -base64 48
```

---

## 1. 数据库：切到 PostgreSQL

`prisma/schema.prisma` 已改为 `provider = "postgresql"`。

### 首次初始化迁移

在本地连一个空的 PG 数据库，生成迁移文件并提交：

```bash
# .env 临时指向一个本地空 PG
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/ai_hub?schema=public"

npx prisma migrate dev --name init
git add prisma/migrations
git commit -m "chore(db): init postgres migration"
```

### 上云时

容器启动脚本 `docker-entrypoint.sh` 会自动执行 `prisma migrate deploy`。
如果是多副本部署，让其中一个先启动跑迁移，其他副本设置 `SKIP_MIGRATE=1` 跳过。

---

## 2. 必备环境变量

最小集合（其他按 `.env.example` 按需配置）：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接串，建议加 `?sslmode=require&connection_limit=10` |
| `JWT_SECRET` | 32+ 字节随机串 |
| `MOCK_PROVIDERS` | 生产设为 `false` |
| `ADMIN_EMAIL` | 管理员邮箱 |
| `TENCENT_COS_*` | 4 个 COS 变量必须配齐，否则文件上传会落到容器本地磁盘 |
| `PUBLIC_BASE_URL` | 站点对外 https URL（用于回调、参考图） |
| `APP_VERSION` | 可选，CI 注入版本号，`/api/health` 会回显 |

---

## 3. Docker 构建与运行

```bash
docker build -t ai-hub:latest .

docker run --rm -p 3000:3000 \
  --env-file .env.production \
  ai-hub:latest
```

镜像采用 Next.js `output: "standalone"`，最终大小约 200MB 左右。
容器启动后会先跑 `prisma migrate deploy`，再启动 `node server.js`。

健康检查：`GET /api/health` 返回 `{ status: "ok", db: "ok", ... }`。

---

## 4. CI 质量门禁

构建失败时阻断发布：

```bash
npm ci
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run build       # 生产构建（NODE_ENV=production，TS/ESLint 错误会真的报错）
```

---

## 5. 后台任务 / Worker

`ComicProjectV3` / `EcomProject` 等表用 `runLockId` 实现跨进程互斥锁。
若上云后流量较大，建议把 long running 的 runner 拆成独立 worker 进程：

- web 副本只处理 HTTP；
- worker 副本（1~N 个）轮询/订阅任务表执行；
- 通过 `runLockId` + `runLockExpiresAt` 保证同一项目同时只被一个 worker 处理。

---

## 6. 推荐部署形态

- **容器化（推荐）**：腾讯云 TKE / 阿里云 ACK / 自建 K8s。Service 前面挂 LB + 7 层网关，TLS 在网关上做。
- **Serverless 容器**：腾讯云 TCR + Cloud Run / 阿里云 SAE / Vercel（注意 Vercel 不适合长任务，需要把 worker 拆出去）。
- **传统 VM**：直接 `docker compose up -d`，前面挂 nginx 反代。

---

## 7. 上线前自检清单

- [ ] 旧 COS 密钥已禁用，新密钥只在部署平台注入
- [ ] `JWT_SECRET` 已换成强随机串
- [ ] `MOCK_PROVIDERS=false`
- [ ] `DATABASE_URL` 指向云上 PG，且开启 SSL
- [ ] `prisma migrate deploy` 在生产 PG 上跑通
- [ ] `/api/health` 返回 200
- [ ] `next.config.ts` 的 `images.remotePatterns` 已包含你实际用到的所有 CDN/COS 域名
- [ ] 上传/生成的资源全部走 COS（不再依赖本地 `/uploads/...`）
- [ ] 监控/日志接入完成（Sentry / ARMS / CLS 任选）
