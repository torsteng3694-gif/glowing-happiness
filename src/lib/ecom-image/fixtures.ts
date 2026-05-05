/**
 * 电商一键出图 · Mock 数据
 *
 * 阶段 0 用：API skeleton 和前端组件演示均依赖此处的 mock snapshot。
 * 数据基于"智慧语音讲解租赁系统"商品（来自截图脚本），3 大类 12 张图。
 *
 * 真实 LLM 接入后此文件仅保留单元测试 / 演示页用途。
 */

import { NODE_KEYS, NODE_ORDER } from "./nodes";
import type {
  ImageAnalysisOutput,
  ImageGenerationOutput,
  ModelSelectionOutput,
  PlanCreationOutput,
  ProductAnalysisOutput,
  PromptGenerationOutput,
  SupplementInfoOutput,
} from "./schemas";

// ============================================================
// 节点 01 · 商品分析（mock 产物）
// ============================================================

export const MOCK_PRODUCT_ANALYSIS: ProductAnalysisOutput = {
  projectTitle: "智慧讲解租赁系统出图项目",
  reportMd: `从图片与文案综合判断，这是一套面向**景区 / 博物馆 / 展厅**等场景的智慧语音讲解租赁系统，核心并非单一讲解器，而是由**扫码租赁柜 + 手持讲解终端**组成的 B 端运营型设备方案。

产品视觉上呈现出明显的**白蓝科技配色、立式柜机结构、终端小巧屏显化设计**，同时终端界面已直接体现讲解、全览、语音、路线推荐等功能，因此非常适合走"智慧文旅、无人值守、系统运营"方向，而不是普通硬件陈列风格。

推荐方案中，我将**商品主图与白底图**放在最前，满足平台上架与基础转化；随后重点加入**高端科技感营销海报、整套设备组合方案图、无人租赁/多语种导览/使用流程图**等高价值类型，重点服务这类设备最关键的成交逻辑：让客户快速理解设备构成、落地场景与收益模式。

如果你后续要真正执行海报设计，建议优先围绕"**一套设备，让讲解从成本变收益**"、"**扫码即用，随借随还，无需下载 APP**"、"**无人值守，也能高效运转**"这三类信息做核心感知主视觉。`,
  recommendedTypes: [
    {
      typeKey: "main_image",
      name: "商品主图（多角度轮播）",
      description:
        "以租赁柜正面、侧面 45°、整套设备组合、手持讲解终端正反面等多角度轮播呈现，突出白蓝科技配色、柜体高度、取还口、屏幕区与终端外观，画面干净专业，统一 1:1 构图。",
      priorityTags: ["必选"],
      sceneTags: ["平台必需"],
      valueChip: "点击率提升关键",
      platforms: ["全平台", "淘宝/天猫", "京东", "拼多多", "抖店", "1688"],
      reasoning:
        "该产品属于设备型解决方案。采购方需要先快速看清整机柜体、手持端及整体外观结构，主图决定首轮点击与专业信任度。",
      rating: "win",
    },
    {
      typeKey: "white_bg",
      name: "白底图",
      description:
        "纯白背景，分别输出租赁柜单体、手持讲解终端单体、整套组合三类标准图，产品主体居中，不加夸张特效，不修改任何结构与文字信息，保持设备真实比例与轮廓。",
      priorityTags: ["必选"],
      sceneTags: ["平台必需"],
      valueChip: "搜索流量入口",
      platforms: ["全平台", "淘宝/天猫", "京东", "拼多多", "抖店", "1688"],
      reasoning:
        "该类型是硬件在平台审核、搜索展示和详情页规范化排列中都需要标准白底图，能提升商品专业度与上架效率。",
      rating: "win",
    },
    {
      typeKey: "poster_high_end",
      name: "高端科技感营销海报",
      description:
        '严格保留原图产品不变，仅做背景与光效合成；建议以深蓝/银灰科技空间、数据光线、数字化场馆氛围强化"智慧讲解系统"定位。文案建议优选 2~3 条："一套设备，让讲解从成本变收益"、"扫码即用，随借随还，无需下载 APP"、"无人值守，也能高效运转"。',
      priorityTags: ["高转化"],
      sceneTags: ["品牌建设"],
      valueChip: "详情页转化核心",
      platforms: ["全平台", "官网/招商页", "小红书", "抖店"],
      reasoning:
        "用户已明确提出需要高端科技感海报，而该产品本身具备智慧文旅、无人租赁、系统化运营属性，非常适合用 KV 海报建立高价值感。",
      rating: "win",
    },
    {
      typeKey: "set_combo",
      name: "整套设备组合方案图",
      description:
        "将租赁柜与手持讲解终端组合展示。可采用主次分量构图：柜机为主、终端放大辅助，配置标注说明扫码租借-佩戴使用-归还管理的系统关系。突出这是完整解决方案而非单件设备。",
      priorityTags: ["推荐", "高转化"],
      sceneTags: ["差异化"],
      valueChip: "方案理解与询盘促进",
      platforms: ["全平台", "1688", "淘宝/天猫"],
      reasoning:
        '该商品不是单一硬件，而是"租赁柜+讲解终端"的一体化系统，必须单独做一张方案图，让客户一眼看懂卖的是什么。',
      rating: "win",
    },
    {
      typeKey: "selling_unmanned",
      name: "核心卖点图：无人值守自动租赁",
      description:
        "围绕扫码租赁柜正面构图做卖点图，突出扫码即用、自动借还、无人值守、高效运营等信息；画面可叠加流程箭头、扫码图标、收益型数据语言，但产品本体保持原图一致。",
      priorityTags: ["高转化"],
      sceneTags: ["差异化"],
      valueChip: "采购决策核心说服",
      platforms: ["全平台", "1688", "京东"],
      reasoning:
        '从用户文案看，最强商业价值不是单纯讲解功能，而是"自动租赁+持续收益"，这是 B 端客户最关心的决策点。',
      rating: "win",
    },
    {
      typeKey: "selling_multilingual",
      name: "核心卖点图：多语种与智能导览功能",
      description:
        "以终端正面屏幕为视觉中心，拆解展示多语种讲解、路线推荐、全览模式、文物推荐等功能模块；视觉上采用 UI 卡片式排版，强化服务游客体验升级这一价值。",
      priorityTags: ["推荐", "高转化"],
      sceneTags: ["差异化"],
      valueChip: "功能价值强化",
      platforms: ["全平台", "淘宝/天猫", "京东"],
      reasoning:
        "手持终端屏幕已直观体现讲解模式、全览模式、语音、文物推荐、路线推荐等功能，这是产品差异化展示的天然素材。",
      rating: "win",
    },
    {
      typeKey: "flow_chart",
      name: "使用流程图（扫码-租借-讲解-归还）",
      description:
        '用 4 步或 5 步可视化流程呈现"扫码—取机—自动讲解/导览—归还—后台结算"，构图简洁，搭配设备实拍与线性图标，突出"无需下载 APP、随借随还、上手简单"。',
      priorityTags: ["推荐", "高转化"],
      sceneTags: ["高转化"],
      valueChip: "降低理解门槛",
      platforms: ["全平台", "1688", "抖店"],
      reasoning:
        "该产品涉及租赁流程，若不把使用路径讲清楚，客户容易误以为部署复杂；流程图能显著降低沟通成本。",
      rating: "win",
    },
    {
      typeKey: "scene_fit",
      name: "场景适配图（景区/博物馆/展厅）",
      description:
        "分别在景区入口、博物馆大厅、展厅前台等场景中做环境合成，强调设备落地后的空间融入感与科技感；产品必须保留原外观，只替换背景与场景氛围。",
      priorityTags: ["推荐"],
      sceneTags: ["差异化"],
      valueChip: "应用场景拓展",
      platforms: ["全平台", "小红书", "1688"],
      reasoning:
        "该设备说明面向文旅与展陈场景，展示适配空间越清晰，越能扩大客户代入感和行业覆盖面。",
      rating: "mid",
    },
    {
      typeKey: "ops_efficiency",
      name: "运营效率图（高峰承载与后台管理）",
      description:
        "采用数据化视觉表达容量、并发租借、设备状态可视化、收益一目了然等信息，可结合柜机正面与简化数据面板做信息化排版，突出系统运营属性。",
      priorityTags: ["推荐", "高转化"],
      sceneTags: ["高转化"],
      valueChip: "B 端询盘转化关键",
      platforms: ["全平台", "1688", "官网/招商页"],
      reasoning:
        '文案中的"120 台同时租借"与"一体化后台管理"直接对应运营效率和管理能力，是 B 端客户判断投入产出比的重要依据。',
      rating: "mid",
    },
    {
      typeKey: "detail_close",
      name: "产品细节图（终端外观/接口/柜体结构）",
      description:
        "对手持终端正面屏幕、背部结构、边缘接口，以及租赁柜取还口、机身开孔、轮组等细节做局部放大展示，采用简洁标注与高科技感背景，强调工整、耐用、落地性强。",
      priorityTags: ["推荐"],
      sceneTags: ["差异化"],
      valueChip: "细节专业感",
      platforms: ["全平台", "淘宝/天猫", "京东"],
      reasoning:
        "设备型商品的材质、接口、屏幕、取还结构、移动脚轮等细节会直接影响客户对工整与可靠性的判断。",
      rating: "mid",
    },
  ],
};

