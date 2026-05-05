import type { VoiceOption } from "./AssetsEditor";

/**
 * Vidu 预设音色清单（来自官方音色列表）
 * - id      = voice_id（直接用于 explain-comic.assets[].voice_id 与 audio-tts.voice_setting_voice_id）
 * - label   = 展示名（中文/原文 优先，英文名补充）
 * - group   = 语言分组（用于 <optgroup>）
 * - sample  = 试听音频 URL（前端可点小喇叭试听）
 *
 * 总数：约 300 个
 */
export type ViduVoice = VoiceOption & {
  /** 试听音频 URL */
  sample?: string;
  /** 是否推荐用于旁白（首位高亮） */
  recommended?: boolean;
};

const ZH = "中文 · 普通话";
const ZH_BETA = "中文 · 普通话 (Beta)";
const ZH_HD = "中文 · 普通话 · 高质量";
const ZH_KIDS = "中文 · 童声/卡通";
const ZH_DRAMA = "中文 · 剧情角色";
const YUE = "中文 · 粤语";
const EN = "English";
const JA = "日本語";
const KO = "한국어";
const ES = "Español";
const PT = "Português";
const FR = "Français";
const ID = "Bahasa Indonesia";
const DE = "Deutsch";
const RU = "Русский";
const IT = "Italiano";
const AR = "العربية";
const TR = "Türkçe";
const UK = "Українська";
const NL = "Nederlands";
const VI = "Tiếng Việt";

