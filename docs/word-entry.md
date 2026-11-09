# 词条字段与 DeepSeek 生成规则

小单词机的词库条目统一经过 `normalizeWord(raw, fallbackTag)` 规范化；自定义词再经过
`normalizeCustomWord(raw)` 补上 `custom:` 前缀的稳定 id，并归入「自定义词」册。
`words.js` 的全库数据由外部脚本维护，运行时不会改写它。

## 字段

```json
{
  "id": "custom:serendipity",
  "w": "serendipity",
  "ph": "/ˌserənˈdɪpəti/",
  "pos": "n.",
  "cn": "意外发现珍奇事物的运气",
  "col": [
    { "en": "a happy serendipity", "cn": "美好的意外" }
  ],
  "ex": {
    "en": "Finding that tiny bookshop was pure serendipity.",
    "cn": "发现那家小书店纯属意外之喜。"
  },
  "wf": {
    "n": ["serendipity", "serendipities"],
    "v": [],
    "adj": ["serendipitous"],
    "adv": ["serendipitously"]
  },
  "freq": "中",
  "syn": [
    { "w": "chance", "note": "泛指偶然" },
    { "w": "luck", "note": "偏好运" }
  ],
  "tag": "自定义",
  "book": "custom",
  "unit": "custom-unit"
}
```

| 字段 | 说明 |
| --- | --- |
| `w` | 词典原形，必填。屈折形式（went、children）应归入 `wf`，不要作为 `w`。 |
| `ph` | 音标，可带或不带 `/`，展示时由 `formatPhonetic` 统一成 `/.../`。 |
| `pos` | 词性，如 `v.` / `n.` / `adj.` / `adv.`。 |
| `cn` | 中文释义；`normalizeWord` 会去掉与 `pos` 重复的前缀。 |
| `col` | 搭配数组 `[{en, cn}]`，最多保留 5 条。 |
| `ex` | 例句 `{en, cn}`；缺失或为空时展示层隐藏例句区块。 |
| `wf` | 结构化词形 `{n, v, adj, adv}`，每类最多 10 个、自动去重。 |
| `freq` | 高考频次，只能是 `高` / `中` / `低`；其他值按空处理。 |
| `syn` | 同义词数组 `[{w, note}]`，最多 4 条，自动去重并排除原词。`note` 为极短中文区别。 |
| `tag` / `book` / `unit` | 展示与筛选用的归属信息；自定义词固定归入 `custom` 册 / `custom-unit` 单元，标签为「自定义」。 |

`wf` 会通过 `morphology.js` 展开/同步到 `forms`，阅读查词因此能命中
`went → go`、`children → child` 等屈折形式。`forms` 只用于查词与展示，不单独进入复习队列。

## 同义词（syn）

- 只收 2–4 个高考常用同义词，宁缺毋滥；没有合适同义词时输出空数组。
- `note` 用极短中文写区别（如「偏正式」「指物」「强调结果」），不要写完整释义。
- 同义词不能与原词重复；展示层也会再次去重。
- 学习卡、词表浏览、阅读查词、bot 词卡都会显示「同义词」区块。点击后按
  `findWordBySpelling` 查词库；命中即可「加入复习」，阅读/bot 场景复用各自的查词 sheet。

## DeepSeek 生成规则

设置页「自定义词」支持两种入口：

1. **用 DeepSeek 生成**：输入一个英文词 → 预览 → 「确认加入」才写入词库；「取消」丢弃。
2. **手动粘贴**：每行 `单词|音标|释义|搭配1;搭配2`，作为离线兜底。

生成词条与「阅读生词自动补全」共用 `wordEntryRulesText()`，避免两套 prompt 分歧。
默认模型为 `deepseek-flash`；`deepseek-flash` / `deepseek-chat` 都会发送 `response_format: json_object`，`deepseek-reasoner` 不发（自定义词生成遇到非 JSON 会自动重试一次）。
模型返回必须是一个 JSON 对象（OOV 补全返回 `{"words":[...]}`），字段如下：

```json
{
  "w": "词典原形",
  "ph": "/音标/",
  "pos": "v.",
  "cn": "中文释义",
  "col": [{ "en": "常见搭配", "cn": "中文" }],
  "ex": { "en": "原创例句", "cn": "中文翻译" },
  "wf": { "n": [], "v": [], "adj": [], "adv": [] },
  "freq": "高",
  "syn": [{ "w": "同义词", "note": "极短中文区别" }]
}
```

规则要点：

- `w` 用词典原形；若输入是屈折形式，把该形式放进 `wf` 对应类别，并写全其他词形。
- `wf` 写全部真实词形（屈折 + 派生）：
  - `v`：原形、三单、过去式、过去分词（若不同）、-ing；相关动词原形也保留。
  - `n`：单数 + 真实复数（child/children、analysis/analyses）；保留 helper、helpfulness 等派生名词。
  - `adj`：原级；有单字比较级/最高级时写上；不要写 more/most + 形容词。
  - `adv`：真实副词；没有则空数组。
  - 只写真实英语词，不编造；某词性确实没有形式才留空。
- `col` 给 2–3 条高考完形/阅读常见搭配；`ex` 给原创例句和中文翻译。
- `freq` 按高考频率判断：核心词「高」、一般课标词「中」、生僻或文学词「低」。
- `syn` 给 2–4 个高考常用同义词，`note` 极短；宁缺毋滥。

客户端校验：`w`、`cn` 必填，`freq` 必须是 `高/中/低`；`col`、`wf`、`syn` 的结构必须正确，
否则提示「DeepSeek 返回的词条格式不正确」。已存在（内置或自定义）的词会提示不重复，
不会写入。离线（`navigator.onLine === false`）时明确提示「需要联网才能用 DeepSeek 生成」。

## 网络路径

- 网页版：`fetch` 直连 `https://api.deepseek.com/chat/completions`。
- APK：`file://` 页面受 CORS 限制，app.js 优先调用
  `window.XiaodanciciNative.deepseekChat(requestId, callbackName, jsonBody)`；
  `MainActivity` 用 `HttpURLConnection` POST，再把原始响应 JSON 回传给页面。
  原生桥不可用或失败时才回退 `fetch`。
- API Key 只保存在本机 `localStorage`，不写入代码、文档或仓库。
