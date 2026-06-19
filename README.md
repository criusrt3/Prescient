# 先觉 Prescient · 全球变局决策简报

**先觉（Prescient）** 是一款新闻驱动的认知产品演示界面。它把海量资讯压缩成可决策的结构化简报，帮助你在几分钟内把握「今天世界发生了什么、哪些话题在升温、明天该盯什么、各方怎么看」。

当前版本：**全站数据**通过 `loadPrescientData()` 异步请求 `/api/prescient`，由后端拉取 **Odaily RSS 实时快讯流** 并映射为 M1–M5、全览简报与快讯模块。

> **与 Odaily Skill 的关系**  
> 数据主源为 `rss.odaily.news`。若本机安装了 [Odaily Skill](https://clawhub.ai/odaily/odaily-skill)，可设置环境变量 `ODAILY_SKILL_DIR` 指向 skill 目录，后续可扩展为 Skill + RSS 混合源。

---

## 当前数据从哪来？

| 模块 | 数据来源 |
|------|----------|
| **全站（M1–M5 + 简报 + 快讯）** | `GET /api/prescient` ← Odaily RSS |
| 前端入口 | `loadPrescientData()` → `prescientClient.ts` |

后端 `server/adapter.py` 将快讯 RSS 映射为：今日变局、叙事温度、议程、分歧雷达、原始脉络与快讯 Tab。M5 来源链接为真实 Odaily `post` / `newsflash` URL。

---

## 这个项目解决什么问题？

信息过载时代，普通新闻流只能告诉你「发生了什么」，却很难回答：

- 哪些变化**真的重要**，哪些只是噪音？
- 某个话题是在**升温还是退潮**？
- 明天有哪些**确定性事件**需要提前准备？
- 同一事件，**乐观派和悲观派**各自依据是什么？

先觉把这些问题拆成六个模块，用统一的信号分级和来源策略呈现，让你从「刷新闻」变成「做判断」。

---

## 功能模块

| 模块 | 说明 |
|------|------|
| **全览简报** | M1–M4 核心信息一屏总览，附 AI 一句话主线总结 |
| **M1 今日变局** | 筛选今日重要全球变化；标注硬事实 / 软信号 / 背景噪音，以及共识阶段 |
| **M2 叙事温度** | 升温与退潮话题、热度变化、高分歧话题列表与 AI 舆论判断 |
| **M3 明日议程** | 明日关键事件 + 未来一周预告 + 综合关注建议 |
| **M4 分歧雷达** | 同一议题下多方阵营观点对撞、分歧指数与解读 |
| **M5 原始脉络** | Top 5 深度报道 + Top 5 快讯标题索引，点击标题直达 Odaily 原文 |
| **快讯** | 最新快讯（每两小时刷新）+ 币圈快讯（当日汇总），底部附今日🔥专题 |

### 信号图例

- 🔴 **硬事实** — 已确认、不可逆的变化
- 🟡 **软信号** — 可信但尚未定论的动向
- 🟢 **背景参考** — 有热度、对决策影响有限

### 交互能力

- **亮白 / 深色主题**切换，偏好保存在浏览器本地（`prescient-theme`）
- **关注领域标签**（科技、宏观、地缘等）影响 M1 变局排序
- **关键词智能路由**：搜索「明天」「分歧」「快讯」等自动跳转对应模块
- **来源链接策略**：仅展示已核实的 Odaily 文章或权威文档链接；不确定来源则不显示链接，避免 404

---

## 快速启动

**推荐（单命令即可，内置 Odaily API）：**

```bash
cd prescient-ui
npm install
npm run dev
```

`npm run dev` 会在 Vite 内直接拉取 Odaily RSS，**无需**单独启动 Python 服务。

可选完整栈（Python 代理 + 前端）：

```bash
./start.sh
```

浏览器访问：**http://localhost:5180**

构建生产版本：

```bash
npm run build
npm run preview
```

### 部署到 Vercel

项目已包含 `api/prescient.ts` Serverless 函数，生产环境会自动提供 `/api/prescient`（拉取 Odaily RSS）。

1. 将仓库导入 [Vercel](https://vercel.com)（根目录为项目根，含 `vercel.json`）
2. Framework Preset 选 **Vite**，Build Command `npm run build`，Output `dist`
3. 部署完成后访问站点，数据应显示「Odaily RSS 实时」

本地 `npm run build` 只生成静态 `dist/`，**不含 API**；API 由 Vercel Functions 在运行时提供。

若环境没有全局 `npm`，可用 Cursor 内置 Node：

```bash
/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node \
  ./node_modules/vite/bin/vite.js --config vite.config.ts
```

---

## 技术栈

- **Vite 6** — 开发与构建
- **TypeScript** — 类型安全
- **原生 DOM** — 无 React / Vue 等 UI 框架，轻量直接

---

## 项目结构

```
prescient-ui/
├── api/
│   ├── prescient.ts        # Vercel Serverless：/api/prescient
│   └── health.ts           # /api/health
├── lib/
│   └── prescientCore.ts    # RSS 拉取 + M1–M5 映射（dev/Vercel 共用）
├── plugins/
│   └── odailyApi.ts        # Vite dev 中间件
├── vercel.json
├── index.html
├── vite.config.ts
├── start.sh                # 可选：Python 代理 + 前端
├── server/
│   ├── main.py             # 可选 Odaily RSS 代理
│   └── requirements.txt
└── src/
    ├── main.ts
    ├── app.ts
    ├── prescientClient.ts  # fetch /api/prescient
    ├── dataEngine.ts
    └── style.css
```

### 数据流

```
rss.odaily.news  →  /api/prescient (Vite 中间件 或 Vercel Function)  →  全站模块
```

---

## 来源链接说明

演示数据中的来源分为两类：

1. **Odaily 已核实文章** — 标题、摘要与 `/post/{id}` 链接一一对应
2. **权威文档页** — 如欧盟 AI 法案全文、暂停 AI 训练公开信

其余条目（地缘快讯、宏观日程等）在暂无可靠原文链接时**只展示内容，不提供来源按钮**。

---

## 可选：接入 Odaily Skill

当前默认使用 RSS。若已安装 Odaily Skill，设置：

```bash
export ODAILY_SKILL_DIR=~/.openclaw/skills/odaily-skill
```

可在 `server/skill_bridge.py` 基础上扩展 `get_today_watch` 等工具，与 RSS 数据合并。

---

## 许可证

本项目为演示用途，数据内容为 Mock，不构成投资建议。
