import json
import logging
import re
from llm_providers import chat_complete, get_embedding as _get_embed
from settings_store import load_settings, DEFAULT_CATEGORIES

logger = logging.getLogger(__name__)


def _current_categories() -> list[str]:
    try:
        cats = load_settings().get("categories") or []
        return cats if cats else DEFAULT_CATEGORIES
    except Exception:
        return DEFAULT_CATEGORIES


def generate_summary(title: str, author: str, excerpt: str) -> str:
    prompt = f"""请为以下电子书生成一个简洁的中文摘要（150~250字）：

书名：{title}
作者：{author}
内容摘录：
{excerpt[:2500]}

请直接输出摘要内容，不要包含任何说明或前缀。"""
    return chat_complete([{"role": "user", "content": prompt}], temperature=0.5)


def classify_book(title: str, author: str, description: str, summary: str) -> list[str]:
    cats = _current_categories()
    categories_str = "、".join(cats)
    text = summary or description or ""
    prompt = f"""请根据以下书籍信息，从给定分类中选择最合适的 1~3 个分类：

书名：{title}
作者：{author}
内容：{text[:1000]}

可选分类：{categories_str}

只输出分类名称，多个分类用英文逗号分隔，不要有任何其他内容。
示例：{cats[0] if cats else '其他'}"""

    raw = chat_complete([{"role": "user", "content": prompt}], temperature=0.2)
    selected = [c.strip() for c in raw.replace("、", ",").split(",") if c.strip() in cats]
    return selected if selected else [cats[-1] if cats else "其他"]


def suggest_categories(book_samples: list[dict], existing: list[str], n: int = 12) -> list[str]:
    """Ask the LLM to propose a fresh category taxonomy based on the current library.

    book_samples: [{title, author, summary?}, ...] — representative subset.
    Returns a deduped list merging AI suggestions with existing ones.
    """
    sample_lines = []
    for b in book_samples[:60]:
        line = f"- 《{b.get('title','')}》 {b.get('author') or ''}".strip()
        if b.get("summary"):
            line += f" — {b['summary'][:80]}"
        sample_lines.append(line)
    sample_text = "\n".join(sample_lines)

    prompt = f"""你是图书馆分类学专家。请根据下面的书籍样本，为整个书库设计一套合理的分类目录。

要求：
- 约 {n} 个分类，使用中文短语（2~5字），互相覆盖不重叠
- 分类粒度适中，既不太宽泛也不过细
- 必须包含一个 "其他" 作为兜底
- 只输出一个 JSON 数组，如 ["计算机编程", "文学小说", "其他"]，不要任何其他内容

当前分类（可参考）：{'、'.join(existing[:20])}

书籍样本：
{sample_text}

JSON 数组："""

    raw = chat_complete([{"role": "user", "content": prompt}], temperature=0.3)
    # tolerate models wrapping output with markdown fences
    m = re.search(r"\[.*\]", raw, re.S)
    if m:
        try:
            cats = json.loads(m.group(0))
            cats = [c.strip() for c in cats if isinstance(c, str) and c.strip()]
            if cats:
                return cats
        except Exception as e:
            logger.warning(f"suggest_categories parse failed: {e}; raw={raw[:200]}")
    # fallback: comma-separated
    parts = [p.strip(" 、,.·*-") for p in re.split(r"[,，、\n]", raw) if p.strip()]
    return parts or existing


def suggest_tags(title: str, author: str, summary: str, description: str,
                 existing_tags: list[str] | None = None,
                 n_max: int = 6) -> list[str]:
    """让 LLM 基于书籍内容推荐中文标签（细粒度，区别于分类）。"""
    corpus = (summary or description or "")[:1500]
    hints = "、".join((existing_tags or [])[:40]) if existing_tags else ""
    hint_line = f"\n现有标签可参考（尽量复用相同含义的）：{hints}" if hints else ""
    prompt = f"""请为以下书籍生成 3~{n_max} 个中文标签。

书名：{title}
作者：{author}
简介/摘要：{corpus}
{hint_line}

要求：
- 标签应细粒度、可作为筛选维度（主题、流派、写作风格、时代、学科分支等）
- 每个标签 2~6 个汉字，避免与书名/作者重复
- 只输出一个 JSON 字符串数组，例如 ["认知心理","通俗科普","二十世纪"]，不要任何解释

JSON 数组："""
    raw = chat_complete([{"role": "user", "content": prompt}], temperature=0.4)
    m = re.search(r"\[.*\]", raw, re.S)
    tags: list[str] = []
    if m:
        try:
            arr = json.loads(m.group(0))
            tags = [str(x).strip() for x in arr if str(x).strip()]
        except Exception:
            logger.warning(f"suggest_tags parse failed; raw={raw[:200]}")
    if not tags:
        tags = [p.strip(" 、,.·*-#") for p in re.split(r"[,，、\n]", raw) if p.strip()]
    # dedupe, cap length, filter noise
    seen, out = set(), []
    for t in tags:
        k = t.strip()
        if not k or len(k) > 12 or k in seen:
            continue
        seen.add(k); out.append(k)
        if len(out) >= n_max:
            break
    return out


def get_embedding(text: str) -> list[float]:
    return _get_embed(text)


def answer_question(question: str, books_context: list[dict]) -> str:
    context_parts = []
    for b in books_context:
        part = f"书名：{b['title']}\n作者：{b['author']}"
        if b.get("summary"):
            part += f"\n摘要：{b['summary']}"
        context_parts.append(part)
    context = "\n\n---\n\n".join(context_parts)

    prompt = f"""你是一位智能书库助手。根据以下书籍信息回答用户的问题。

书籍信息：
{context}

用户问题：{question}

请给出详细、有帮助的中文回答。"""

    return chat_complete([{"role": "user", "content": prompt}], temperature=0.7)
