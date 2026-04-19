# 常见问题

## 安装与启动

### Q: Windows 下 `install.bat` 报 `pip` 找不到？
确认 Python 安装时勾选了 "Add Python to PATH"。或手动：
```
python -m pip install -r backend\requirements.txt
```

### Q: 启动后端报端口占用？
Windows 下 `--reload` 偶尔留下僵尸进程。在 PowerShell 执行：
```powershell
Get-Process python | Stop-Process -Force
```
再重启。

### Q: 前端 `npm run dev` 白屏？
检查 `frontend/vite.config.js` 的代理是否指向 `http://127.0.0.1:8000`；确认后端已起。

---

## 模型 / LLM

### Q: 用 Ollama 推荐哪些模型？
- 通用对话 / 摘要：`qwen2.5:7b` 或 `gemma3:4b`
- Embedding：`nomic-embed-text`

```
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

### Q: 如何切换到 DeepSeek / Kimi / 通义？
设置页 → LLM → 选择 provider → 填 API Key（Base URL 一般保留默认）。Embedding 可独立选 `OpenAI 兼容` 或继续走 Ollama 本地。

### Q: 自动分类结果不稳定？
- 在设置页自定义分类列表（精简到 10~20 个领域更准）
- 改用更大的模型
- 先生成摘要再分类，命中率显著提升

---

## 格式支持

### Q: MOBI / AZW3 无法解析？
需要安装 Calibre，并保证 `ebook-convert` 在 PATH：
```
ebook-convert --version
```

### Q: 扫描件 / 图像 PDF 没有摘要？
普通 PDF 提取器拿不到文本。启用 MinerU：
1. 注册 https://mineru.net 获取 API Token
2. 设置 → MinerU → 填入 Token → 测试连接
3. 书籍详情页点击 **MinerU 解析**，自动 OCR + 摘要 + 索引

---

## 私密书架

### Q: 忘记密码怎么办？
1. 关闭后端
2. 编辑 `backend/user_settings.json`，把 `"private_password_hash"` 改成 `""`
3. 重启后端
4. 再次访问 `/private` 会要求重新设置密码，已标私密的书籍保持不变

### Q: 锁定后还能看到私密书吗？
不会。列表、搜索、图谱默认 `scope=public`，私密书只在解锁态下、`/private` 路由内显示。

### Q: 重启后端后 token 失效？
是设计行为。`PRIVATE_TOKENS` 只在内存，安全起见不持久化。

---

## 数据 / 备份

### Q: 需要备份哪些文件？
| 文件 | 作用 |
|---|---|
| `backend/ebook_manager.db` | 全部书籍元数据、评分、进度 |
| `backend/chroma_db/` | 向量与全文 chunks |
| `backend/covers/` | 封面缩略图 |
| `backend/user_settings.json` | LLM / 分类 / 密码哈希 / MinerU 配置 |

直接打包这四项即可完整还原。

### Q: 换电脑怎么迁移？
把上面四项复制到新机器相同路径，即可继续使用（路径变化时已扫描的 `file_path` 会失效，重新扫描新目录即可）。

---

## 性能

### Q: 全文索引很慢？
- 首次索引受 embedding 吞吐限制。Ollama `nomic-embed-text` 单线程约 20~40 chunks/s
- 可在设置里切换到云端 embedding（OpenAI `text-embedding-3-small`）加速

### Q: ChromaDB 目录越来越大？
重建：删除 `backend/chroma_db/`，重启后端，对需要的书籍重新 `embed` + `index`（批量操作支持）。

---

## 其他

### Q: 能否多人使用？
当前为单用户本地应用。若需多人，可放到内网并自行加反向代理认证，但私密书架密码是全局的。

### Q: 支持 Linux / macOS 吗？
后端与前端都是跨平台的。`install.bat` / `start.bat` 是 Windows 便捷脚本，在其他系统直接用 `pip` 和 `npm` 即可。
