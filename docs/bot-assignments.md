# bot 当日背词任务约定（小单词机）

英语bot / 监工头 把「今天要背哪些词」写进本仓库，App/网页同步后在首页「今日 bot 任务」展示。

## 文件
- 路径：`data/bot-assignments.json`（与 `data/progress.json` 分开，避免和学生上传进度互相覆盖）
- 学生进度仍在：`data/progress.json`（App 上传/下载；英语bot 只读，用来分析背词进度）

## 学习日
与备考约定一致：凌晨 4:00 为界（Asia/Shanghai）。`date` 用 `YYYY-MM-DD`。

## 字段
```json
{
  "schemaVersion": 1,
  "timezone": "Asia/Shanghai",
  "updatedAt": "2026-11-08T12:00:00+08:00",
  "assignments": [
    {
      "id": "en-2026-11-08",
      "date": "2026-11-08",
      "from": "英语bot",
      "title": "选择性必修四 · 今日词",
      "words": ["abandon", "ability"],
      "note": "先英译中，再中译英；不会的点进复习",
      "status": "active"
    }
  ]
}
```
- `words`：字符串数组，尽量用词库里的原形；App 会按词库匹配释义。
- 同一天可有多条；首页优先展示当天 `status=active` 的条目。
- 英语bot 更新时：读旧文件 → 改/追加当天条目 → 写回（保留其它日期最近若干天即可）。

## 英语bot 怎么写
有仓库写权限时更新 `data/bot-assignments.json`；没有就让研发bot/监工头代写。分析进度：读 `data/progress.json` 的 `stats` / `words`，不要改它。