// ============================================================
// 节点 02 · 资料补全（mock：skip 模式）
// ============================================================

export const MOCK_SUPPLEMENT_INFO: SupplementInfoOutput = {
  mode: "skip",
  judgement: `现有信息已经可以直接进入出图阶段。你提供的 5 张图片已覆盖**租赁柜正面/斜侧角度**以及**手持终端正面/背面/细节视角**，足以支撑所选的商品主图轮播、白底图和高端科技感营销海报三类输出。

同时，你已明确要求**产品外观必须与原图完全一致**、整体走**科技感**方向，并给出了可选文案，这些约束对海报执行已足够清晰。后续可直接基于现有素材进行排版与背景合成，无需再补充资料。`,
  questions: [],
};

// ============================================================
// 节点 03 · 图片内容分析（mock）
// ============================================================

/** 通用占位图（用 picsum.photos，返回真实 JPEG，能被视觉模型接受） */
export const placeholderImage = (label: string, hue = 200) => {
  // 用 hue 当 picsum 的 seed，保证同 label 总是同一张图
  const seed = (hue * 31 + label.length * 13) % 1000;
  return `https://picsum.photos/seed/ecom-${seed}/600/600`;
};

export const MOCK_SOURCE_IMAGES = [
  {
    id: "src_001",
    url: placeholderImage("租赁柜 三视图", 210),
    filename: "shelf-front.jpg",
    title: "智慧语音讲解租借机三视图展示蓝白配色",
    description:
      "主体为立式智慧讲解租借设备。画面展示左侧 45 度、正面、右侧 45 度三视图，机身以白色为主，侧边配以深蓝色色块及深蓝色屏幕。上半部为内容显示与互动屏，下方设有取还口和大面积梯格散热侧板。下方应设有方向轮，整体为先进无人值守管理下的中高端工业产品系列。光线柔和均匀。",
  },
  {
    id: "src_002",
    url: placeholderImage("讲解器 45° 拍摄", 220),
    filename: "device-45.jpg",
    title: "白色便携讲解设备 45 度俯拍展示图",
    description:
      "主体为一款白色长方形电子设备。画面呈现为圆角立式，正面有屏显与圆形按钮，中央伸出两条黑色带状部件，形成绳挂状交叉对比；侧边可见接口与按键带特写，整体边角充分倒圆，质感为洁净光感塑料。",
  },
  {
    id: "src_003",
    url: placeholderImage("讲解器 接口", 230),
    filename: "device-front.jpg",
    title: "白色长方形电子设备正面展示双蓝色接口",
    description:
      "主体为一款白色长方形电子设备，圆角立式正面居中展示。表面带圆形屏幕及双蓝色按键，机身上部有圆形凹槽接口，内附固定两枚直且色调深蓝的细管，下方可见一银色金属接口与一白色接口；机身简约清洁。背景为浅灰色，光线柔和均匀。所示设备整体呈现干净、洁净、科技感的产品风格。",
  },
  {
    id: "src_004",
    url: placeholderImage("讲解器 正面屏", 240),
    filename: "terminal-front.jpg",
    title: "白色智能讲解器正面产品展示图",
    description:
      "主体为一台白色便携式智能讲解设备。画面正面直立中展示，正面屏幕居中，上半部分为黑色触控屏，屏内显示彩色图标网格化排列，含讲解模式、全览模式、语音、文物推荐、导游模式、路线推荐等中文界面，且有三处中文按钮显示。下半部分为纯白塑料机身。表面线条整洁，体现自然、简约、科技感的产品风格。",
  },
  {
    id: "src_005",
    url: placeholderImage("讲解器 触屏 UI", 250),
    filename: "terminal-screen.jpg",
    title: "白色智能讲解器正面展示触屏界面图",
    description:
      "主体为一台白色便携式智能讲解设备，正面居中直立展示。上半部分为黑色触控屏，屏内显示彩色图标的六宫格化菜单标识，含讲解模式、全览模式、语音、文物推荐、导游模式、路线推荐等中文图标和文字；图标排列清晰可辨，背景纯白。下部为纯白塑料壳体。表面简洁干净，呈现简约、专业、科技感产品风格。",
  },
] as const;

