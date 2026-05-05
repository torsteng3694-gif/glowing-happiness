import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /v1/skills/guide
 * 返回平台通用调用指南（所有模型共用，不是特定模型的说明）
 * - call_modes        三种实时格式 + 一种异步轮询
 * - pricing_guide     价格计算公式
 * - channel_strategy  渠道策略说明
 */
export async function GET(req: Request) {
  const user = await authenticateRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: { message: "invalid api key", type: "authentication_error" } },
      { status: 401 },
    );
  }

  return NextResponse.json(GUIDE);
}

const GUIDE = {
  auth: {
    recommended: "Authorization: Bearer sk-xxxxxxxx",
    supported_headers: [
      "Authorization: Bearer",
      "x-api-key",
      "x-goog-api-key",
      "?key= (query parameter)",
    ],
    note: "同时带多个头时以 Authorization: Bearer 为准。",
  },

  call_modes: [
    {
      mode: "realtime_openai",
      name: "OpenAI 格式",
      description: "适用于 gpt / o1 / o3 / chatgpt 前缀的语言模型",
      endpoint: "POST /v1/chat/completions",
      stream_supported: true,
      stream_param: "stream: true",
      request_example: {
        method: "POST",
        url: "/v1/chat/completions",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-xxxxxxxx",
        },
        body: {
          model: "gpt-4o",
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "你好，请用一句话介绍一下你自己" },
          ],
          temperature: 0.7,
          stream: false,
        },
      },
      response_example: {
        id: "chatcmpl-abc123",
        object: "chat.completion",
        created: 1712345678,
        model: "gpt-4o",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "你好，我是 GPT-4o，一个由 OpenAI 训练的多模态大模型。" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 18, completion_tokens: 24, total_tokens: 42 },
      },
    },
    {
      mode: "realtime_anthropic",
      name: "Anthropic 格式",
      description: "适用于 claude 前缀的语言模型",
      endpoint: "POST /v1/messages",
      stream_supported: true,
      stream_param: "stream: true",
      request_example: {
        method: "POST",
        url: "/v1/messages",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-xxxxxxxx",
          "anthropic-version": "2023-06-01",
        },
        body: {
          model: "claude-3-5-sonnet",
          max_tokens: 1024,
          messages: [
            { role: "user", content: "用一句话介绍你自己" },
          ],
        },
      },
      response_example: {
        id: "msg_abc123",
        type: "message",
        role: "assistant",
        model: "claude-3-5-sonnet",
        content: [{ type: "text", text: "我是 Claude，由 Anthropic 打造的 AI 助手。" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 16, output_tokens: 22 },
      },
    },
    {
      mode: "realtime_gemini",
      name: "Gemini 格式",
      description: "适用于 gemini 前缀的语言模型",
      endpoint: "POST /v1beta/models/{model}:{action}",
      stream_supported: true,
      stream_param: "action=streamGenerateContent",
      request_example: {
        method: "POST",
        url: "/v1beta/models/gemini-1.5-pro:generateContent",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": "sk-xxxxxxxx",
        },
        body: {
          contents: [
            { role: "user", parts: [{ text: "用一句话介绍你自己" }] },
          ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 256 },
        },
      },
      response_example: {
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: "我是 Gemini，由 Google 开发的多模态大模型。" }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 20, totalTokenCount: 28 },
      },
    },
    {
      mode: "async_poll",
      name: "异步轮询模式",
      description: "适用于图像 / 视频 / 音频 / 音乐等所有媒体模型。媒体模型不支持流式输出，必须走两步式异步流程",
      flow: [
        {
          step: 1,
          title: "提交任务",
          endpoint: "POST /v1/media/generate",
          returns: "task_id（用于轮询）",
          request_example: {
            method: "POST",
            url: "/v1/media/generate",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer sk-xxxxxxxx",
            },
            body: {
              model: "runway-gen3",
              type: "video",
              prompt: "A cat surfing in the ocean, cinematic",
              params: {
                duration: "5",
                aspect_ratio: "16:9",
                quality: "hd",
              },
            },
          },
          response_example: {
            task_id: 1234,
            status: "creating",
            is_final: false,
            cost: 12,
            poll_url: "/v1/skills/task-status?task_id=1234",
          },
        },
        {
          step: 2,
          title: "轮询状态",
          endpoint: "GET /v1/skills/task-status?task_id=xxx",
          aliases: ["GET /v1/media/status?id=xxx"],
          polling_interval_seconds: 5,
          stop_condition: "is_final === true",
          hints: [
            "建议每 5~10 秒轮询一次",
            "图片任务通常 2~5 分钟；视频任务 5~60 分钟（取决于时长与清晰度）",
            "判断终态只看 is_final，不要依赖具体 status 字面值",
            "失败类任务（fenzu=失败 且 is_final=true）会自动退款",
          ],
          response_example: {
            task_id: 1234,
            type: "video",
            status: "video_generation_completed",
            status_label: "视频生成完成",
            fenzu: "已完成",
            group: "completed",
            is_final: true,
            progress: 100,
            result: { urls: ["https://cdn.example.com/video/xxx.mp4"] },
            error: null,
            cost: 12,
            refunded: false,
          },
        },
      ],
    },
  ],

  pricing_guide: {
    billing_methods: ["按次", "按token", "按秒"],
    formulas: [
      {
        method: "按次",
        formula: "最终价格 = 基础价格 × 参数系数 + 参数加价",
        example:
          "视频模型 runway-gen3 基础 ¥12（5秒）→ 选择 duration=10（x2）= ¥24",
      },
      {
        method: "按token",
        formula: "费用 = 输入token数 × 输入单价 + 输出token数 × 输出单价",
        example:
          "gpt-4o：输入 ¥0.018/1K，输出 ¥0.072/1K → 1000 入 + 500 出 = 0.018 + 0.036 = ¥0.054",
      },
      {
        method: "按秒",
        formula: "费用 = 时长（秒）× 单位价格",
        example: "部分 TTS / 音频模型按时长计费",
      },
    ],
    notes: [
      "详细价格请查询 /v1/skills/models/{name}/pricing",
      "每个渠道分组的 base_price / input_token_price / output_token_price 可能不同",
      "参数选项价格见分组的 option_prices",
      "失败的媒体任务会自动退款",
    ],
  },

  channel_strategy: {
    description: "渠道策略由用户在平台 API Key 设置中配置，调用时不能也无需指定渠道或策略",
    strategies: ["价格优先", "速度优先", "成功率优先"],
    strategy_details: [
      {
        name: "价格优先",
        description: "自动选择当前可用渠道中价格最低的分组",
        suitable_for: "对成本敏感、对延迟不敏感的批量任务",
      },
      {
        name: "速度优先",
        description: "自动选择当前可用渠道中 avg_response_seconds 最小的分组",
        suitable_for: "需要低延迟响应的实时交互场景",
      },
      {
        name: "成功率优先",
        description: "自动选择当前可用渠道中 success_rate_24h 最高的分组",
        suitable_for: "对稳定性要求高的生产业务",
      },
    ],
  },

  related_endpoints: [
    { method: "GET",  path: "/v1/skills/models",                       description: "按类型列出所有可用模型" },
    { method: "GET",  path: "/v1/skills/models/{name}",                description: "获取模型功能与参数定义" },
    { method: "GET",  path: "/v1/skills/models/{name}/pricing",        description: "获取模型完整渠道分组价格" },
    { method: "POST", path: "/v1/chat/completions",                    description: "OpenAI 格式语言模型调用" },
    { method: "POST", path: "/v1/messages",                            description: "Anthropic 格式语言模型调用" },
    { method: "POST", path: "/v1beta/models/{model}:generateContent",  description: "Gemini 格式语言模型调用" },
    { method: "POST", path: "/v1/media/generate",                      description: "提交异步媒体生成任务" },
    { method: "GET",  path: "/v1/skills/task-status",                  description: "查询异步任务状态" },
    { method: "GET",  path: "/v1/media/status",                        description: "查询异步任务状态（别名）" },
    { method: "GET",  path: "/v1/skills/feedback",                     description: "查询反馈处理结果" },
  ],

  notes: [
    "此接口返回的是通用调用指南，所有模型共用，不是某个具体模型的说明",
    "语言模型支持流式输出（stream:true）；媒体模型只支持异步轮询，不支持流式",
    "渠道策略由用户在平台 API Key 设置中配置，调用接口时无需且不能指定渠道或策略",
    "所有接口均需在 Header 中携带 Authorization: Bearer {API_KEY} 进行认证（或使用兼容头）",
  ],
} as const;
