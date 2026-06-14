"""AI-powered semantic duplicate detection for Matter Security findings.

Instead of exact-hash matching, Claude reasons about whether two findings
describe the same underlying vulnerability — even when they are worded
completely differently, have different titles, or focus on different
aspects of the same root cause.
"""
from __future__ import annotations

import json
from typing import Optional

from app.claude_examples import extract_structured

# ── Schema for the structured comparison result ───────────────────────────────

_DEDUP_SCHEMA = {
    "type": "object",
    "properties": {
        "is_duplicate": {
            "type": "boolean",
            "description": (
                "True if the new finding describes the same underlying "
                "vulnerability as an existing one, even if worded differently."
            ),
        },
        "existing_id": {
            "type": "string",
            "description": "ID of the matching existing finding (only when is_duplicate=true)",
        },
        "existing_title": {
            "type": "string",
            "description": "Title of the matching existing finding (only when is_duplicate=true)",
        },
        "reasoning": {
            "type": "string",
            "description": (
                "One or two sentences explaining why this is (or is not) a "
                "duplicate — focus on the shared root cause or why they differ."
            ),
        },
    },
    "required": ["is_duplicate", "reasoning"],
}

_SYSTEM_PROMPT = """\
You are a senior security researcher reviewing vulnerability submissions for
the Matter protocol bug bounty program. Your job is to detect SEMANTIC
duplicates — findings that describe the same root-cause vulnerability, even if:

  • Worded completely differently
  • Submitted with a different title or by a different researcher
  • One is more detailed, uses different examples, or targets a different layer
  • They both ultimately trace back to the same specification gap or SDK flaw

Two findings ARE duplicates when they share the same root cause in the same
protocol component or SDK subsystem, regardless of surface-level wording.

Two findings are NOT duplicates when they describe different attack vectors,
different components, or fundamentally different root causes — even if they
sound superficially similar (e.g. two separate auth-bypass bugs in different
clusters are NOT duplicates).

Be precise. Avoid false positives on vaguely related topics."""


# ── Main entry-point ──────────────────────────────────────────────────────────

async def check_semantic_duplicate(
    db, title: str, content: str
) -> Optional[dict]:
    """Check whether a new finding is semantically a duplicate of any finding
    already stored in the database.

    Returns a duplicate descriptor dict or ``None`` if unique::

        {
            "match_type":     "semantic",
            "existing_id":    "<uuid>",
            "existing_title": "<title>",
            "reasoning":      "<one-liner from Claude>",
        }
    """
    # Fetch the most recent 60 findings (enough for a thorough comparison
    # while staying well inside the context window).
    existing: list[dict] = []
    async for doc in db.findings.find(
        {},
        {"_id": 1, "title": 1, "content": 1},
        sort=[("created_at", -1)],
        limit=60,
    ):
        existing.append(
            {
                "id": str(doc["_id"]),
                "title": doc.get("title", ""),
                # Truncate each excerpt to keep the prompt manageable
                "excerpt": (doc.get("content") or "")[:500],
            }
        )

    if not existing:
        return None  # Nothing to compare against → definitely unique

    user_message = f"""\
NEW FINDING TO CHECK:
  Title  : {title}
  Content (first 1500 chars):
{content[:1500]}

---

EXISTING FINDINGS IN THE DATABASE ({len(existing)} total):
{json.dumps(existing, indent=2)}

---

Is the new finding a semantic duplicate of any existing finding?
Focus on the core vulnerability, affected component, and root cause —
not the surface wording or length of the descriptions."""

    result = await extract_structured(
        user_message=user_message,
        schema=_DEDUP_SCHEMA,
        schema_name="dedup_result",
        schema_description=(
            "Determine whether a new security finding is a semantic duplicate "
            "of any existing finding in the database."
        ),
        system_prompt=_SYSTEM_PROMPT,
        max_tokens=512,
    )

    if not result.get("is_duplicate"):
        return None

    return {
        "match_type": "semantic",
        "existing_id": result.get("existing_id", ""),
        "existing_title": result.get("existing_title", ""),
        "reasoning": result.get("reasoning", ""),
    }
