# 📚 EbookHub — AI 电子书管理系统

一个本地优先、支持多种 LLM 的电子书管理系统。扫描本地 PDF / EPUB / MOBI，自动生成摘要与分类，构建语义搜索与全文 RAG 问答，支持星级评分、评论、私密书架、批量编辑、重复清理等。

![version](https://img.shields.io/badge/version-1.0.0-blue) ![python](https://img.shields.io/badge/python-3.10%2B-blue) ![node](https://img.shields.io/badge/node-18%2B-green) ![license](https://img.shields.io/badge/license-MIT-green)

---

## ✨ 功能特性

### 📖 图书管理
- **多格式解析** — PDF、EPUB、MOBI / AZW3（MOBI 需 Calibre `ebook-convert`）
- **扫描 + 拖拽导入** — 目录扫描 / 浏览器文件拖拽
- **去重** — 基于文件 hash（md5 of size+first 1MB），重复管理界面一键保留最新
- **手动编辑** — 标题、作者、出版社、日期、语言、分类、标签、摘要、简介、评论
- **批量操作** — 批量生成摘要、自动分类、向量化、全文索引、修改作者等信息、设置分类、移除

### 🤖 AI 能力（多 LLM 后端）
支持 **Ollama 本地模型**、**DeepSeek**、**Kimi**、**通义千问**、**MiniMax**、**OpenAI** 及兼容 API。
- **自动摘要** — 根据书籍节选生成中文摘要
- **自动分类** — 使用可自定义分类目录做语义分类；支持 LLM 建议分类
- **语义搜索** — Embedding 向量检索（Ollama `nomic-embed-text` / OpenAI embeddings）
- **RAG 问答** — 全文切块索引，跨书问答带章节 / 页码来源引用
- **图像 PDF / 扫描件** — 集成 [MinerU](https://mineru.net) 云端 API，OCR + 公式 + 表格 → Markdown → 自动摘要 + 索引

### 📊 视图与交互
- **卡片 / 列表双视图** — 浏览偏好持久化
- **多维排序** — 时间、书名、作者、文件大小、评分、最近阅读
- **分类 / 格式侧边栏** — URL 持久化，返回详情不丢失页码与筛选
- **多选 & 快捷键** — Shift 范围选择、Ctrl+A 全选、Esc 清除
- **星级评分 + 评论**
- **PDF 内嵌预览** — 阅读进度自动保存

### 🔒 私密书架
- 密码保护，SHA-256 哈希存储
- 每本书可单独标记私密
- 解锁令牌内存态（服务端重启即失效）
- 私密书默认不出现在主书架、搜索、图谱

### 🧠 知识图谱
- `react-force-graph-2d` 渲染
- 节点：书籍；边：共享分类 / 作者

### ⚙️ 其他
- 书库统计、JSON 导出备份
- 多主题切换（深色 / 浅色 / 自定义强调色）
- 键盘快捷键总览

---

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 后端 | FastAPI · SQLAlchemy · SQLite · ChromaDB · PyMuPDF · ebooklib |
| 前端 | React 18 · Vite · TailwindCSS · react-router-dom · lucide-react |
| AI  | Ollama (本地) / OpenAI 兼容 API / MinerU 云端 OCR |

---

## 🚀 快速开始

### 1. 环境要求
- **Python ≥ 3.10**
- **Node.js ≥ 18**
- **Ollama**（可选，本地模型）— https://ollama.com
- **Calibre**（可选，用于 MOBI 解析）— https://calibre-ebook.com

### 2. 克隆与安装
```bash
git clone https://github.com/<your-name>/ebookhub.git
cd ebookhub
```

**Windows 一键安装：**
```bat
install.bat
```

**手动安装：**
```bash
# 后端
cd backend
pip install -r requirements.txt

# 前端
cd ../frontend
npm install
```

### 3. 启动（开发模式）

**后端**（端口 8000）：
```bash
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**前端**（端口 5173）：
```bash
cd frontend
npm run dev
```

访问 http://localhost:5173

### 4. 首次配置（设置页）
1. 选择 LLM 提供方（推荐从 `Ollama (本地)` 起步）
   - 需先 `ollama pull gemma4` 和 `ollama pull nomic-embed-text`
2. 云厂商需填写 API Key + Base URL
3. （可选）私密书架 → 设置访问密码
4. （可选）MinerU → 填入 Token，用于扫描件解析

### 5. 扫描电子书
点击右上角 **扫描** → 选择目录 → 开始。

---

## 📦 生产部署

```bash
# 前端打包
cd frontend
npm run build

# 使用 FastAPI 静态服务 dist/ 或配置 Nginx 代理到 backend
```

典型生产配置：Nginx 反向代理 `/api/*` 到 uvicorn（8000），根路径服务 `frontend/dist/`。

---

## 📁 项目结构

```
ebookhub/
├── backend/
│   ├── main.py                # FastAPI 入口与路由
│   ├── database.py            # SQLAlchemy 模型 + 迁移
│   ├── ai_service.py          # LLM 调用封装
│   ├── llm_providers.py       # 多 provider 抽象
│   ├── vector_search.py       # ChromaDB 向量检索
│   ├── rag.py                 # RAG 问答链
│   ├── text_extractor.py      # 全文提取
│   ├── chunking.py            # 文本切块
│   ├── scanner.py             # 目录扫描 + 文件 hash
│   ├── mineru_service.py      # MinerU 云端 API
│   ├── settings_store.py      # 配置持久化
│   ├── extractors/            # pdf / epub / mobi 元数据提取器
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx            # 路由与外壳
    │   ├── api.js             # 后端 API 客户端
    │   ├── pages/             # Library / BookDetail / Chat / Stats / Graph / ...
    │   ├── components/        # BookCard / PrivateGate / ScanModal / ...
    │   └── hooks/             # 快捷键等
    ├── vite.config.js
    └── package.json
```

---

## 📖 文档

- [架构与数据流](docs/ARCHITECTURE.md)
- [REST API 参考](docs/API.md)
- [常见问题](docs/FAQ.md)

---

## 🗃️ 数据存储

| 类型 | 路径 |
|---|---|
| 书籍元数据 | `backend/ebook_manager.db` (SQLite) |
| 向量 / 全文 chunk | `backend/chroma_db/` |
| 封面缩略图 | `backend/covers/` |
| 上传文件 | `backend/uploads/` |
| 用户配置 | `backend/user_settings.json` |

**首次启动** `init_db()` 会自动创建表并执行 PRAGMA 迁移，无需手动建表。

---

## 🔑 忘记私密书架密码

1. 关闭后端
2. 打开 `backend/user_settings.json`
3. 把 `"private_password_hash": "..."` 改成 `""`
4. 重启后端 — 下次访问私密书架会要求重新设置密码（已标记私密的书籍保持不变）

---

## 🤝 贡献

欢迎 Issue / PR。建议开发流程：
```bash
# 后端热重载
uvicorn main:app --reload

# 前端热重载
npm run dev
```

---

## 📄 License

MIT © 2026

---

## 🙏 致谢

- [Ollama](https://ollama.com) — 本地 LLM 运行时
- [ChromaDB](https://www.trychroma.com) — 向量数据库
- [PyMuPDF](https://pymupdf.readthedocs.io) — PDF 解析
- [MinerU](https://mineru.net) — 图像 PDF 解析
- [Lucide](https://lucide.dev) — 图标库
