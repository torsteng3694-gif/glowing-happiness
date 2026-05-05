# AI Hub · 全球大模型聚合平台

一个完整的 AI 聚合平台：**一次充值，调用全球所有主流大模型**（OpenAI、Claude、Gemini、DeepSeek、Midjourney/Flux、Runway、Luma、Sora、可灵等），覆盖**文本、图像、视频**三大模态，按量付费，OpenAI 兼容 API。

## 功能总览

- **前台**
  - 现代化落地页（Hero / 模型矩阵 / 定价 / FAQ / CTA）
  - 邮箱密码注册登录（JWT httpOnly cookie）
  - 用户控制台：概览、对话、图像生成、视频生成、模型市场、API Keys、钱包、邀请返佣
  - 流式对话 + 多回合记忆
  - 图像与视频生成（模型可选、参数可调、结果展示）
  - 钱包：余额、模拟充值（含阶梯赠送）、消费流水、近 30 日趋势图
  - 邀请返佣：邀请码/链接、已邀请用户、实时佣金到账
- **API（OpenAI 兼容）**
  - `POST /v1/chat/completions`（支持 stream）
  - `POST /v1/images/generations`
  - `POST /v1/videos/generations`
  - `GET  /v1/models`
  - Bearer Token 鉴权，自动计费扣款
- **渠道适配器**
  - `openai` / `anthropic` / `google` / `deepseek` 已实现真实调用（填 API Key 即走真实）
  - 图像、视频渠道已内置 mock，调用真实厂商可按需扩展
  - 无 key 或 `MOCK_PROVIDERS=true` 时自动走演示通道（返回逼真假数据）
- **管理后台**
  - 平台概览（用户数、模型数、累计充值、近 7 日消费）
  - 用户、模型、交易流水查看
- **其他**
  - Prisma + SQLite（开箱即用，可切 PostgreSQL）
  - 注册赠送体验金、管理员账号、邀请码、平台配置等种子数据

## 技术栈

- Next.js 15（App Router）+ React 19 + TypeScript
- Tailwind CSS + lucide-react + recharts
- Prisma 5 + SQLite（生产可切换 PostgreSQL）
- JWT（jose）+ bcryptjs

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 复制环境变量（默认开启 mock 模式，无需真实 API Key）
cp .env.example .env   # Windows: copy .env.example .env

# 3. 初始化数据库 + 写入种子数据
npm run setup
# 等价于：prisma generate && prisma db push && tsx prisma/seed.ts

# 4. 启动开发服务器
npm run dev
# 打开 http://localhost:3000
```

### 默认账号

- 管理员：`admin@ai-hub.local` / `admin123`
- 任意注册用户送 ¥5 体验金

## 对接真实模型

在 `.env` 中设置：

```
MOCK_PROVIDERS=false
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
GOOGLE_API_KEY=...
DEEPSEEK_API_KEY=sk-...
```

- 留空的渠道会自动回退到 mock，不会中断服务。
- 图像/视频渠道（Replicate / Runway / Luma / Kling 等）在 `src/lib/providers/index.ts` 中预留了路由位置，按需实现 `routeImage` / `routeVideo` 即可。

## 以 OpenAI SDK 调用本平台

```python
from openai import OpenAI
client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="sk-aihub-xxx",   # 在 /dashboard/keys 中创建
)
resp = client.chat.completions.create(
    model="gpt-4o",            # 或 claude-3-5-sonnet / gemini-1.5-pro / deepseek-chat
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)
```

## 目录结构

```
ai-hub/
├─ prisma/
│  ├─ schema.prisma       数据模型
│  └─ seed.ts             种子数据（模型/管理员/配置）
├─ src/
│  ├─ app/
│  │  ├─ page.tsx         落地页
│  │  ├─ (auth)/          注册/登录
│  │  ├─ dashboard/       用户控制台
│  │  ├─ admin/           管理后台
│  │  ├─ api/             内部接口（auth/chat/image/video/keys/wallet）
│  │  └─ v1/              OpenAI 兼容对外 API
│  ├─ components/ui.tsx   共享 UI 组件
│  ├─ lib/
│  │  ├─ db.ts            Prisma 单例
│  │  ├─ auth.ts          JWT/密码/API Key 工具
│  │  ├─ billing.ts       计费、扣费、返佣
│  │  ├─ utils.ts         通用工具
│  │  └─ providers/       各厂商适配器（openai/anthropic/google/mock）
│  └─ middleware.ts       受保护路由中间件
├─ tailwind.config.ts
├─ next.config.ts
└─ README.md
```

## 切换到 PostgreSQL

1. 把 `prisma/schema.prisma` 中 `provider = "sqlite"` 改为 `provider = "postgresql"`。
2. `.env` 中 `DATABASE_URL` 改为 Postgres 连接串，例如：
   ```
   DATABASE_URL="postgresql://user:pass@localhost:5432/ai_hub"
   ```
3. `npx prisma db push && npm run db:seed`。

## 后续扩展建议

- 真实支付：对接 Stripe / 支付宝 / 微信支付（当前为 mock 充值）
- 真实视频/图像厂商：Replicate / Runway / Luma / 可灵 API
- WebSocket 或 Server-Sent Events 推送长任务状态
- 模型路由与自动降级（质量/成本/延迟三角优化）
- Rate limit（按 Key / 按用户）
- 多租户与团队空间
- i18n、深色模式

## License

MIT
