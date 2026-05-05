import type { MessageKey } from "./zh";

export const en: Record<MessageKey, string> = {
  // === Meta ===
  "meta.site.title": "AI Hub · Unified Access to Global AI Models",
  "meta.site.desc":
    "One account, one top-up, access every major AI model: OpenAI, Claude, Gemini, DeepSeek, Midjourney, Runway, Sora and more. OpenAI-compatible API, pay-as-you-go, transparent billing.",

  // === Common ===
  "common.login": "Sign in",
  "common.register": "Sign up free",
  "common.signup_short": "Sign up",
  "common.logout": "Log out",
  "common.enter_console": "Open console",
  "common.view_all": "View all",
  "common.view_more": "View more →",
  "common.language": "Language",
  "common.zh": "中文",
  "common.en": "English",
  "common.required": "required",
  "common.optional": "optional",
  "common.back": "Back",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.save": "Save",
  "common.loading": "Loading…",

  // === Landing · Nav ===
  "nav.models": "Models",
  "nav.features": "Features",
  "nav.pricing": "Pricing",
  "nav.faq": "FAQ",
  "nav.xingye": "Xingye AI Chat",

  // === Landing · Hero ===
  "hero.chip.online": "SYSTEM ONLINE",
  "hero.chip.latency": "LATENCY 38 MS",
  "hero.chip.version": "v 2.0.0",
  "hero.badge.new": "Just launched · aggregating",
  "hero.badge.new_suffix": "top models worldwide",
  "hero.title.prefix": "One top-up,",
  "hero.title.gradient": "every AI model in the world",
  "hero.desc":
    "OpenAI, Claude, Gemini, DeepSeek, Midjourney, Runway, Sora… one account, one API, pay as you go. Say goodbye to juggling accounts, bills and SDKs.",
  "hero.cta.start_free": "Start free",
  "hero.cta.view_models": "Browse models",
  "hero.perk.signup_bonus": "¥5 free credit on signup",
  "hero.perk.compat_api": "OpenAI-compatible API",
  "hero.perk.referral": "10% referral rewards",
  "hero.perk.uptime": "24/7 high availability",

  // === Stats ===
  "stats.chat_models": "Chat models",
  "stats.image_models": "Image models",
  "stats.video_models": "Video models",
  "stats.uptime": "Service uptime",

  // === Features ===
  "features.title_prefix": "Why choose",
  "features.subtitle": "The AI infrastructure teams and developers pick",
  "features.highlight_chip": "Highlights",
  "features.f1.title": "All models, one place",
  "features.f1.desc": "Covers OpenAI, Anthropic, Google, DeepSeek, Replicate, Runway, Luma, Kling and more.",
  "features.f2.title": "OpenAI-compatible API",
  "features.f2.desc": "No refactor needed — just point base_url to us. Switching models is a single-line change.",
  "features.f3.title": "Pay as you go, fully transparent",
  "features.f3.desc": "Every call has an itemized record. No plans, no lock-ins, no auto-renewals.",
  "features.f4.title": "Enterprise-grade security",
  "features.f4.desc": "Encrypted API keys, end-to-end transit encryption, multi-region failover and automatic recovery.",
  "features.f5.title": "Text, image, video — unified",
  "features.f5.desc": "Chat, generate images and video from one console. Swap models at any time.",
  "features.f6.title": "Built for developers",
  "features.f6.desc": "Streaming, multi-turn context, batch tasks. Comes with cURL and multi-language examples.",

  // === Models section ===
  "models.title": "Global model matrix",
  "models.subtitle": "Sign up to see the full list — switch models at any time.",
  "models.type.chat": "Chat",
  "models.type.image": "Image",
  "models.type.video": "Video",
  "models.unit.image": "img",
  "models.unit.second": "sec",

  // === Pricing ===
  "pricing.title": "Pay as you go — the more you use, the less you pay",
  "pricing.subtitle": "No plan traps. Every top-up stays yours forever.",
  "pricing.recommend": "Recommended",
  "pricing.start_using": "Get started",
  "pricing.from": "from",
  "pricing.trial.name": "Trial",
  "pricing.trial.desc": "¥5 credit on signup",
  "pricing.trial.f1": "All models available",
  "pricing.trial.f2": "Email support",
  "pricing.trial.f3": "Basic QPS limits",
  "pricing.personal.name": "Personal",
  "pricing.personal.desc": "Most popular. Great for solo devs.",
  "pricing.personal.f1": "Top up 100, get 5 free",
  "pricing.personal.f2": "Higher QPS",
  "pricing.personal.f3": "Priority support",
  "pricing.enterprise.name": "Enterprise",
  "pricing.enterprise.desc": "For teams and production workloads",
  "pricing.enterprise.f1": "Top up 1000, get 80 free",
  "pricing.enterprise.f2": "Custom contract",
  "pricing.enterprise.f3": "Dedicated account manager",
  "pricing.enterprise.f4": "SLA 99.9%",

  // === FAQ ===
  "faq.title": "Frequently asked questions",
  "faq.q1": "How is billing done?",
  "faq.a1":
    "Fully pay-as-you-go. Chat models bill per 1K tokens (input/output priced separately), image models per image, video models per second. Every call is itemized.",
  "faq.q2": "Could my API key leak?",
  "faq.a2":
    "Upstream provider keys you configure live only in server memory / env vars and are never persisted. Keys you create here are stored as SHA-256 hashes only.",
  "faq.q3": "Can I get a refund?",
  "faq.a3":
    "Top-up balances are refundable (minus the amount already consumed). The demo build does not connect to real payment, but admin-adjustable balance is available in the console.",
  "faq.q4": "How do I integrate with my existing code?",
  "faq.a4":
    "We expose an OpenAI-compatible API. Point base_url to https://your-domain/v1, swap in a key generated on this platform, and you're done.",
  "faq.q5": "How does the referral program work?",
  "faq.a5":
    "Every time an invitee spends, the referrer earns a 10% commission in real time (usable directly in the wallet).",

  // === CTA ===
  "cta.title": "Start now — unlock every AI model worldwide",
  "cta.desc": "Sign up in 30 seconds. ¥5 credit on the house. Works with every model.",

  // === Footer ===
  "footer.copy_suffix": "· Unified AI model platform",
  "footer.help": "Help",

  // === Auth ===
  "auth.login.title": "Welcome back",
  "auth.login.subtitle": "Sign in to AI Hub and keep creating.",
  "auth.email": "Email",
  "auth.email_ph": "you@example.com",
  "auth.password": "Password",
  "auth.password_ph": "At least 6 characters",
  "auth.login.btn": "Sign in",
  "auth.login.no_account": "New here?",
  "auth.login.go_register": "Create an account",
  "auth.login.fail": "Sign-in failed",

  "auth.register.title": "Create your account",
  "auth.register.subtitle": "¥5 signup credit · works with every model.",
  "auth.register.name": "Display name (optional)",
  "auth.register.name_ph": "Your name",
  "auth.register.ref": "Referral code (optional)",
  "auth.register.ref_ph": "A friend's referral code",
  "auth.register.btn": "Create account",
  "auth.register.have_account": "Already registered?",
  "auth.register.go_login": "Sign in",
  "auth.register.fail": "Sign-up failed",

  // === Dashboard layout ===
  "dash.sidebar.balance": "Available balance",
  "dash.sidebar.realtime": "live",
  "dash.sidebar.view_billing": "View statements / request top-up",
  "dash.header.hello": "Hi, ",
  "dash.admin_group": "Admin",
  "dash.admin_console": "Admin console",

  // === Dashboard nav ===
  "dashnav.overview": "Overview",
  "dashnav.chat": "Chat",
  "dashnav.chat_multi": "Multi-model",
  "dashnav.image": "Image",
  "dashnav.video": "Video",
  "dashnav.explain_comic": "Comic-explain",
  "dashnav.audio": "Voice",
  "dashnav.tts": "TTS",
  "dashnav.voices": "My voices",
  "dashnav.tasks": "Tasks",
  "dashnav.gallery": "My gallery",
  "dashnav.models": "Model market",
  "dashnav.keys": "API Keys",
  "dashnav.billing": "Wallet",
  "dashnav.referrals": "Referrals",
  "dashnav.feedback": "Feedback",

  // === Dashboard home ===
  "dashhome.chip.online": "online",
  "dashhome.chip.session": "session · secured",
  "dashhome.welcome_prefix": "Welcome back, ",
  "dashhome.default_name": "creator",
  "dashhome.welcome_desc": "Here's your account overview.",
  "dashhome.start_chat": "Start chatting",

  "dashhome.stats.balance": "Balance",
  "dashhome.stats.spent7d": "Spent · 7d",
  "dashhome.stats.calls7d": "Calls · 7d",
  "dashhome.stats.calls_unit": "calls",
  "dashhome.stats.referrals": "Successful invites",
  "dashhome.stats.referrals_unit": "people",

  "dashhome.recent_assets": "Latest assets",
  "dashhome.recent_assets_desc":
    "Every image / video / audio generated here is saved to \"My gallery\" automatically.",
  "dashhome.no_assets": "No assets yet. Try",
  "dashhome.gen_image": "generating an image",
  "dashhome.submit_task": "submitting a task",
  "dashhome.bar_link": "View all →",

  "dashhome.recent_usage": "Recent usage",
  "dashhome.no_usage": "No usage yet. Go",
  "dashhome.start_chat_link": "start a chat",

  "dashhome.quick.title": "Quick links",
  "dashhome.quick.chat.label": "💬 Start chatting",
  "dashhome.quick.chat.desc": "ChatGPT / Claude / Gemini",
  "dashhome.quick.image.label": "🎨 Generate image",
  "dashhome.quick.image.desc": "DALL·E / Midjourney / Flux",
  "dashhome.quick.video.label": "🎬 Generate video",
  "dashhome.quick.video.desc": "Sora / Runway / Kling",
  "dashhome.quick.keys.label": "🔑 Get API key",
  "dashhome.quick.keys.desc": "Call from your own code",
};
