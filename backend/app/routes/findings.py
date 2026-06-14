"""Matter Protocol Security Findings — submission, duplicate-check,
AI verification, and optional on-chain record creation."""
from __future__ import annotations

import asyncio
import io
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile
from pymongo.errors import DuplicateKeyError

from app.blockchain import (
    create_finding_record,
    is_blockchain_configured,
)
from app.dedup import (
    check_duplicate,
    compute_content_hash,
    compute_title_hash,
    register_finding,
)
from app.semantic_dedup import check_semantic_duplicate
from app.claude_examples import chat_once
from app.ut_api_v3 import chat_with_assistant, extract_chat_text

router = APIRouter(prefix="/api")

# ── Assistants ──────────────────────────────────────────────────────────────
MATTER_SPEC_ASSISTANT_ID = "l1MngDEBJB8zxO5B7Dj7"  # CSA Matter 1.5

MATTER_SDK_SYSTEM_PROMPT = """You are a senior security researcher and Matter protocol SDK expert with deep knowledge of the ConnectedHomeIP (CHIP) open-source SDK at https://github.com/project-chip/connectedhomeip. Your expertise covers:

- Secure Channel protocols: PASE (SPAKE2+), CASE (Sigma-based), session resumption
- Commissioning flows: BLE, Wi-Fi, Thread (OpenThread integration)
- Interaction Model: attribute reads/writes, subscriptions, invoke commands
- Credentials and PKI: Device Attestation Certificates (DAC), PAA/PAI chains, NOC issuance
- Cluster implementations: access control, OTA, groups, scenes, diagnostics
- Transport security: MRP (Message Reliability Protocol), UDP/TCP fabric layer
- Platform ports: Linux, nRF Connect, ESP32, iOS (Darwin), Android (JNI)
- Known CVE patterns in embedded IoT: heap overflows, format strings, integer truncations, auth bypasses

You produce precise, technical security assessments that reference specific SDK subsystems, source paths, and implementation details."""

VALID_VERDICTS = ["VALID", "INVALID", "NEEDS_FURTHER_REVIEW"]


def _parse_verdict(text: str) -> str:
    upper = text.upper()
    for v in VALID_VERDICTS:
        if v in upper:
            return v
    return "NEEDS_FURTHER_REVIEW"


def _overall_verdict(spec: str, sdk: str) -> str:
    if spec == "VALID" and sdk == "VALID":
        return "VALID"
    if spec == "INVALID" and sdk == "INVALID":
        return "INVALID"
    return "NEEDS_FURTHER_REVIEW"


# ── Verification helpers ─────────────────────────────────────────────────────

async def _verify_with_spec(title: str, content: str) -> str:
    prompt = f"""You are reviewing a security finding submitted to the Matter protocol bug-bounty program.

FINDING TITLE: {title}

FINDING DETAILS:
{content}

Provide a structured technical analysis:

## 1. Specification Relevance
Does this finding touch real Matter specification behaviour? Reference the relevant spec sections.

## 2. Technical Validity
Is the vulnerability technically sound according to the Matter spec? Explain your reasoning step by step.

## 3. Severity Assessment
Assess the severity (Critical / High / Medium / Low) based on attack vector, complexity, and impact on Matter deployments.

## 4. Affected Specification Areas
List the specific Matter spec areas, clusters, and subsystems affected.

## 5. Recommended Mitigations
What normative changes to the specification or implementation guidance would address this finding?

## Verdict
State exactly one of: VALID, INVALID, or NEEDS_FURTHER_REVIEW — on its own line."""

    result = await chat_with_assistant(MATTER_SPEC_ASSISTANT_ID, prompt)
    return extract_chat_text(result)


async def _verify_with_sdk(title: str, content: str) -> str:
    prompt = f"""You are reviewing a security finding for the Matter SDK (ConnectedHomeIP).

FINDING TITLE: {title}

FINDING DETAILS:
{content}

Provide a structured technical analysis from an SDK implementation perspective:

## 1. SDK Impact
How does this finding affect Matter SDK implementations? Which SDK layers are exposed?

## 2. Affected SDK Subsystems
Identify the likely affected modules and source paths (e.g., `src/protocols/secure_channel/CASESession.cpp`).

## 3. Exploitability Analysis
What preconditions are needed to exploit this? What is the realistic attack surface in production Matter devices?

## 4. SDK-Level Mitigations
What specific code changes, API hardening, or architectural fixes should SDK maintainers implement?

## 5. Interim Workarounds
Are there build flags, configuration options, or vendor-side mitigations available immediately?

## Verdict
State exactly one of: VALID, INVALID, or NEEDS_FURTHER_REVIEW — on its own line."""

    return await chat_once(
        user_message=prompt,
        system_prompt=MATTER_SDK_SYSTEM_PROMPT,
        max_tokens=2048,
    )


