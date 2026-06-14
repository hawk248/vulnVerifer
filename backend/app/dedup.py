"""Duplicate-detection helpers for Matter Security findings.

Strategy
--------
Two orthogonal fingerprints are stored per finding in a dedicated
`finding_hashes` collection (each document keyed by the hash itself,
so lookups are O(1) primary-key reads):

  content_hash — SHA-256 of aggressively normalised body text.
                 Catches identical or near-identical vulnerability
                 descriptions (whitespace / punctuation / case
                 variations).

  title_hash   — SHA-256 of a normalised title (stops "the same bug
                 with a slightly different title" slipping through).

The `findings` collection also carries a unique index on content_hash
(created at startup) so the database itself enforces uniqueness even
under concurrent submissions.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Optional


# ── Normalisation ────────────────────────────────────────────────────────────

def _normalise(text: str) -> str:
    """Aggressive normalisation that strips all non-alphanumeric chars and
    collapses whitespace so cosmetic variations produce the same hash."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)   # keep only letters & digits
    text = re.sub(r"\s+", " ", text).strip()     # collapse whitespace
    return text


def compute_content_hash(content: str) -> str:
    """Stable SHA-256 fingerprint of normalised body content."""
    return hashlib.sha256(_normalise(content).encode()).hexdigest()


def compute_title_hash(title: str) -> str:
    """Stable SHA-256 fingerprint of a normalised finding title."""
    return hashlib.sha256(_normalise(title).encode()).hexdigest()


# ── Database helpers ─────────────────────────────────────────────────────────

async def check_duplicate(db, content_hash: str, title_hash: str) -> Optional[dict]:
    """Return a duplicate descriptor if either hash already exists,
    or None if the finding is unique.

    The descriptor has the shape::

        {
            "match_type": "content" | "title",
            "existing_id": "<finding uuid>",
            "existing_title": "<title>",
        }
    """
    existing = await db.finding_hashes.find_one(
        {"_id": {"$in": [content_hash, title_hash]}}
    )
    if not existing:
        return None
    return {
        "match_type": "content" if existing["_id"] == content_hash else "title",
        "existing_id":    existing["finding_id"],
        "existing_title": existing.get("title", ""),
    }


async def register_finding(db, finding_id: str, title: str,
                           content_hash: str, title_hash: str) -> None:
    """Insert both hash sentinels into `finding_hashes`.
    Uses upsert so a re-index never raises a duplicate-key error."""
    now = datetime.now(timezone.utc).isoformat()
    base = {"finding_id": finding_id, "title": title, "created_at": now}
    for h, kind in ((content_hash, "content"), (title_hash, "title")):
        await db.finding_hashes.update_one(
            {"_id": h},
            {"$setOnInsert": {**base, "type": kind}},
            upsert=True,
        )
