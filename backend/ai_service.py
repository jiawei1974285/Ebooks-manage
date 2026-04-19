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