# ── Background task: verify then optionally record on-chain ─────────────────

async def _run_verification(finding_id: str, db) -> None:
    try:
        finding = await db.findings.find_one({"_id": finding_id})
        if not finding:
            return

        await db.findings.update_one(
            {"_id": finding_id}, {"$set": {"status": "verifying"}}
        )

        title = finding["title"]
        content = finding["content"]

        spec_task = asyncio.create_task(_verify_with_spec(title, content))
        sdk_task = asyncio.create_task(_verify_with_sdk(title, content))
        spec_res, sdk_res = await asyncio.gather(spec_task, sdk_task, return_exceptions=True)

        spec_analysis = str(spec_res) if not isinstance(spec_res, Exception) else f"Error: {spec_res}"
        sdk_analysis  = str(sdk_res)  if not isinstance(sdk_res,  Exception) else f"Error: {sdk_res}"

        spec_verdict = _parse_verdict(spec_analysis)
        sdk_verdict  = _parse_verdict(sdk_analysis)
        overall      = _overall_verdict(spec_verdict, sdk_verdict)

        update: dict = {
            "status":        "verified",
            "spec_analysis": spec_analysis,
            "spec_verdict":  spec_verdict,
            "sdk_analysis":  sdk_analysis,
            "sdk_verdict":   sdk_verdict,
            "overall_verdict": overall,
            "verified_at":   datetime.now(timezone.utc).isoformat(),
        }
        await db.findings.update_one({"_id": finding_id}, {"$set": update})

        # ── On-chain record if finding is VALID ──────────────────────────
        if overall == "VALID" and is_blockchain_configured():
            await _record_on_chain(finding_id, finding, db)

    except Exception as exc:
        await db.findings.update_one(
            {"_id": finding_id},
            {"$set": {"status": "failed", "error_message": str(exc)}},
        )


async def _record_on_chain(finding_id: str, finding: dict, db) -> None:
    """Write a Sepolia transaction for a verified finding.  Errors are
    stored in blockchain_error but do NOT change the finding status."""
    try:
        await db.findings.update_one(
            {"_id": finding_id},
            {"$set": {"blockchain_status": "recording"}},
        )
        result = await create_finding_record(
            finding_id=finding_id,
            content_hash=finding.get("content_hash", ""),
            submitter_address=finding.get("submitter_eth_address", ""),
            title=finding["title"],
        )
        await db.findings.update_one(
            {"_id": finding_id},
            {
                "$set": {
                    "blockchain_status": "recorded",
                    "tx_hash":           result["tx_hash"],
                    "block_number":      result["block_number"],
                    "block_hash":        result["block_hash"],
                    "from_address":      result["from_address"],
                    "to_address":        result["to_address"],
                    "chain_name":        result["chain_name"],
                    "explorer_url":      result["explorer_url"],
                    "recorded_at":       datetime.now(timezone.utc).isoformat(),
                }
            },
        )
    except Exception as exc:
        await db.findings.update_one(
            {"_id": finding_id},
            {"$set": {"blockchain_status": "failed", "blockchain_error": str(exc)}},
        )


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/findings", status_code=201)
async def submit_finding(
    request: Request,
    background_tasks: BackgroundTasks,
    title: str = Form(..., min_length=2, max_length=200),
    researcher_name: str = Form(..., min_length=2, max_length=100),
    researcher_email: str = Form(...),
    submitter_eth_address: str = Form(""),
    finding_text: Optional[str] = Form(None),
    pdf_file: Optional[UploadFile] = File(None),
):
    # ── Extract content ──────────────────────────────────────────────────────
    content = ""
    pdf_filename: Optional[str] = None

    if pdf_file and pdf_file.filename:
        try:
            from pypdf import PdfReader  # type: ignore
            raw = await pdf_file.read()
            reader = PdfReader(io.BytesIO(raw))
            pages = [p.extract_text() or "" for p in reader.pages]
            content = "\n\n".join(pages).strip()
            pdf_filename = pdf_file.filename
        except Exception as exc:
            raise HTTPException(400, detail=f"PDF extraction failed: {exc}")
    elif finding_text and finding_text.strip():
        content = finding_text.strip()
    else:
        raise HTTPException(400, detail="Provide either finding_text or a PDF attachment")

    if not content:
        raise HTTPException(400, detail="No readable content found in submission")

    # ── Duplicate check ──────────────────────────────────────────────────────
    db = request.app.state.db
    content_hash = compute_content_hash(content)
    title_hash = compute_title_hash(title)

    # Fast-path: exact/near-exact hash match (free, no AI call)
    dup = await check_duplicate(db, content_hash, title_hash)

    # Semantic-path: AI comparison for paraphrased / differently-worded
    # duplicates (only runs if the hash check found no exact match)
    if not dup:
        dup = await check_semantic_duplicate(db, title, content)

    if dup:
        raise HTTPException(
            409,
            detail={
                "message": "This finding has already been submitted.",
                "existing_id": dup["existing_id"],
                "existing_title": dup["existing_title"],
                "match_type": dup["match_type"],
                "reasoning": dup.get("reasoning", ""),
            },
        )

    # ── Persist ──────────────────────────────────────────────────────────────
    finding_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    doc = {
        "_id":                    finding_id,
        "title":                  title,
        "researcher_name":        researcher_name,
        "researcher_email":       researcher_email.strip().lower(),
        "submitter_eth_address":  submitter_eth_address.strip(),
        "content":                content,
        "content_hash":           content_hash,
        "pdf_filename":           pdf_filename,
        "status":                 "pending",
        "spec_analysis":          None,
        "spec_verdict":           None,
        "sdk_analysis":           None,
        "sdk_verdict":            None,
        "overall_verdict":        None,
        "error_message":          None,
        "blockchain_status":      None,
        "tx_hash":                None,
        "block_number":           None,
        "block_hash":             None,
        "from_address":           None,
        "to_address":             None,
        "chain_name":             None,
        "explorer_url":           None,
        "blockchain_error":       None,
        "created_at":             now,
        "verified_at":            None,
        "recorded_at":            None,
    }

    try:
        await db.findings.insert_one(doc)
    except DuplicateKeyError:
        # Unique index on content_hash fired — look up the original finding
        original = await db.findings.find_one({"content_hash": content_hash})
        raise HTTPException(
            409,
            detail={
                "message": "This finding has already been submitted.",
                "existing_id": original["_id"] if original else "unknown",
                "existing_title": original.get("title", "") if original else "",
                "match_type": "content",
                "reasoning": "Identical content was previously submitted.",
            },
        )
    await register_finding(db, finding_id, title, content_hash, title_hash)
    background_tasks.add_task(_run_verification, finding_id, db)

    return {"id": finding_id, "status": "pending"}