export const MOCK_IMAGE_ANALYSIS: ImageAnalysisOutput = {
  items: MOCK_SOURCE_IMAGES.map((img) => ({
    sourceImageId: img.id,
    title: img.title,
    description: img.description,
  })),
};

// ============================================================
// 节点 04 · 出图方案规划（mock）
// ============================================================

const PLAN_GROUP_MAIN_PLANS = [
  {
    title: "租借柜正面标准主图",
    description:
      "以租借柜正面视角为主体，保持原图浅灰背景与机身文字，二维码、取还口完全不变，置于浅灰中性背景中展示。统一 1:1 构图，光线柔和均匀，突出柜机标准版与专业设备属性。",
  },
  {
    title: "租借柜 45 度立体展示",
    description:
      "选用柜机右倾 45 度视图，完整呈现顶部信息屏、刷码区域、中部门匹配仓与取还口面板，背景保持浅灰色或淡白，加入轻微地面阴影增强立体感，适合作为轮播中的结构展示页。",
  },
  {
    title: "整套设备组合主图",
    description:
      "将租借柜与讲解终端同框组合陈列，柜机作为主视觉居左机居中，终端居放大置于前景；柜机为主，终端达细辅助分量，外观不变，突出这是一套完整的智慧讲解租赁系统。",
  },
  {
    title: "讲解终端正面屏显图",
    description:
      "使用讲解器正面屏显素材，保留屏幕内原有六宫格化菜单页面与三枚触控按键，采用居中直立构图与浅灰色纯底色，重点体现产品交互感、科技感与便携终端的清晰识别度。",
  },
  {
    title: "讲解终端背部细节图",
    description:
      "采用讲解终端背部或接口展示素材，突出顶部圆形回卷、双黑色带状部件、倒边设计与一颗单独按键带等特写，背景延续统一浅灰电商风，呈现与正面屏显互补的完整轮廓信息。",
  },
];