/* eslint-disable max-len */
export const PRESET_VOICES: ViduVoice[] = [
  // ===== 推荐旁白音色（保留向后兼容，置顶分组） =====
  { id: "Chinese_Female_Protagonist1", label: "中文 · 成女旁白（推荐）", group: "推荐旁白", recommended: true },
  { id: "Chinese_Male_Protagonist",    label: "中文 · 成男旁白（推荐）", group: "推荐旁白", recommended: true },

  // ===== 中文 · 普通话 (1-8) =====
  { id: "male-qn-qingse",      label: "青涩青年", group: ZH, sample: "https://scene.vidu.zone/media-asset/072356-uLeoUwGWiQQZLiKH.mp3" },
  { id: "male-qn-jingying",    label: "精英青年", group: ZH, sample: "https://scene.vidu.zone/media-asset/072356-7hgJgP689lvUsESC.mp3" },
  { id: "male-qn-badao",       label: "霸道青年", group: ZH, sample: "https://scene.vidu.zone/media-asset/072356-ypZmFjxo84q476Ds.mp3" },
  { id: "male-qn-daxuesheng",  label: "青年大学生", group: ZH, sample: "https://scene.vidu.zone/media-asset/072356-T4kIZ1khgduPiW2i.mp3" },
  { id: "female-shaonv",       label: "少女", group: ZH, sample: "https://scene.vidu.zone/media-asset/072356-Zp3xnBAgMpkKN0fb.mp3" },
  { id: "female-yujie",        label: "御姐", group: ZH, sample: "https://scene.vidu.zone/media-asset/072356-YiaFlpiWzo4Twkxb.mp3" },
  { id: "female-chengshu",     label: "成熟女性", group: ZH, sample: "https://scene.vidu.zone/media-asset/072356-HCbEW2grkWSOVYXB.mp3" },
  { id: "female-tianmei",      label: "甜美女性", group: ZH, sample: "https://scene.vidu.zone/media-asset/072356-gc9rn0lig2Phdh1g.mp3" },

  // ===== 中文 · 普通话 Beta (9-16) =====
  { id: "male-qn-qingse-jingpin",     label: "青涩青年-beta", group: ZH_BETA, sample: "https://scene.vidu.zone/media-asset/072356-HnCFvXEmdYsw1aR3.mp3" },
  { id: "male-qn-jingying-jingpin",   label: "精英青年-beta", group: ZH_BETA, sample: "https://scene.vidu.zone/media-asset/072357-LE3qZSK6GAKVnYeW.mp3" },
  { id: "male-qn-badao-jingpin",      label: "霸道青年-beta", group: ZH_BETA, sample: "https://scene.vidu.zone/media-asset/072357-HYMATRMvsle2yt76.mp3" },
  { id: "male-qn-daxuesheng-jingpin", label: "青年大学生-beta", group: ZH_BETA, sample: "https://scene.vidu.zone/media-asset/072357-5rEScknS588MBpFa.mp3" },
  { id: "female-shaonv-jingpin",      label: "少女-beta", group: ZH_BETA, sample: "https://scene.vidu.zone/media-asset/072357-76I89nNs8pI9KTnA.mp3" },
  { id: "female-yujie-jingpin",       label: "御姐-beta", group: ZH_BETA, sample: "https://scene.vidu.zone/media-asset/072357-cnSquEUZyUTm0EM3.mp3" },
  { id: "female-chengshu-jingpin",    label: "成熟女性-beta", group: ZH_BETA, sample: "https://scene.vidu.zone/media-asset/072357-BLBVdk5lacUOjTlv.mp3" },
  { id: "female-tianmei-jingpin",     label: "甜美女性-beta", group: ZH_BETA, sample: "https://scene.vidu.zone/media-asset/072357-aatAGT8Yrj5VlLhB.mp3" },

  // ===== 童声 & 卡通 (17-20) =====
  { id: "clever_boy",   label: "聪明男童", group: ZH_KIDS, sample: "https://scene.vidu.zone/media-asset/072357-iKVi4SXFzAD8hwr2.mp3" },
  { id: "cute_boy",     label: "可爱男童", group: ZH_KIDS, sample: "https://scene.vidu.zone/media-asset/072358-74OupDa2hVtAiEC7.mp3" },
  { id: "lovely_girl",  label: "萌萌女童", group: ZH_KIDS, sample: "https://scene.vidu.zone/media-asset/072358-lG8JoFnhYTMZF0u2.mp3" },
  { id: "cartoon_pig",  label: "卡通猪小琪", group: ZH_KIDS, sample: "https://scene.vidu.zone/media-asset/072358-TEMSh2Ofg8Veq7tQ.mp3" },

  // ===== 剧情角色 (21-30) =====
  { id: "bingjiao_didi",       label: "error", group: ZH_DRAMA, sample: "https://scene.vidu.zone/media-asset/072358-Rv9wMGYjHki3XE0W.mp3" },
  { id: "junlang_nanyou",      label: "俊朗男友", group: ZH_DRAMA, sample: "https://scene.vidu.zone/media-asset/072358-apYWF4sTFAu4HT4n.mp3" },
  { id: "chunzhen_xuedi",      label: "纯真学弟", group: ZH_DRAMA, sample: "https://scene.vidu.zone/media-asset/072358-1mna0aj1O43QFJu4.mp3" },
  { id: "lengdan_xiongzhang",  label: "冷淡学长", group: ZH_DRAMA, sample: "https://scene.vidu.zone/media-asset/072358-YzI6fisVFXYBDZj8.mp3" },
  { id: "badao_shaoye",        label: "霸道少爷", group: ZH_DRAMA, sample: "https://scene.vidu.zone/media-asset/072359-IIt6p1U9NxkMp1Y6.mp3" },
  { id: "tianxin_xiaoling",    label: "甜心小玲", group: ZH_DRAMA, sample: "https://scene.vidu.zone/media-asset/072359-AqyIK6uEnVwlF6jh.mp3" },
  { id: "qiaopi_mengmei",      label: "俏皮萌妹", group: ZH_DRAMA, sample: "https://scene.vidu.zone/media-asset/072359-Oz5Tzdi3pbCJKq4T.mp3" },
  { id: "wumei_yujie",         label: "妩媚御姐", group: ZH_DRAMA, sample: "https://scene.vidu.zone/media-asset/072359-9eRzdU0O3KKxnSWR.mp3" },
  { id: "diadia_xuemei",       label: "嗲嗲学妹", group: ZH_DRAMA, sample: "https://scene.vidu.zone/media-asset/072359-QKczPrBYdkh7cYnk.mp3" },
  { id: "danya_xuejie",        label: "淡雅学姐", group: ZH_DRAMA, sample: "https://scene.vidu.zone/media-asset/072359-z9HkOg1rpDOTcEF6.mp3" },

  // ===== 中文 高质量 (31-58) =====
  { id: "Chinese (Mandarin)_Reliable_Executive",    label: "沉稳高管", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072014-KyNan6ZbFWullcwA.mp3" },
  { id: "Chinese (Mandarin)_News_Anchor",           label: "新闻女声", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072014-HO8qN7HowLpDeSxk.mp3" },
  { id: "Chinese (Mandarin)_Mature_Woman",          label: "error", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072014-YRHkapPGWTi6AMpF.mp3" },
  { id: "Chinese (Mandarin)_Unrestrained_Young_Man",label: "不羁青年", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072014-ErSH4gUWyXwoKm0N.mp3" },
  { id: "Arrogant_Miss",                            label: "嚣张小姐", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072014-tN236iR4Y4UIYhtu.mp3" },
  { id: "Robot_Armor",                              label: "机械战甲", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072014-QH6ZIG4sFWV5LG1n.mp3" },
  { id: "Chinese (Mandarin)_Kind-hearted_Antie",    label: "热心大婶", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072014-A1APFa473HjaBhVL.mp3" },
  { id: "Chinese (Mandarin)_HK_Flight_Attendant",   label: "港普空姐", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072014-krsfdA78yBt7Xo60.mp3" },
  { id: "Chinese (Mandarin)_Humorous_Elder",        label: "搞笑大爷", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072014-cE1nhz9ZGzIdBpzz.mp3" },
  { id: "Chinese (Mandarin)_Gentleman",             label: "温润男声", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072015-ireMGTMsZwkcvnpK.mp3" },
  { id: "Chinese (Mandarin)_Warm_Bestie",           label: "温暖闺蜜", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072015-gw8VczK4UgGq7PDT.mp3" },
  { id: "Chinese (Mandarin)_Male_Announcer",        label: "播报男声", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072015-7roXgurt9k7hKzFE.mp3" },
  { id: "Chinese (Mandarin)_Sweet_Lady",            label: "甜美女声", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072015-gPhnrlLLSAUkqlbb.mp3" },
  { id: "Chinese (Mandarin)_Southern_Young_Man",    label: "南方小哥", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072015-IBxrNvCcpPsftZPY.mp3" },
  { id: "Chinese (Mandarin)_Wise_Women",            label: "阅历姐姐", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072015-cAA4pkMzycpyJnS7.mp3" },
  { id: "Chinese (Mandarin)_Gentle_Youth",          label: "温润青年", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072016-SJM3A4MPLxkwTpPb.mp3" },
  { id: "Chinese (Mandarin)_Warm_Girl",             label: "温暖少女", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072016-YqsIYQx95ejnm60I.mp3" },
  { id: "Chinese (Mandarin)_Kind-hearted_Elder",    label: "花甲奶奶", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072016-thIywqHMOxldDrHy.mp3" },
  { id: "Chinese (Mandarin)_Cute_Spirit",           label: "憨憨萌兽", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072016-kETCNwyPyI1BCqbA.mp3" },
  { id: "Chinese (Mandarin)_Radio_Host",            label: "电台男主播", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072016-R9fYJ99T9l4aGNGS.mp3" },
  { id: "Chinese (Mandarin)_Lyrical_Voice",         label: "抒情男声", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072016-3ZBJxk5fdLq6RekB.mp3" },
  { id: "Chinese (Mandarin)_Straightforward_Boy",   label: "率真弟弟", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072016-qmBBLsW7U5IQd6LN.mp3" },
  { id: "Chinese (Mandarin)_Sincere_Adult",         label: "真诚青年", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072016-vzzOfzNfOWtNOyOM.mp3" },
  { id: "Chinese (Mandarin)_Gentle_Senior",         label: "温柔学姐", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072016-PaRQa8DijbAn6erR.mp3" },
  { id: "Chinese (Mandarin)_Stubborn_Friend",       label: "嘴硬竹马", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072017-x42a4pgimTBDxWpQ.mp3" },
  { id: "Chinese (Mandarin)_Crisp_Girl",            label: "清脆少女", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072017-Jj7rRcIUnwJMrD72.mp3" },
  { id: "Chinese (Mandarin)_Pure-hearted_Boy",      label: "清澈邻家弟弟", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072017-EA7Z2f1Ou5ZOfWNr.mp3" },
  { id: "Chinese (Mandarin)_Soft_Girl",             label: "软软女孩", group: ZH_HD, sample: "https://scene.vidu.zone/media-asset/072017-zIeJmPyeMsvXTMPN.mp3" },

  // ===== 粤语 (59-64) =====
  { id: "Cantonese_ProfessionalHost（F)", label: "粤语 · 专业女主持", group: YUE, sample: "https://scene.vidu.zone/media-asset/072017-ynsFX3cldjtl62xi.mp3" },
  { id: "Cantonese_GentleLady",            label: "粤语 · 温柔女声", group: YUE, sample: "https://scene.vidu.zone/media-asset/072017-IO6fp0FyZe6xaG49.mp3" },
  { id: "Cantonese_ProfessionalHost（M)", label: "粤语 · 专业男主持", group: YUE, sample: "https://scene.vidu.zone/media-asset/072018-otv08JVnkSB0BLJz.mp3" },
  { id: "Cantonese_PlayfulMan",            label: "粤语 · 活泼男声", group: YUE, sample: "https://scene.vidu.zone/media-asset/072018-iaGnbP1ycuobRZ9C.mp3" },
  { id: "Cantonese_CuteGirl",              label: "粤语 · 可爱女孩", group: YUE, sample: "https://scene.vidu.zone/media-asset/072018-qVDF05yOHcXC2gdh.mp3" },
  { id: "Cantonese_KindWoman",             label: "粤语 · 善良女声", group: YUE, sample: "https://scene.vidu.zone/media-asset/072018-8NUCoRQQ6ABIPwJn.mp3" },

  // ===== English (66-80) =====
  { id: "Grinch",                     label: "Grinch", group: EN, sample: "https://scene.vidu.zone/media-asset/071752-jncRxGL1nuONbclk.mp3" },
  { id: "Rudolph",                    label: "Rudolph", group: EN, sample: "https://scene.vidu.zone/media-asset/071752-5FQ6r55BOWg4ZBPf.mp3" },
  { id: "Arnold",                     label: "Arnold", group: EN, sample: "https://scene.vidu.zone/media-asset/071753-AxmKuE7wxlY8zvNn.mp3" },
  { id: "Charming_Santa",             label: "Charming Santa", group: EN, sample: "https://scene.vidu.zone/media-asset/071753-hxdVnrUyH9XaPFoU.mp3" },
  { id: "Charming_Lady",              label: "Charming Lady", group: EN, sample: "https://scene.vidu.zone/media-asset/071753-8K2HCbrry1fMinoe.mp3" },
  { id: "Sweet_Girl",                 label: "Sweet Girl", group: EN, sample: "https://scene.vidu.zone/media-asset/071753-e9wzMCB7DmaEGuhu.mp3" },
  { id: "Cute_Elf",                   label: "Cute Elf", group: EN, sample: "https://scene.vidu.zone/media-asset/071753-DSs6yYFM7nhP3Y73.mp3" },
  { id: "Attractive_Girl",            label: "Attractive Girl", group: EN, sample: "https://scene.vidu.zone/media-asset/071753-bYCPNmnU1xcDQPtr.mp3" },
  { id: "Serene_Woman",               label: "Serene Woman", group: EN, sample: "https://scene.vidu.zone/media-asset/071753-yBDI9GT2weSnwxH0.mp3" },
  { id: "English_Trustworthy_Man",    label: "Trustworthy Man", group: EN, sample: "https://scene.vidu.zone/media-asset/071753-4y46Ju6xokARFbnT.mp3" },
  { id: "English_Graceful_Lady",      label: "Graceful Lady", group: EN, sample: "https://scene.vidu.zone/media-asset/071753-Y6s3YATSib937ns2.mp3" },
  { id: "English_Aussie_Bloke",       label: "Aussie Bloke", group: EN, sample: "https://scene.vidu.zone/media-asset/071754-LZE06DgGPNkTRemt.mp3" },
  { id: "English_Whispering_girl",    label: "Whispering girl", group: EN, sample: "https://scene.vidu.zone/media-asset/071754-x4OKV2I685LLHZlY.mp3" },
  { id: "English_Diligent_Man",       label: "Diligent Man", group: EN, sample: "https://scene.vidu.zone/media-asset/071754-7VPK3SG8FT2Xuwl1.mp3" },
  { id: "English_Gentle-voiced_man",  label: "Gentle-voiced man", group: EN, sample: "https://scene.vidu.zone/media-asset/071754-oWQQfWnzyzVKQRyq.mp3" },

  // ===== 日本語 (81-95) =====
  { id: "Japanese_IntellectualSenior",  label: "Intellectual Senior", group: JA, sample: "https://scene.vidu.zone/media-asset/071603-QRh9iySZHS09EzZp.mp3" },
  { id: "Japanese_DecisivePrincess",    label: "Decisive Princess", group: JA, sample: "https://scene.vidu.zone/media-asset/071603-2toFtXbWBYF4gMrJ.mp3" },
  { id: "Japanese_LoyalKnight",         label: "Loyal Knight", group: JA, sample: "https://scene.vidu.zone/media-asset/071603-4AhKlHBRmVSqzIgT.mp3" },
  { id: "Japanese_DominantMan",         label: "Dominant Man", group: JA, sample: "https://scene.vidu.zone/media-asset/071603-20uK33nB8EFTTBtl.mp3" },
  { id: "Japanese_SeriousCommander",    label: "Serious Commander", group: JA, sample: "https://scene.vidu.zone/media-asset/071603-yqm2eRGX6YN86wSZ.mp3" },
  { id: "Japanese_ColdQueen",           label: "Cold Queen", group: JA, sample: "https://scene.vidu.zone/media-asset/071603-J8Y40ENAYvWDSttc.mp3" },
  { id: "Japanese_DependableWoman",     label: "Dependable Woman", group: JA, sample: "https://scene.vidu.zone/media-asset/071604-C9RsWj5tlZt36OWh.mp3" },
  { id: "Japanese_GentleButler",        label: "Gentle Butler", group: JA, sample: "https://scene.vidu.zone/media-asset/071604-lWhG00rvnTuPPFSo.mp3" },
  { id: "Japanese_KindLady",            label: "Kind Lady", group: JA, sample: "https://scene.vidu.zone/media-asset/071604-5jpras5x3poiOSGk.mp3" },
  { id: "Japanese_CalmLady",            label: "Calm Lady", group: JA, sample: "https://scene.vidu.zone/media-asset/071604-wlDxbRTLNaIEbZ5M.mp3" },
  { id: "Japanese_OptimisticYouth",     label: "Optimistic Youth", group: JA, sample: "https://scene.vidu.zone/media-asset/071604-vUsH8urJGa3tt7D8.mp3" },
  { id: "Japanese_GenerousIzakayaOwner",label: "Generous Izakaya Owner", group: JA, sample: "https://scene.vidu.zone/media-asset/071604-tPEQvxWFuQERuC6Q.mp3" },
  { id: "Japanese_SportyStudent",       label: "Sporty Student", group: JA, sample: "https://scene.vidu.zone/media-asset/071605-IKwSl9VKF9rnf8S8.mp3" },
  { id: "Japanese_InnocentBoy",         label: "Innocent Boy", group: JA, sample: "https://scene.vidu.zone/media-asset/071605-NVkeELYpcAOUr9wD.mp3" },
  { id: "Japanese_GracefulMaiden",      label: "Graceful Maiden", group: JA, sample: "https://scene.vidu.zone/media-asset/071605-laBcWggCCv2p74YR.mp3" },

  // ===== 한국어 (96-144) =====
  { id: "Korean_SweetGirl",                label: "Sweet Girl", group: KO, sample: "https://scene.vidu.zone/media-asset/070800-9UMQFeOvRxi2QjeD.mp3" },
  { id: "Korean_CheerfulBoyfriend",        label: "Cheerful Boyfriend", group: KO, sample: "https://scene.vidu.zone/media-asset/070800-mjtmWUxmCKtJOLj5.mp3" },
  { id: "Korean_EnchantingSister",         label: "Enchanting Sister", group: KO, sample: "https://scene.vidu.zone/media-asset/070800-TuZar4xXGxG8BM7g.mp3" },
  { id: "Korean_ShyGirl",                  label: "Shy Girl", group: KO, sample: "https://scene.vidu.zone/media-asset/070801-SSFgZHI4BKznJvWV.mp3" },
  { id: "Korean_ReliableSister",           label: "Reliable Sister", group: KO, sample: "https://scene.vidu.zone/media-asset/070801-DUF2wBkKhIJvuuU4.mp3" },
  { id: "Korean_StrictBoss",               label: "Strict Boss", group: KO, sample: "https://scene.vidu.zone/media-asset/070801-mGkkZFVCEfEQsOqM.mp3" },
  { id: "Korean_SassyGirl",                label: "Sassy Girl", group: KO, sample: "https://scene.vidu.zone/media-asset/070801-BoJIHHU2CKAlj2wB.mp3" },
  { id: "Korean_ChildhoodFriendGirl",      label: "Childhood Friend Girl", group: KO, sample: "https://scene.vidu.zone/media-asset/070801-eorNHI2o4GX93Fz1.mp3" },
  { id: "Korean_PlayboyCharmer",           label: "Playboy Charmer", group: KO, sample: "https://scene.vidu.zone/media-asset/070801-QzWsVtLtNttkosnn.mp3" },
  { id: "Korean_ElegantPrincess",          label: "Elegant Princess", group: KO, sample: "https://scene.vidu.zone/media-asset/070801-dCGGsWCXUTVj3ctt.mp3" },
  { id: "Korean_BraveFemaleWarrior",       label: "Brave Female Warrior", group: KO, sample: "https://scene.vidu.zone/media-asset/070802-ergTgls4uLTyLOCT.mp3" },
  { id: "Korean_BraveYouth",               label: "Brave Youth", group: KO, sample: "https://scene.vidu.zone/media-asset/070802-R5En7boVtcqlcJRi.mp3" },
  { id: "Korean_CalmLady",                 label: "Calm Lady", group: KO, sample: "https://scene.vidu.zone/media-asset/070802-085EUwwXLvy9nhUa.mp3" },
  { id: "Korean_EnthusiasticTeen",         label: "Enthusiastic Teen", group: KO, sample: "https://scene.vidu.zone/media-asset/070802-VaqXim4fv6IoNk7C.mp3" },
  { id: "Korean_SoothingLady",             label: "Soothing Lady", group: KO, sample: "https://scene.vidu.zone/media-asset/070802-Os0s7Fxt6Rvm09So.mp3" },
  { id: "Korean_IntellectualSenior",       label: "Intellectual Senior", group: KO, sample: "https://scene.vidu.zone/media-asset/070802-njElfn743RgE2jvc.mp3" },
  { id: "Korean_LonelyWarrior",            label: "Lonely Warrior", group: KO, sample: "https://scene.vidu.zone/media-asset/070802-ov9mP4QiJIRENPLu.mp3" },
  { id: "Korean_MatureLady",               label: "Mature Lady", group: KO, sample: "https://scene.vidu.zone/media-asset/070802-yciPEHaaghSBWR7d.mp3" },
  { id: "Korean_InnocentBoy",              label: "Innocent Boy", group: KO, sample: "https://scene.vidu.zone/media-asset/070803-rAjCu3yh29pgal9V.mp3" },
  { id: "Korean_CharmingSister",           label: "Charming Sister", group: KO, sample: "https://scene.vidu.zone/media-asset/070803-LCF6CkbDlPSKVW14.mp3" },
  { id: "Korean_AthleticStudent",          label: "Athletic Student", group: KO, sample: "https://scene.vidu.zone/media-asset/070803-XWYLsx3kwiZ3b9sS.mp3" },
  { id: "Korean_BraveAdventurer",          label: "Brave Adventurer", group: KO, sample: "https://scene.vidu.zone/media-asset/070803-U1hIhDdUyQpqoZpr.mp3" },
  { id: "Korean_CalmGentleman",            label: "Calm Gentleman", group: KO, sample: "https://scene.vidu.zone/media-asset/070803-P5NbTLP8jrcp9LDN.mp3" },
  { id: "Korean_WiseElf",                  label: "Wise Elf", group: KO, sample: "https://scene.vidu.zone/media-asset/070803-E9GisuGpHGPN2b6b.mp3" },
  { id: "Korean_CheerfulCoolJunior",       label: "Cheerful Cool Junior", group: KO, sample: "https://scene.vidu.zone/media-asset/070803-AdzPeNndz7mVhLhQ.mp3" },
  { id: "Korean_DecisiveQueen",            label: "Decisive Queen", group: KO, sample: "https://scene.vidu.zone/media-asset/070803-FVdlsrLJZEHtXZ17.mp3" },
  { id: "Korean_ColdYoungMan",             label: "Cold Young Man", group: KO, sample: "https://scene.vidu.zone/media-asset/070803-vocQv7J6ArLjp0TE.mp3" },
  { id: "Korean_MysteriousGirl",           label: "Mysterious Girl", group: KO, sample: "https://scene.vidu.zone/media-asset/070804-B8HBEX6r1e6e46kN.mp3" },
  { id: "Korean_QuirkyGirl",               label: "Quirky Girl", group: KO, sample: "https://scene.vidu.zone/media-asset/070804-54tAQsQkilJYlj5P.mp3" },
  { id: "Korean_ConsiderateSenior",        label: "Considerate Senior", group: KO, sample: "https://scene.vidu.zone/media-asset/070804-CDvdlovW4I47sCOL.mp3" },
  { id: "Korean_CheerfulLittleSister",     label: "Cheerful Little Sister", group: KO, sample: "https://scene.vidu.zone/media-asset/070804-hghwpVvHn2vYHNWO.mp3" },
  { id: "Korean_DominantMan",              label: "Dominant Man", group: KO, sample: "https://scene.vidu.zone/media-asset/070804-yguQNBsKsSBMPam6.mp3" },
  { id: "Korean_AirheadedGirl",            label: "Airheaded Girl", group: KO, sample: "https://scene.vidu.zone/media-asset/070804-ELTyvSCKZEjYl3s0.mp3" },
  { id: "Korean_ReliableYouth",            label: "Reliable Youth", group: KO, sample: "https://scene.vidu.zone/media-asset/070805-FiWsHtV4TP7dzuvz.mp3" },
  { id: "Korean_FriendlyBigSister",        label: "Friendly Big Sister", group: KO, sample: "https://scene.vidu.zone/media-asset/070805-V5evipalTiDD9nvH.mp3" },
  { id: "Korean_GentleBoss",               label: "Gentle Boss", group: KO, sample: "https://scene.vidu.zone/media-asset/070805-kGckiiwRRzgO3RVA.mp3" },
  { id: "Korean_ColdGirl",                 label: "Cold Girl", group: KO, sample: "https://scene.vidu.zone/media-asset/070805-9ZjegsY9vM93LevN.mp3" },
  { id: "Korean_HaughtyLady",              label: "Haughty Lady", group: KO, sample: "https://scene.vidu.zone/media-asset/070805-NwKD9mhTxLaLx5D9.mp3" },
  { id: "Korean_CharmingElderSister",      label: "Charming Elder Sister", group: KO, sample: "https://scene.vidu.zone/media-asset/070805-sj7vyOyPyVWBGwbU.mp3" },
  { id: "Korean_IntellectualMan",          label: "Intellectual Man", group: KO, sample: "https://scene.vidu.zone/media-asset/070805-HrwswOtNNHbf1WSL.mp3" },
  { id: "Korean_CaringWoman",              label: "Caring Woman", group: KO, sample: "https://scene.vidu.zone/media-asset/070805-9feq1GPW2I8TDjvf.mp3" },
  { id: "Korean_WiseTeacher",              label: "Wise Teacher", group: KO, sample: "https://scene.vidu.zone/media-asset/070805-V18z7I9BacTBWmdr.mp3" },
  { id: "Korean_ConfidentBoss",            label: "Confident Boss", group: KO, sample: "https://scene.vidu.zone/media-asset/070806-QdCZt0Y6POMi00De.mp3" },
  { id: "Korean_AthleticGirl",             label: "Athletic Girl", group: KO, sample: "https://scene.vidu.zone/media-asset/070806-eH1gvEUmehqm6KAd.mp3" },
  { id: "Korean_PossessiveMan",            label: "Possessive Man", group: KO, sample: "https://scene.vidu.zone/media-asset/070806-F8xofvm8HZfePrc4.mp3" },
  { id: "Korean_GentleWoman",              label: "Gentle Woman", group: KO, sample: "https://scene.vidu.zone/media-asset/070806-0PwqHf6TTcXHpgTk.mp3" },
  { id: "Korean_CockyGuy",                 label: "Cocky Guy", group: KO, sample: "https://scene.vidu.zone/media-asset/070806-MA182ManXRurk827.mp3" },
  { id: "Korean_ThoughtfulWoman",          label: "Thoughtful Woman", group: KO, sample: "https://scene.vidu.zone/media-asset/070806-ln9rt4eTeJtp8zUc.mp3" },
  { id: "Korean_OptimisticYouth",          label: "Optimistic Youth", group: KO, sample: "https://scene.vidu.zone/media-asset/070806-4tX7Kfu8PnSWJAzM.mp3" },

  // ===== Español (145-191) =====
  { id: "Spanish_SereneWoman",             label: "Serene Woman", group: ES, sample: "https://scene.vidu.zone/media-asset/070348-UoReuAOn6CTUdFKy.mp3" },
  { id: "Spanish_MaturePartner",           label: "Mature Partner", group: ES, sample: "https://scene.vidu.zone/media-asset/070348-7WnSyhf1GhpCsoMw.mp3" },
  { id: "Spanish_CaptivatingStoryteller",  label: "Captivating Storyteller", group: ES, sample: "https://scene.vidu.zone/media-asset/070348-PGyDV29JR9dJ2VgT.mp3" },
  { id: "Spanish_Narrator",                label: "Narrator", group: ES, sample: "https://scene.vidu.zone/media-asset/070349-PRZutZ6UeOPHCSYG.mp3" },
  { id: "Spanish_WiseScholar",             label: "Wise Scholar", group: ES, sample: "https://scene.vidu.zone/media-asset/070349-gybZkG82B0KOjBsI.mp3" },
  { id: "Spanish_Kind-heartedGirl",        label: "Kind-hearted Girl", group: ES, sample: "https://scene.vidu.zone/media-asset/070349-bYiRLGRYXNE1rk6W.mp3" },
  { id: "Spanish_DeterminedManager",       label: "Determined Manager", group: ES, sample: "https://scene.vidu.zone/media-asset/070349-7gi92LMSHEzsX9Kj.mp3" },
  { id: "Spanish_BossyLeader",             label: "Bossy Leader", group: ES, sample: "https://scene.vidu.zone/media-asset/070349-4NnLw9Fb47nBWTHl.mp3" },
  { id: "Spanish_ReservedYoungMan",        label: "Reserved Young Man", group: ES, sample: "https://scene.vidu.zone/media-asset/070349-YKV7CZOpLJ9k6SLc.mp3" },
  { id: "Spanish_ConfidentWoman",          label: "Confident Woman", group: ES, sample: "https://scene.vidu.zone/media-asset/070349-Sc11mXoLeuzpZclC.mp3" },
  { id: "Spanish_ThoughtfulMan",           label: "Thoughtful Man", group: ES, sample: "https://scene.vidu.zone/media-asset/070349-fVT2wAMyiFAAb6y6.mp3" },
  { id: "Spanish_Strong-WilledBoy",        label: "Strong-willed Boy", group: ES, sample: "https://scene.vidu.zone/media-asset/070350-A7rCZfmbP6pdrDnR.mp3" },
  { id: "Spanish_SophisticatedLady",       label: "Sophisticated Lady", group: ES, sample: "https://scene.vidu.zone/media-asset/070350-a2rPvecdnw2Iw60m.mp3" },
  { id: "Spanish_RationalMan",             label: "Rational Man", group: ES, sample: "https://scene.vidu.zone/media-asset/070350-SqRmKH5xSvmRiFnu.mp3" },
  { id: "Spanish_AnimeCharacter",          label: "Anime Character", group: ES, sample: "https://scene.vidu.zone/media-asset/070350-I7IpRZADL89QmNr4.mp3" },
  { id: "Spanish_Deep-tonedMan",           label: "Deep-toned Man", group: ES, sample: "https://scene.vidu.zone/media-asset/070350-JwMDuPnqCNNW5IBh.mp3" },
  { id: "Spanish_Fussyhostess",            label: "Fussy hostess", group: ES, sample: "https://scene.vidu.zone/media-asset/070350-IGuZpp48aM8yY2Q1.mp3" },
  { id: "Spanish_SincereTeen",             label: "Sincere Teen", group: ES, sample: "https://scene.vidu.zone/media-asset/070350-Zx4RHy7L8MXfeaO3.mp3" },
  { id: "Spanish_FrankLady",               label: "Frank Lady", group: ES, sample: "https://scene.vidu.zone/media-asset/070351-a8bCoh4IPbRuCM5t.mp3" },
  { id: "Spanish_Comedian",                label: "Comedian", group: ES, sample: "https://scene.vidu.zone/media-asset/070351-kGXsC7vw2Adroyb0.mp3" },
  { id: "Spanish_Debator",                 label: "Debator", group: ES, sample: "https://scene.vidu.zone/media-asset/070351-PS3VY7ripY9uOCZS.mp3" },
  { id: "Spanish_ToughBoss",               label: "Tough Boss", group: ES, sample: "https://scene.vidu.zone/media-asset/070351-oFFfNws2IzDsB3mN.mp3" },
  { id: "Spanish_Wiselady",                label: "Wise Lady", group: ES, sample: "https://scene.vidu.zone/media-asset/070351-rsBnYfrjJEdtwIO0.mp3" },
  { id: "Spanish_Steadymentor",            label: "Steady Mentor", group: ES, sample: "https://scene.vidu.zone/media-asset/070351-E07E5IJbNT2BpU7i.mp3" },
  { id: "Spanish_Jovialman",               label: "Jovial Man", group: ES, sample: "https://scene.vidu.zone/media-asset/070351-agsQVyTWeHc8sg2m.mp3" },
  { id: "Spanish_SantaClaus",              label: "Santa Claus", group: ES, sample: "https://scene.vidu.zone/media-asset/070351-q2Aip3axlveDRoT6.mp3" },
  { id: "Spanish_Rudolph",                 label: "Rudolph", group: ES, sample: "https://scene.vidu.zone/media-asset/070351-3sar9F7Mzmb9HxsB.mp3" },
  { id: "Spanish_Intonategirl",            label: "Intonate Girl", group: ES, sample: "https://scene.vidu.zone/media-asset/070352-T7spxLWURyEpAXBU.mp3" },
  { id: "Spanish_Arnold",                  label: "Arnold", group: ES, sample: "https://scene.vidu.zone/media-asset/070352-s0BE4PMDHdgFM6B7.mp3" },
  { id: "Spanish_Ghost",                   label: "Ghost", group: ES, sample: "https://scene.vidu.zone/media-asset/070352-EFd8ZbN5bkFQLFZD.mp3" },
  { id: "Spanish_HumorousElder",           label: "Humorous Elder", group: ES, sample: "https://scene.vidu.zone/media-asset/070352-doZ3HajXy0fVStme.mp3" },
  { id: "Spanish_EnergeticBoy",            label: "Energetic Boy", group: ES, sample: "https://scene.vidu.zone/media-asset/070352-dXiikyTM3I1PETQJ.mp3" },
  { id: "Spanish_WhimsicalGirl",           label: "Whimsical Girl", group: ES, sample: "https://scene.vidu.zone/media-asset/070352-DlLwt9TbRy8FyJmt.mp3" },
  { id: "Spanish_StrictBoss",              label: "Strict Boss", group: ES, sample: "https://scene.vidu.zone/media-asset/070352-YGHLV8bEitcCbrVs.mp3" },
  { id: "Spanish_ReliableMan",             label: "Reliable Man", group: ES, sample: "https://scene.vidu.zone/media-asset/070352-2qTxwDoZM5Lfgl8q.mp3" },
  { id: "Spanish_SereneElder",             label: "Serene Elder", group: ES, sample: "https://scene.vidu.zone/media-asset/070352-sPdXlPqdTJ0vbUgl.mp3" },
  { id: "Spanish_AngryMan",                label: "Angry Man", group: ES, sample: "https://scene.vidu.zone/media-asset/070353-wMFRpWf3HJtM1UFj.mp3" },
  { id: "Spanish_AssertiveQueen",          label: "Assertive Queen", group: ES, sample: "https://scene.vidu.zone/media-asset/070353-SOB6ejA1vbx9Ew2p.mp3" },
  { id: "Spanish_CaringGirlfriend",        label: "Caring Girlfriend", group: ES, sample: "https://scene.vidu.zone/media-asset/070353-z24jAExWjbtgZLeB.mp3" },
  { id: "Spanish_PowerfulSoldier",         label: "Powerful Soldier", group: ES, sample: "https://scene.vidu.zone/media-asset/070353-l6f5Aclawcu2Rc2f.mp3" },
  { id: "Spanish_PassionateWarrior",       label: "Passionate Warrior", group: ES, sample: "https://scene.vidu.zone/media-asset/070353-9tKsw355jAMoch00.mp3" },
  { id: "Spanish_ChattyGirl",              label: "Chatty Girl", group: ES, sample: "https://scene.vidu.zone/media-asset/070353-8s7xO5eZuODxqnVp.mp3" },
  { id: "Spanish_RomanticHusband",         label: "Romantic Husband", group: ES, sample: "https://scene.vidu.zone/media-asset/070353-97u2UFJuOzP9KuZ5.mp3" },
  { id: "Spanish_CompellingGirl",          label: "Compelling Girl", group: ES, sample: "https://scene.vidu.zone/media-asset/070353-jFRPs3IACR6s98FO.mp3" },
  { id: "Spanish_PowerfulVeteran",         label: "Powerful Veteran", group: ES, sample: "https://scene.vidu.zone/media-asset/070353-qTcs6fwjkUCkWoeg.mp3" },
  { id: "Spanish_SensibleManager",         label: "Sensible Manager", group: ES, sample: "https://scene.vidu.zone/media-asset/070354-gnAWCgi02ly0jK1a.mp3" },
  { id: "Spanish_ThoughtfulLady",          label: "Thoughtful Lady", group: ES, sample: "https://scene.vidu.zone/media-asset/070354-Cog8TJzC2MmtLFub.mp3" },

  // ===== Português (192-264) =====
  { id: "Portuguese_SentimentalLady",       label: "Sentimental Lady", group: PT, sample: "https://scene.vidu.zone/media-asset/035852-YlDdiriZ28E7YPD3.mp3" },
  { id: "Portuguese_BossyLeader",           label: "Bossy Leader", group: PT, sample: "https://scene.vidu.zone/media-asset/035852-HoggtsELGRNc3GE8.mp3" },
  { id: "Portuguese_Wiselady",              label: "Wise lady", group: PT, sample: "https://scene.vidu.zone/media-asset/035852-kFdHiHIUzA4DqmkY.mp3" },
  { id: "Portuguese_Strong-WilledBoy",      label: "Strong-willed Boy", group: PT, sample: "https://scene.vidu.zone/media-asset/035854-FQnA7navsy0NEpPH.mp3" },
  { id: "Portuguese_Deep-VoicedGentleman",  label: "Deep-voiced Gentleman", group: PT, sample: "https://scene.vidu.zone/media-asset/035853-wJtnnAnKT6HUGhDq.mp3" },
  { id: "Portuguese_UpsetGirl",             label: "Upset Girl", group: PT, sample: "https://scene.vidu.zone/media-asset/035853-jBFprcgHgXk3KHJ0.mp3" },
  { id: "Portuguese_PassionateWarrior",     label: "Passionate Warrior", group: PT, sample: "https://scene.vidu.zone/media-asset/035854-rMppnUCpkVnOLyS7.mp3" },
  { id: "Portuguese_AnimeCharacter",        label: "Anime Character", group: PT, sample: "https://scene.vidu.zone/media-asset/035854-n3daCwqnRBEvicdE.mp3" },
  { id: "Portuguese_ConfidentWoman",        label: "Confident Woman", group: PT, sample: "https://scene.vidu.zone/media-asset/035854-tfBs4WaHLxMrxpgY.mp3" },
  { id: "Portuguese_AngryMan",              label: "Angry Man", group: PT, sample: "https://scene.vidu.zone/media-asset/035855-awE9rIRE6CCX7cr3.mp3" },
  { id: "Portuguese_CaptivatingStoryteller",label: "Captivating Storyteller", group: PT, sample: "https://scene.vidu.zone/media-asset/035855-veYMckFU2ePNhhed.mp3" },
  { id: "Portuguese_Godfather",             label: "Godfather", group: PT, sample: "https://scene.vidu.zone/media-asset/035855-FMP1Um96WiGR5XPi.mp3" },
  { id: "Portuguese_ReservedYoungMan",      label: "Reserved Young Man", group: PT, sample: "https://scene.vidu.zone/media-asset/035855-oQnIXx9ucDlTxRFp.mp3" },
  { id: "Portuguese_SmartYoungGirl",        label: "Smart Young Girl", group: PT, sample: "https://scene.vidu.zone/media-asset/035855-5h9TxVIUy8yq7ulL.mp3" },
  { id: "Portuguese_Kind-heartedGirl",      label: "Kind-hearted Girl", group: PT, sample: "https://scene.vidu.zone/media-asset/035855-xgWXj5fvfJMFlfcD.mp3" },
  { id: "Portuguese_Pompouslady",           label: "Pompous lady", group: PT, sample: "https://scene.vidu.zone/media-asset/035856-BSaHTj6rKm5fjzkx.mp3" },
  { id: "Portuguese_Grinch",                label: "Grinch", group: PT, sample: "https://scene.vidu.zone/media-asset/035856-iovsMZhW6bIdcOyl.mp3" },
  { id: "Portuguese_Debator",               label: "Debator", group: PT, sample: "https://scene.vidu.zone/media-asset/035856-wLQkVaEn4ltFKwfY.mp3" },
  { id: "Portuguese_SweetGirl",             label: "Sweet Girl", group: PT, sample: "https://scene.vidu.zone/media-asset/035856-XwSlnuwIu8ShiEeh.mp3" },
  { id: "Portuguese_AttractiveGirl",        label: "Attractive Girl", group: PT, sample: "https://scene.vidu.zone/media-asset/035856-R4vQmWuBLAgdKhWk.mp3" },
  { id: "Portuguese_ThoughtfulMan",         label: "Thoughtful Man", group: PT, sample: "https://scene.vidu.zone/media-asset/035856-RudMXh4sUyusfVtR.mp3" },
  { id: "Portuguese_PlayfulGirl",           label: "Playful Girl", group: PT, sample: "https://scene.vidu.zone/media-asset/035857-qUC9mEQIQwjkypXB.mp3" },
  { id: "Portuguese_GorgeousLady",          label: "Gorgeous Lady", group: PT, sample: "https://scene.vidu.zone/media-asset/035857-YumK9obwueApttqM.mp3" },
  { id: "Portuguese_LovelyLady",            label: "Lovely Lady", group: PT, sample: "https://scene.vidu.zone/media-asset/035857-LjaJCiavoulZ8qMp.mp3" },
  { id: "Portuguese_SereneWoman",           label: "Serene Woman", group: PT, sample: "https://scene.vidu.zone/media-asset/035857-Ofwsa1H50twRBl65.mp3" },
  { id: "Portuguese_SadTeen",               label: "Sad Teen", group: PT, sample: "https://scene.vidu.zone/media-asset/035857-qTI9KBW9aZguBPmg.mp3" },
  { id: "Portuguese_MaturePartner",         label: "Mature Partner", group: PT, sample: "https://scene.vidu.zone/media-asset/035857-TRbIdcLHSjdPrDm4.mp3" },
  { id: "Portuguese_Comedian",              label: "Comedian", group: PT, sample: "https://scene.vidu.zone/media-asset/035858-v9S79XJMHYC5AMVn.mp3" },
  { id: "Portuguese_NaughtySchoolgirl",     label: "Naughty Schoolgirl", group: PT, sample: "https://scene.vidu.zone/media-asset/035857-Zw6CdhgQdMVR2gn6.mp3" },
  { id: "Portuguese_Narrator",              label: "Narrator", group: PT, sample: "https://scene.vidu.zone/media-asset/035858-nZazjRA8D6itSIQa.mp3" },
  { id: "Portuguese_ToughBoss",             label: "Tough Boss", group: PT, sample: "https://scene.vidu.zone/media-asset/035858-DnCcxoFUSoy9kFWO.mp3" },
  { id: "Portuguese_Fussyhostess",          label: "Fussy hostess", group: PT, sample: "https://scene.vidu.zone/media-asset/035858-ytmj6ARG8wJY0zgU.mp3" },
  { id: "Portuguese_Dramatist",             label: "Dramatist", group: PT, sample: "https://scene.vidu.zone/media-asset/035858-xrZyimVJqko3sCMl.mp3" },
  { id: "Portuguese_Steadymentor",          label: "Steady Mentor", group: PT, sample: "https://scene.vidu.zone/media-asset/035859-1OYHXRajjtcdGHnt.mp3" },
  { id: "Portuguese_Jovialman",             label: "Jovial Man", group: PT, sample: "https://scene.vidu.zone/media-asset/035859-UAXsPyxBdOfwQBYu.mp3" },
  { id: "Portuguese_CharmingQueen",         label: "Charming Queen", group: PT, sample: "https://scene.vidu.zone/media-asset/035858-jL86FYAsVrayEr3t.mp3" },
  { id: "Portuguese_SantaClaus",            label: "Santa Claus", group: PT, sample: "https://scene.vidu.zone/media-asset/035859-RH6FvmBORiishhBp.mp3" },
  { id: "Portuguese_Rudolph",               label: "Rudolph", group: PT, sample: "https://scene.vidu.zone/media-asset/035859-AjmtEs1i35CNeNtP.mp3" },
  { id: "Portuguese_Arnold",                label: "Arnold", group: PT, sample: "https://scene.vidu.zone/media-asset/035859-oqiwsebuANXiPWzY.mp3" },
  { id: "Portuguese_CharmingSanta",         label: "Charming Santa", group: PT, sample: "https://scene.vidu.zone/media-asset/035900-3XWbqpa4vfztTO4E.mp3" },
  { id: "Portuguese_CharmingLady",          label: "Charming Lady", group: PT, sample: "https://scene.vidu.zone/media-asset/035859-hutvd6TgGMsoPs52.mp3" },
  { id: "Portuguese_Ghost",                 label: "Ghost", group: PT, sample: "https://scene.vidu.zone/media-asset/035900-9xZwPXOCa4T7pQdn.mp3" },
  { id: "Portuguese_HumorousElder",         label: "Humorous Elder", group: PT, sample: "https://scene.vidu.zone/media-asset/035900-XkTYRMZgfW4kqUwF.mp3" },
  { id: "Portuguese_CalmLeader",            label: "Calm Leader", group: PT, sample: "https://scene.vidu.zone/media-asset/035900-yo1DNh5FHmfaLJ8I.mp3" },
  { id: "Portuguese_GentleTeacher",         label: "Gentle Teacher", group: PT, sample: "https://scene.vidu.zone/media-asset/035900-T3S61GdfYo3HexD0.mp3" },
  { id: "Portuguese_EnergeticBoy",          label: "Energetic Boy", group: PT, sample: "https://scene.vidu.zone/media-asset/035900-oFr6TDZwXmmO7v2A.mp3" },
  { id: "Portuguese_ReliableMan",           label: "Reliable Man", group: PT, sample: "https://scene.vidu.zone/media-asset/035900-mOO06UtkR3L3Z5sk.mp3" },
  { id: "Portuguese_SereneElder",           label: "Serene Elder", group: PT, sample: "https://scene.vidu.zone/media-asset/035900-N32UA3kyBBsGOSyF.mp3" },
  { id: "Portuguese_GrimReaper",            label: "Grim Reaper", group: PT, sample: "https://scene.vidu.zone/media-asset/035901-z8oylmGNYspuGGqJ.mp3" },
  { id: "Portuguese_AssertiveQueen",        label: "Assertive Queen", group: PT, sample: "https://scene.vidu.zone/media-asset/035901-f2hIpqsJUw0QAUQ8.mp3" },
  { id: "Portuguese_WhimsicalGirl",         label: "Whimsical Girl", group: PT, sample: "https://scene.vidu.zone/media-asset/035901-5OphYxHPDfwnb9dn.mp3" },
  { id: "Portuguese_StressedLady",          label: "Stressed Lady", group: PT, sample: "https://scene.vidu.zone/media-asset/035901-uWpA9FlhEmvgR2JN.mp3" },
  { id: "Portuguese_FriendlyNeighbor",      label: "Friendly Neighbor", group: PT, sample: "https://scene.vidu.zone/media-asset/035901-q7DRgysg08msA6jz.mp3" },
  { id: "Portuguese_CaringGirlfriend",      label: "Caring Girlfriend", group: PT, sample: "https://scene.vidu.zone/media-asset/035901-dYYDcfRCYqaAavGB.mp3" },
  { id: "Portuguese_PowerfulSoldier",       label: "Powerful Soldier", group: PT, sample: "https://scene.vidu.zone/media-asset/035902-xvV50q5t9Si9yhz2.mp3" },
  { id: "Portuguese_FascinatingBoy",        label: "Fascinating Boy", group: PT, sample: "https://scene.vidu.zone/media-asset/035902-HbIyHyv73BjwzX1d.mp3" },
  { id: "Portuguese_RomanticHusband",       label: "Romantic Husband", group: PT, sample: "https://scene.vidu.zone/media-asset/035902-OnCTfG9JOtNWtvpz.mp3" },
  { id: "Portuguese_StrictBoss",            label: "Strict Boss", group: PT, sample: "https://scene.vidu.zone/media-asset/035902-Z8rwVTZrF8aOQqhm.mp3" },
  { id: "Portuguese_InspiringLady",         label: "Inspiring Lady", group: PT, sample: "https://scene.vidu.zone/media-asset/035902-Dq43ofPynPKCWcDV.mp3" },
  { id: "Portuguese_PlayfulSpirit",         label: "Playful Spirit", group: PT, sample: "https://scene.vidu.zone/media-asset/035902-MBnqocwWFe2h7jiZ.mp3" },
  { id: "Portuguese_ElegantGirl",           label: "Elegant Girl", group: PT, sample: "https://scene.vidu.zone/media-asset/035902-vYnTwbBn3YUA5HWB.mp3" },
  { id: "Portuguese_CompellingGirl",        label: "Compelling Girl", group: PT, sample: "https://scene.vidu.zone/media-asset/035902-pMFk9vEGzSahc8oD.mp3" },
  { id: "Portuguese_PowerfulVeteran",       label: "Powerful Veteran", group: PT, sample: "https://scene.vidu.zone/media-asset/035902-XRyXNCeGd69A6DTh.mp3" },
  { id: "Portuguese_SensibleManager",       label: "Sensible Manager", group: PT, sample: "https://scene.vidu.zone/media-asset/035903-J4MWHZ4NdSpD0MSV.mp3" },
  { id: "Portuguese_ThoughtfulLady",        label: "Thoughtful Lady", group: PT, sample: "https://scene.vidu.zone/media-asset/035903-l7SdRhUPCnKkE37N.mp3" },
  { id: "Portuguese_TheatricalActor",       label: "Theatrical Actor", group: PT, sample: "https://scene.vidu.zone/media-asset/035903-5h7YzW7aBEEZjEyG.mp3" },
  { id: "Portuguese_FragileBoy",            label: "Fragile Boy", group: PT, sample: "https://scene.vidu.zone/media-asset/035903-444V6STPDnIA8rlC.mp3" },
  { id: "Portuguese_ChattyGirl",            label: "Chatty Girl", group: PT, sample: "https://scene.vidu.zone/media-asset/035903-KlRb6Hac52sRZpia.mp3" },
  { id: "Portuguese_Conscientiousinstructor", label: "Conscientious Instructor", group: PT, sample: "https://scene.vidu.zone/media-asset/035903-1qJIzbA1njepzwb0.mp3" },
  { id: "Portuguese_RationalMan",           label: "Rational Man", group: PT, sample: "https://scene.vidu.zone/media-asset/035904-6tXudawKmYULpkMH.mp3" },
  { id: "Portuguese_WiseScholar",           label: "Wise Scholar", group: PT, sample: "https://scene.vidu.zone/media-asset/035904-m9OqbjpCSb1ptKNX.mp3" },
  { id: "Portuguese_FrankLady",             label: "Frank Lady", group: PT, sample: "https://scene.vidu.zone/media-asset/035904-nkMHVAax7JlOaSXK.mp3" },
  { id: "Portuguese_DeterminedManager",     label: "Determined Manager", group: PT, sample: "https://scene.vidu.zone/media-asset/035904-GeDXhMqAPWrLCtUO.mp3" },

  // ===== Français (265-270) =====
  { id: "French_Male_Speech_New",      label: "Level-Headed Man", group: FR, sample: "https://scene.vidu.zone/media-asset/035756-rxEBofqGwhif5qng.mp3" },
  { id: "French_Female_News Anchor",   label: "Patient Female Presenter", group: FR, sample: "https://scene.vidu.zone/media-asset/035756-yh2jpcYujGATdrnL.mp3" },
  { id: "French_CasualMan",            label: "Casual Man", group: FR, sample: "https://scene.vidu.zone/media-asset/035756-UsNNaEJULdSii82b.mp3" },
  { id: "French_MovieLeadFemale",      label: "Movie Lead Female", group: FR, sample: "https://scene.vidu.zone/media-asset/035756-o2mEO0ijNHbHGRwy.mp3" },
  { id: "French_FemaleAnchor",         label: "Female Anchor", group: FR, sample: "https://scene.vidu.zone/media-asset/035756-0WMICpjG4qdi5xhp.mp3" },
  { id: "French_MaleNarrator",         label: "Male Narrator", group: FR, sample: "https://scene.vidu.zone/media-asset/035756-Lhz9XAfklUL4yrLr.mp3" },

  // ===== Indonesia (271-279) =====
  { id: "Indonesian_SweetGirl",         label: "Sweet Girl", group: ID, sample: "https://scene.vidu.zone/media-asset/035653-j1Y3keTo6DShfEzD.mp3" },
  { id: "Indonesian_ReservedYoungMan",  label: "Reserved Young Man", group: ID, sample: "https://scene.vidu.zone/media-asset/035653-ohNuxDbeZc6uTtoU.mp3" },
  { id: "Indonesian_CharmingGirl",      label: "Charming Girl", group: ID, sample: "https://scene.vidu.zone/media-asset/035653-ZIwlswQLA9qmTdU7.mp3" },
  { id: "Indonesian_CalmWoman",         label: "Calm Woman", group: ID, sample: "https://scene.vidu.zone/media-asset/035653-oweTzCEudUlPnAFI.mp3" },
  { id: "Indonesian_ConfidentWoman",    label: "Confident Woman", group: ID, sample: "https://scene.vidu.zone/media-asset/035653-czxnaGSlJ3ZWFDQV.mp3" },
  { id: "Indonesian_CaringMan",         label: "Caring Man", group: ID, sample: "https://scene.vidu.zone/media-asset/035653-5IfsR8TbYoQChgKz.mp3" },
  { id: "Indonesian_BossyLeader",       label: "Bossy Leader", group: ID, sample: "https://scene.vidu.zone/media-asset/035654-co5jmEYbQtFRmUqM.mp3" },
  { id: "Indonesian_DeterminedBoy",     label: "Determined Boy", group: ID, sample: "https://scene.vidu.zone/media-asset/035654-zBp6jTlUpfPPuU0G.mp3" },
  { id: "Indonesian_GentleGirl",        label: "Gentle Girl", group: ID, sample: "https://scene.vidu.zone/media-asset/035654-IdUBETC49ObxAB4G.mp3" },

  // ===== Deutsch (280-282) =====
  { id: "German_FriendlyMan",  label: "Friendly Man", group: DE, sample: "https://scene.vidu.zone/media-asset/035621-aCq5cdqQW43pB8ct.mp3" },
  { id: "German_SweetLady",    label: "Sweet Lady",   group: DE, sample: "https://scene.vidu.zone/media-asset/035621-LuolmiKVVesy5hTY.mp3" },
  { id: "German_PlayfulMan",   label: "Playful Man",  group: DE, sample: "https://scene.vidu.zone/media-asset/035621-E4Ucg8YwiueVTepF.mp3" },

  // ===== Русский (283-290) =====
  { id: "Russian_HandsomeChildhoodFriend", label: "Handsome Childhood Friend", group: RU, sample: "https://scene.vidu.zone/media-asset/035504-F9VKfKDNyrUjIDXp.mp3" },
  { id: "Russian_BrightHeroine",           label: "Bright Queen", group: RU, sample: "https://scene.vidu.zone/media-asset/035504-rz3mB6An408J7O87.mp3" },
  { id: "Russian_AmbitiousWoman",          label: "Ambitious Woman", group: RU, sample: "https://scene.vidu.zone/media-asset/035504-UacsdEy0A4ftk3Cv.mp3" },
  { id: "Russian_ReliableMan",             label: "Reliable Man", group: RU, sample: "https://scene.vidu.zone/media-asset/035505-DyEhHRWGSCmoD7sy.mp3" },
  { id: "Russian_CrazyQueen",              label: "Crazy Girl", group: RU, sample: "https://scene.vidu.zone/media-asset/035505-FIDsbXD0MlA24Fqd.mp3" },
  { id: "Russian_PessimisticGirl",         label: "Pessimistic Girl", group: RU, sample: "https://scene.vidu.zone/media-asset/035505-NbPMW7x5dIOFqoFw.mp3" },
  { id: "Russian_AttractiveGuy",           label: "Attractive Guy", group: RU, sample: "https://scene.vidu.zone/media-asset/035506-XHTn8GohW6Xanqcd.mp3" },
  { id: "Russian_Bad-temperedBoy",         label: "Bad-tempered Boy", group: RU, sample: "https://scene.vidu.zone/media-asset/035506-JZ8O4tOrI74ttkS1.mp3" },

  // ===== Italiano (291-294) =====
  { id: "Italian_BraveHeroine",       label: "Brave Heroine", group: IT, sample: "https://scene.vidu.zone/media-asset/035417-4BRNfRUWeCEqi1OV.mp3" },
  { id: "Italian_Narrator",           label: "Narrator", group: IT, sample: "https://scene.vidu.zone/media-asset/035417-efHRj1jLnPYICek8.mp3" },
  { id: "Italian_WanderingSorcerer",  label: "Wandering Sorcerer", group: IT, sample: "https://scene.vidu.zone/media-asset/035417-eFDy6VsgM4XQrW6A.mp3" },
  { id: "Italian_DiligentLeader",     label: "Diligent Leader", group: IT, sample: "https://scene.vidu.zone/media-asset/035417-BFDEwSWARMORQEpt.mp3" },

  // ===== العربية (295-296) =====
  { id: "Arabic_CalmWoman",   label: "Calm Woman", group: AR, sample: "https://scene.vidu.zone/media-asset/035240-u12liEq8DtchndBf.mp3" },
  { id: "Arabic_FriendlyGuy", label: "Friendly Guy", group: AR, sample: "https://scene.vidu.zone/media-asset/035240-QHVeX8jxCAHCOM1x.mp3" },

  // ===== Türkçe (297-298) =====
  { id: "Turkish_CalmWoman",     label: "Calm Woman", group: TR, sample: "https://scene.vidu.zone/media-asset/035209-qy1MxzMRbLQPEx5f.mp3" },
  { id: "Turkish_Trustworthyman",label: "Trustworthy Man", group: TR, sample: "https://scene.vidu.zone/media-asset/035209-Md7ztqRkrvs3mXJH.mp3" },

  // ===== Українська (299-300) =====
  { id: "Ukrainian_CalmWoman",   label: "Calm Woman", group: UK, sample: "https://scene.vidu.zone/media-asset/034930-ELzwPhKz4Q3UiOyA.mp3" },
  { id: "Ukrainian_WiseScholar", label: "Wise Scholar", group: UK, sample: "https://scene.vidu.zone/media-asset/034930-STPANqlkjzZwA87W.mp3" },

  // ===== Nederlands (301-302) =====
  { id: "Dutch_kindhearted_girl", label: "Kind-hearted girl", group: NL, sample: "https://scene.vidu.zone/media-asset/034802-8UbeAa4QGbB6JaZx.mp3" },
  { id: "Dutch_bossy_leader",     label: "Bossy leader",      group: NL, sample: "https://scene.vidu.zone/media-asset/034802-5PctlXu118SHucvd.mp3" },

  // ===== Tiếng Việt (303) =====
  { id: "Vietnamese_kindhearted_girl", label: "Kind-hearted girl", group: VI, sample: "https://scene.vidu.zone/media-asset/034727-vLCYIZiGCweFE3TC.mp3" },
];
/* eslint-enable max-len */