@router.get("/findings")
async def list_findings(
    request: Request,
    email: Optional[str] = None,
    verdict: Optional[str] = None,
    blockchain_only: bool = False,
):
    """List findings with optional filters.

    - ``email``          — restrict to a specific researcher's email
    - ``verdict``        — filter by overall_verdict (e.g. ``VALID``)
    - ``blockchain_only``— only return findings with blockchain_status='recorded'
    """
    db = request.app.state.db
    query: dict = {}
    if email:
        query["researcher_email"] = email.strip().lower()
    if verdict:
        query["overall_verdict"] = verdict.upper()
    if blockchain_only:
        query["blockchain_status"] = "recorded"
    out = []
    async for doc in db.findings.find(query, sort=[("created_at", -1)], limit=200):
        doc["id"] = doc.pop("_id")
        out.append(doc)
    return out


@router.get("/findings/{finding_id}")
async def get_finding(finding_id: str, request: Request):
    db = request.app.state.db
    doc = await db.findings.find_one({"_id": finding_id})
    if not doc:
        raise HTTPException(404, detail="Finding not found")
    doc["id"] = doc.pop("_id")
    return doc


@router.post("/findings/{finding_id}/reverify")
async def reverify_finding(
    finding_id: str, request: Request, background_tasks: BackgroundTasks
):
    db = request.app.state.db
    doc = await db.findings.find_one({"_id": finding_id})
    if not doc:
        raise HTTPException(404, detail="Finding not found")

    await db.findings.update_one(
        {"_id": finding_id},
        {
            "$set": {
                "status":           "pending",
                "spec_analysis":    None,
                "spec_verdict":     None,
                "sdk_analysis":     None,
                "sdk_verdict":      None,
                "overall_verdict":  None,
                "error_message":    None,
                "blockchain_status": None,
                "tx_hash":          None,
                "block_number":     None,
                "block_hash":       None,
                "explorer_url":     None,
                "blockchain_error": None,
                "verified_at":      None,
                "recorded_at":      None,
            }
        },
    )
    background_tasks.add_task(_run_verification, finding_id, db)
    return {"message": "Re-verification started"}