const PLAN_GROUP_WHITE_BG_PLANS = [
  {
    title: "租借柜单体白底图",
    description:
      "纯白背景，单张租借柜正面标准白底图，产品完整居中，保留机身全部结构、按钮、二维码与文字信息，不做任何包装或挂件附加饰物，符合平台白底标准的搜索展示需求。",
  },
  {
    title: "讲解终端单体白底图",
    description:
      "以讲解器正面为主体输出白底标准图，屏幕界面、按键、圆角轮廓清晰，背景为高亮纯白色、阴影控制在极浅范围内，突出设备清洁、便携、标准的产品风格。",
  },
  {
    title: "整套设备组合白底图",
    description:
      "终端机与讲解柜组合输出在纯白背景上，柜机为主体，终端为辅助，保持具实大小关系与体积感，画面不添加任何背景元素，便于详情页对照整套设备组合并采购对比之用。",
  },
];

const PLAN_GROUP_POSTER_PLANS = [
  {
    title: "收益型主 KV 海报",
    description:
      '以租借柜为唯一主视觉，严格保留原图柜体外观与机身信息，置入深蓝银灰科技背景空间，加入冷色的数据感线纹与粒子点光，主文案建议使用"一套设备，让讲解从成本变收益"，形成招商型 KV 气场。',
  },
  {
    title: "扫码租借科技海报",
    description:
      '以柜机正面图为主体，背景点亮为数字化场馆入口或科技大厅，氛围可加入扫码光波，引导线和柔暖图标，但不要遮挡产品。主文案建议使用"扫码即用，随借随还，无需下载 APP"。',
  },
  {
    title: "无人值守运营海报",
    description:
      '采用柜机与终端组合俯拍，柜机在右、终端适居放置量大，背景使用蓝色数据网线与智能场景氛围；突出系统化运营感，辅以"无人值守，也能高效运转"作为核心卖点文案。',
  },
  {
    title: "智慧讲解场景海报",
    description:
      "以讲解终端正面屏显为视觉焦点，结合博物馆或展厅的虚化数字场景进行环境合成。保留屏幕画面不变，搭配简洁副文案，强化智慧讲解、多语支持服务体验。",
  },
];

