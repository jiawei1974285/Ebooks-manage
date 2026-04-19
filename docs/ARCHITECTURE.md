# 架构说明

## 总览

```
┌────────────────┐        HTTP/JSON         ┌─────────────────┐
│   React (Vite) │  ───────────────────►   │  FastAPI (8000) │
│  localhost:5173│  ◄───────────────────    │                 │
└────────────────┘        SSE (流式)        └────┬────────────┘
                                                  │
            ┌─────────────────┬────────────────────┼──────────────────┐
            ▼                 ▼                    ▼                  ▼
      ┌──────────┐      ┌──────────┐       ┌────────────┐     ┌────────────┐
      │  SQLite  │      │ ChromaDB │       │ LLM API    │     │ MinerU API │
      │ 元数据    │      │ 向量+chunks│     │ Ollama /   │     │ OCR 云服务 │
      └──────────┘      └──────────┘       │ DeepSeek…  │     └────────────┘
                                           └────────────┘
```

## 数据流

### 扫描入库
```
扫描目录 → 遍历 .pdf/.epub/.mobi →
  compute_file_hash (md5 of size + first 1MB)
  └─ 已存在? skip
  └─ 提取元数据（extractors/）
  └─ 生成封面到 covers/
  └─ INSERT INTO books
```

### 生成摘要
```
generate_summary(book_id)
  └─ extract_meta() 取节选
  └─ ai_service.generate_summary(title, author, excerpt)
      └─ llm_providers.chat()  (Ollama / OpenAI-compatible)
  └─ UPDATE books.summary
```

### 自动分类
```
classify_book(book_id)
  └─ ai_service.classify_book(title, author, desc, summary,
                              categories=settings.categories)
      └─ LLM 返回 JSON array
  └─ UPDATE books.categories
```

### 向量语义搜索
```
embed_book(book_id)
  └─ llm_providers.embed(summary or description)
  └─ chromadb.add(embedding, id=book_id)

search(q, mode='semantic')
  └─ llm_providers.embed(q)
  └─ chromadb.query()  → top-k book_ids
  └─ SQL join books, return 数据
```

### 全文 RAG
```
index_book(book_id)
  └─ text_extractor.extract_full_text()   segments = [{text, page}]
  └─ chunking.chunk_segments(size=800, overlap=120)
  └─ 每 chunk → embed → chromadb.add(collection='book_chunks')
  └─ UPDATE books.indexed=true, chunk_count=n

chat(question, mode='rag')
  └─ embed(question)
  └─ chromadb.query(book_chunks, top_k=6)
  └─ 构造 prompt:  [上下文 1..6] + question
  └─ llm.chat → 答案 + [来源 1/2/3] 引用
```

### MinerU 扫描件处理
```
mineru_parse_book(book_id)
  └─ POST /api/v4/file-urls/batch   拿到 upload_url + batch_id
  └─ PUT  file → OSS
  └─ 轮询 GET /api/v4/extract-results/batch/{batch_id} 直到 state=done
  └─ 下载 full_zip_url → 解压 → 提取 *.md
  └─ 可选：LLM 摘要、按 2500 字切段 → RAG 索引
```

## 数据模型（核心）

```python
class Book(Base):
    id            Integer PK
    file_path     String unique      # 绝对路径
    file_hash     String             # md5 of size+first 1MB
    title         String
    author        String
    publisher     String
    publish_date  String
    language      String
    description   Text
    cover_path    String
    file_format   String             # PDF / EPUB / MOBI
    file_size     Integer
    page_count    Integer
    summary       Text                # LLM 生成
    categories    Text                # JSON array
    tags          Text                # JSON array
    created_at    DateTime
    updated_at    DateTime
    embedding_done Boolean           # 向量搜索已入库
    last_page     Integer            # PDF 阅读进度
    last_read     DateTime
    indexed       Boolean            # 全文 RAG 已索引
    chunk_count   Integer
    rating        Integer            # 0~5 星
    review        Text               # 用户评论
    is_private    Boolean            # 私密书架
```

迁移方式：`database.py` 里的 `MIGRATIONS` 列表用 PRAGMA 检测缺失列并 `ALTER TABLE ADD COLUMN`，无需 Alembic。

## 私密书架机制

- 密码 SHA-256 哈希存 `user_settings.json`
- 解锁生成 `secrets.token_urlsafe(32)` 放入内存 `PRIVATE_TOKENS` 集合
- 前端把 token 放 `localStorage`，axios 拦截器自动带 `X-Private-Token` 头
- 后端 `is_unlocked(token)` 校验；`list_books(scope=...)` 根据 scope + 是否解锁过滤
- 修改密码会清空所有 token；服务端重启也会清空

## 前端路由

```
/              → Library (scope=public)
/private       → PrivateGate → Library (scope=private)
/books/:id     → BookDetail
/chat          → Chat (RAG 问答)
/graph         → 知识图谱
/duplicates    → 重复管理
/stats         → 统计
/settings      → 设置（LLM / 分类 / 私密 / MinerU / Embed）
```

URL 查询参数驱动书架状态（page、sort、category、format、q），因此返回详情页可还原列表上下文。

## 配置优先级

```
settings_store.load_settings()  →  合并 DEFAULT_SETTINGS + user_settings.json
   llm.provider / model / api_key      → ai_service / llm_providers
   llm.embed_provider / embed_model    → 语义搜索 + RAG 向量化
   categories                          → 自动分类候选
   private_password_hash               → 私密书架
   mineru.*                            → MinerU OCR 开关与 Token
```
