# REST API 参考

默认地址：`http://127.0.0.1:8000`
所有响应均为 JSON。涉及私密书架的接口通过请求头 `X-Private-Token: <token>` 鉴权。

---

## 图书

### `GET /api/books`
列出图书。

查询参数：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| page | int | 1 | 页码 |
| page_size | int | 24 | 每页条数，最大 100 |
| sort | str | created_at | `created_at` / `title` / `author` / `file_size` / `rating` / `last_read` |
| order | str | desc | `asc` / `desc` |
| category | str | - | 精确分类 |
| format | str | - | `PDF` / `EPUB` / `MOBI` |
| q | str | - | 关键字（标题/作者/描述） |
| scope | str | public | `public` / `private` / `all`（`private`/`all` 需解锁令牌） |

响应：
```json
{ "total": 173, "page": 1, "page_size": 24, "items": [ {Book}, ... ] }
```

### `GET /api/books/{id}`
单本详情。若该书为私密且未解锁返回 403。

### `PUT /api/books/{id}`
更新元数据。Body 任意子集：
```json
{
  "title": "...", "author": "...", "publisher": "...",
  "publish_date": "...", "language": "...",
  "description": "...", "summary": "...",
  "categories": ["历史","传记"], "tags": ["..."],
  "rating": 5, "review": "...",
  "is_private": true
}
```

### `DELETE /api/books/{id}`
删除记录（不删源文件）。

### `POST /api/books/{id}/summary`
触发 LLM 摘要（同步）。

### `POST /api/books/{id}/classify`
LLM 自动分类。

### `POST /api/books/{id}/embed`
向量化入 ChromaDB。

### `POST /api/books/{id}/index` (SSE)
全文切块并索引。返回 `text/event-stream`，事件：
```
data: {"stage":"extract","progress":0.2}
data: {"stage":"embed","progress":0.75,"chunk":42}
data: {"stage":"done","chunk_count":183}
```

### `POST /api/books/{id}/mineru` (SSE)
MinerU OCR 解析，可选参数 `auto_summary`、`auto_index`。

---

## 批量

### `POST /api/books/batch`
```json
{ "book_ids":[1,2,3], "action":"summary|classify|embed|index|delete|set_private|set_public" }
```

### `POST /api/books/batch-update`
```json
{
  "book_ids":[1,2],
  "fields":{ "author":"鲁迅" },
  "only_empty": false
}
```

### `POST /api/books/batch-categories`
```json
{
  "book_ids":[1,2,3],
  "mode":"add|replace|remove",
  "categories":["历史"]
}
```

---

## 扫描 / 导入

### `POST /api/scan` (SSE)
```json
{ "path":"D:/books" }
```

### `POST /api/upload`
multipart 上传单文件。

---

## 分类 / 标签

- `GET /api/categories?scope=public` → `["历史","小说",...]`
- `GET /api/tags`

---

## 搜索

### `GET /api/search`
```
?q=...&mode=keyword|semantic&top_k=20
```

---

## RAG 聊天

### `POST /api/chat` (SSE)
```json
{ "question":"...", "book_id": null, "top_k": 6 }
```
SSE 事件：`sources`、`token`、`done`。

---

## 私密书架

| 方法 | 路径 | 说明 |
|---|---|---|
| GET  | `/api/private/status`       | `{has_password, unlocked}` |
| POST | `/api/private/set-password` | `{old_password?, new_password}` |
| POST | `/api/private/unlock`       | `{password}` → `{token}` |
| POST | `/api/private/lock`         | 使当前 token 失效 |

---

## MinerU

- `POST /api/mineru/test` → 验证 Token/Base URL
- 配置存储于 `user_settings.json.mineru`

---

## 设置

- `GET /api/settings`
- `PUT /api/settings` — 合并写入 `user_settings.json`

---

## 统计 / 导出

- `GET /api/stats` — 总数、分类分布、格式分布、阅读时长
- `GET /api/export` — 导出 JSON 备份
- `GET /api/duplicates` — hash 重复组

---

## 图谱

- `GET /api/graph` — 节点（书籍）+ 边（共享分类 / 作者）