let _planIdSeq = 0;
const newPlanId = () => `pl_${String(++_planIdSeq).padStart(3, "0")}`;

export const MOCK_PLAN_CREATION: PlanCreationOutput = {
  totalGroups: 3,
  totalImages: 12,
  groups: [
    {
      typeId: "type_main",
      typeKey: "main_image",
      typeName: "商品主图（多角度轮播）",
      description: MOCK_PRODUCT_ANALYSIS.recommendedTypes[0].description,
      priorityTags: ["必选"],
      sceneTags: ["平台必需"],
      valueChip: "点击率提升关键",
      platforms: ["全平台", "淘宝/天猫", "京东", "拼多多", "抖店", "1688"],
      rating: "win",
      strategy: {
        summary:
          "以专业科技感+真实设备展示为核心，先把柜机与讲解终端的外观结构讲清楚，再建立整套系统的标准化商品认知。",
        thinking: "优先覆盖柜机正面、45°、整套组合、终端正反信息",
        colorPlan: "延续原图浅灰背景，承接白蓝机身，画面干净克制",
        lighting: "柔和均匀棚拍光，保留轻微投影增强立体感",
        composition: "统一 1:1 居中陈列，突出柜体比例、取还口、屏显与接口细节",
      },
      plans: PLAN_GROUP_MAIN_PLANS.map((p, i) => ({
        planId: newPlanId(),
        idx: i + 1,
        title: p.title,
        description: p.description,
        aspectRatio: "1:1",
        referenceIds: [],
        origin: "auto" as const,
      })),
    },
    {
      typeId: "type_white_bg",
      typeKey: "white_bg",
      typeName: "白底图",
      description: MOCK_PRODUCT_ANALYSIS.recommendedTypes[1].description,
      priorityTags: ["必选"],
      sceneTags: ["平台必需"],
      valueChip: "搜索流量入口",
      platforms: ["全平台", "1688", "淘宝/天猫", "京东", "拼多多", "抖店"],
      rating: "win",
      strategy: {
        summary: '以"标准化、可上架、易识别"为目标，输出干净统一的白底商品图，强化设备专业度与平台兼容性。',
        thinking: "分别呈现柜机单体、终端单体、整套组合三类标准图",
        colorPlan: "纯白背景，不加装饰，不偏色",
        lighting: "高亮柔光，阴影极轻，边缘清晰",
        composition: "主体居中、大留白、比例真实，确保结构与文字信息完整可见",
      },
      plans: PLAN_GROUP_WHITE_BG_PLANS.map((p, i) => ({
        planId: newPlanId(),
        idx: i + 1,
        title: p.title,
        description: p.description,
        aspectRatio: "1:1",
        referenceIds: [],
        origin: "auto" as const,
      })),
    },
    {
      typeId: "type_poster",
      typeKey: "poster_high_end",
      typeName: "高端科技感营销海报",
      description: MOCK_PRODUCT_ANALYSIS.recommendedTypes[2].description,
      priorityTags: ["高转化"],
      sceneTags: ["品牌建设"],
      valueChip: "详情页转化核心",
      platforms: ["全平台", "官网/招商页", "小红书", "抖店"],
      rating: "win",
      strategy: {
        summary:
          '以"深蓝数智空间"塑造高端招商感，严格保留原图产品，仅通过背景、光效与排版强化"智慧讲解系统"的价值表达。',
        thinking: "柜机做主视觉，终端做功能辅助，突出整套方案感",
        colorPlan: "每张海报仅选 1 条主文案，可配 1 条短副文案，避免堆砌",
        lighting: "蓝银数据线、体积光、微粒子，增强科技感但不遮挡产品",
        composition: "海报级层次构图，产品居中偏下，标题区留白清晰",
      },
      plans: PLAN_GROUP_POSTER_PLANS.map((p, i) => ({
        planId: newPlanId(),
        idx: i + 1,
        title: p.title,
        description: p.description,
        aspectRatio: "3:4",
        referenceIds: [],
        origin: "auto" as const,
      })),
    },
  ],
};

/** 平铺所有 plan，便于节点 06/07 引用 */
export const MOCK_ALL_PLANS = MOCK_PLAN_CREATION.groups.flatMap((g) => g.plans);

// ============================================================
// 节点 05 · 模型选择（mock）
// ============================================================

export const MOCK_MODEL_SELECTION: ModelSelectionOutput = {
  availableModels: [
    {
      slug: "nano-banana-pro",
      name: "Nano Banana Pro",
      description: "推荐 · 写实电商主图最强势，对中文提示词支持好，单图速度快",
      unitPrice: 0.3,
      avgLatencySec: 8,
      tags: ["推荐", "电商", "写实"],
      preferredLanguage: "zh",
      sampleUrls: [],
    },
    {
      slug: "seedream-3",
      name: "Seedream 3.0",
      description: "国产强势模型，文案+图融合好，海报场景表现优秀",
      unitPrice: 0.25,
      avgLatencySec: 12,
      tags: ["海报", "中文"],
      preferredLanguage: "zh",
      sampleUrls: [],
    },
    {
      slug: "gpt-image-1",
      name: "GPT Image 1",
      description: "高品质英文提示词模型，复杂场景与文字渲染稳定",
      unitPrice: 0.4,
      avgLatencySec: 18,
      tags: ["高级", "英文"],
      preferredLanguage: "en",
      sampleUrls: [],
    },
    {
      slug: "jimeng-3.0",
      name: "即梦 3.0",
      description: "字节自研，强场景化背景生成；速度均衡",
      unitPrice: 0.18,
      avgLatencySec: 10,
      tags: ["性价比", "场景化"],
      preferredLanguage: "zh",
      sampleUrls: [],
    },
  ],
  selectedSlug: "nano-banana-pro",
  promptLanguage: "zh",
  imagesPerPlan: 2,
  estimatedTotalCost: 0.3 * 12 * 2,
};

// ============================================================
// 节点 06 · 提示词生成（mock）
// ============================================================

export const MOCK_PROMPT_GENERATION: PromptGenerationOutput = {
  prompts: MOCK_ALL_PLANS.map((p) => ({
    planId: p.planId,
    language: "zh" as const,
    prompt: `${p.title}。${p.description}\n\n要求：保持产品外观与原图完全一致，仅调整背景与光效。画面 ${p.aspectRatio} 比例，干净专业，电商可上架级别。`,
    negativePrompt: "产品变形, 文字篡改, 颜色偏差, 多余水印, 低分辨率",
    staleHint: false,
  })),
};

// ============================================================
// 节点 07 · 批量出图（mock generated images）
// ============================================================

/**
 * 每个 plan 默认 2 张候选；前 4 张全部 done，第 5 张 1 done 1 running，
 * 后面 plans 全部 done，营造"刚好生成完"的演示态。
 */
export const MOCK_GENERATED_IMAGES = MOCK_ALL_PLANS.flatMap((p, planIdx) => [
  {
    id: `gen_${p.planId}_1`,
    planId: p.planId,
    candidateIdx: 1,
    status: "done",
    progress: 100,
    runCount: 1,
    url: placeholderImage(`${p.title} #1`, 30 + planIdx * 17),
    promptSnapshot: MOCK_PROMPT_GENERATION.prompts[planIdx]?.prompt ?? "",
    modelSlugSnapshot: "nano-banana-pro",
    width: 1024,
    height: 1024,
    cost: 0.3,
    realCost: 0.18,
    picked: planIdx < 3,
    errorMessage: null,
  },
  {
    id: `gen_${p.planId}_2`,
    planId: p.planId,
    candidateIdx: 2,
    status: planIdx === 4 ? "running" : "done",
    progress: planIdx === 4 ? 60 : 100,
    runCount: 1,
    url: planIdx === 4 ? null : placeholderImage(`${p.title} #2`, 50 + planIdx * 17),
    promptSnapshot: MOCK_PROMPT_GENERATION.prompts[planIdx]?.prompt ?? "",
    modelSlugSnapshot: "nano-banana-pro",
    width: 1024,
    height: 1024,
    cost: planIdx === 4 ? 0 : 0.3,
    realCost: planIdx === 4 ? 0 : 0.18,
    picked: false,
    errorMessage: null,
  },
]);

export const MOCK_IMAGE_GENERATION: ImageGenerationOutput = {
  totalPlans: MOCK_ALL_PLANS.length,
  totalCandidates: MOCK_GENERATED_IMAGES.length,
  doneCandidates: MOCK_GENERATED_IMAGES.filter((g) => g.status === "done").length,
  failedCandidates: 0,
  pickedCandidates: MOCK_GENERATED_IMAGES.filter((g) => g.picked).length,
  allCompleted: false,
};

// ============================================================
// 节点级 output 映射（给 mock-engine 用）
// ============================================================

export const MOCK_NODE_OUTPUTS: Record<(typeof NODE_ORDER)[number], unknown> = {
  [NODE_KEYS.PRODUCT_ANALYSIS]: MOCK_PRODUCT_ANALYSIS,
  [NODE_KEYS.SUPPLEMENT_INFO]: MOCK_SUPPLEMENT_INFO,
  [NODE_KEYS.IMAGE_ANALYSIS]: MOCK_IMAGE_ANALYSIS,
  [NODE_KEYS.PLAN_CREATION]: MOCK_PLAN_CREATION,
  [NODE_KEYS.MODEL_SELECTION]: MOCK_MODEL_SELECTION,
  [NODE_KEYS.PROMPT_GENERATION]: MOCK_PROMPT_GENERATION,
  [NODE_KEYS.IMAGE_GENERATION]: MOCK_IMAGE_GENERATION,
};

// ============================================================
// 起始项目模板（POST /projects 新建时的默认提示）
// ============================================================

export const MOCK_INITIAL_PROMPT_PLACEHOLDER =
  "输入商品名称和详细信息，例如：XXX 品牌玻尿酸精华液，30ml，主打三重保湿…";

export const MOCK_USER_PROMPT_FALLBACK = `请基于我提供的产品图片生成一张高端营销海报。严格禁止对产品进行任何修改，包括但不限于形状、颜色、结构、按钮、接口、LOGO、文字内容，产品必须与原图完全一致，仅允许更换背景与视觉效果。

可以用的文案有：
- 一套设备，让讲解从成本变收益
- 扫码即用，随借随还，无需下载 APP，无人值守，也能高效运转
- 精准感应触发轻至 30g，长时间佩戴无负担
- 120 台同时租借，高峰期无需排队，一体化后台管理`;
