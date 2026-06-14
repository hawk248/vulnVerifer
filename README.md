**A Dual-Review AI and Blockchain System for Vulnerability Disclosure in Matter Protocol Implementations**

**Abstract**

This paper describes the design and implementation of a vulnerability submission and verification platform tailored to the Matter IoT security standard. The system combines asynchronous dual-track AI review — one reviewer grounded in the Matter specification, a second in the ConnectedHomeIP SDK — with immutable on-chain recording of confirmed findings. A multi-layer duplicate detection mechanism prevents redundant submissions. The result is a trustworthy, auditable bug bounty pipeline that bridges human researchers, AI analysis, and decentralized ledger immutability.

**1. Introduction**

The Matter protocol, maintained by the Connectivity Standards Alliance (CSA), defines a unified security and interoperability model for IoT devices. As adoption accelerates, coordinated vulnerability disclosure becomes critical: researchers must have a reliable channel to report findings, and maintainers must have a trustworthy mechanism to evaluate them consistently and record confirmed issues without the possibility of tampering.

Existing bug bounty platforms are generic. They provide submission forms and triage queues but no domain knowledge, no automated technical validation, and no permanent public record. This system addresses all three gaps:

1. **Domain-specific AI review** evaluates each submission against both the Matter specification and its reference SDK implementation.
2. **Blockchain recording** creates a tamper-evident, time-stamped ledger entry for every confirmed finding.
3. **Semantic duplicate detection** prevents redundant findings from polluting the corpus.

**2. System Architecture**

The system follows a three-tier architecture:

┌──────────────────────────────────┐

│ React Frontend │

│ (submission, list, detail, │

│ blockchain view, MetaMask) │

└────────────┬─────────────────────┘

│ HTTP / SSE

┌────────────▼─────────────────────┐

│ FastAPI Backend │

│ (routing, background tasks, │

│ AI orchestration, Web3) │

└────────────┬─────────────────────┘

│ async motor driver

┌────────────▼─────────────────────┐

│ MongoDB │

│ (findings, hashes, blockchain │

│ metadata, analysis results) │

└──────────────────────────────────┘

The backend exposes a REST API consumed by the frontend. Long-running verification tasks are dispatched as FastAPI background tasks so that the submission endpoint returns immediately with a pending status, and the client polls for updates.

**3. Data Model**

Each finding is stored as a single document with the following logical structure:

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| finding\_id | string | Unique identifier |
| title | string | Human-readable title |
| content | string | Full vulnerability description |
| content\_hash | string | SHA-256 of normalized content |
| researcher\_name | string | Submitter name |
| researcher\_email | string | Submitter email |
| submitter\_eth\_address | string (opt.) | Linked Ethereum wallet |
| status | enum | pending → verifying → verified / failed |
| spec\_verdict | enum | VALID / INVALID / NEEDS\_FURTHER\_REVIEW |
| sdk\_verdict | enum | Same |
| overall\_verdict | enum | VALID only if both pass |
| spec\_analysis | string | Narrative from specification reviewer |
| sdk\_analysis | string | Narrative from SDK reviewer |
| blockchain\_status | enum | pending / recorded / failed |
| tx\_hash | string (opt.) | On-chain transaction hash |
| block\_number | int (opt.) | Block number of recording |
| explorer\_url | string (opt.) | Block explorer deep-link |
| created\_at | datetime | Submission timestamp |
| recorded\_at | datetime | On-chain recording timestamp |

A unique index on content\_hash enforces database-level deduplication as a final safety net.

**4. Submission Pipeline**

**4.1 Input Modes**

Researchers may submit findings in two forms:

* **Plain text** — entered directly in the submission form.
* **PDF upload** — the backend extracts text from all pages using pypdf and concatenates them into a single content string for analysis.

Both paths normalize to the same content field before hashing or AI processing.

**4.2 Duplicate Detection (Three Layers)**

Duplicate suppression runs before any AI work is triggered:

1. **Hash check.** The SHA-256 of the normalized content is computed. If a document with the same content\_hash already exists in the database, the submission is immediately rejected with a reference to the existing finding — no AI calls are made.
2. **Semantic check.** For near-duplicates (paraphrased descriptions, reorganized sections), the hash alone is insufficient. The backend invokes an AI similarity comparison between the candidate submission and recent findings, identifying functionally equivalent reports even when the surface text differs.
3. **Database constraint.** The unique index on content\_hash acts as a transactional backstop against any race condition in steps 1 and 2.

When a duplicate is detected at any layer, the submitter is shown a direct link to the original finding.

**5. AI Verification Pipeline**

Verification runs as a background task immediately after a finding is persisted in pending state. Two independent reviewers execute in parallel.

**5.1 Matter Specification Reviewer**

This reviewer is grounded in the full CSA Matter 1.5 specification via a pre-configured Understand Tech assistant (l1MngDEBJB8zxO5B7Dj7). The assistant has access to the specification corpus and evaluates:

* Whether the claimed vulnerability corresponds to a real mechanism described in the specification.
* The severity and attack surface (physical access, network-adjacent, remote).
* Whether the specification already prescribes a mitigation.

The reviewer returns a structured verdict: VALID, INVALID, or NEEDS\_FURTHER\_REVIEW, together with a free-text analysis narrative.

**5.2 Matter SDK Reviewer**

This reviewer uses Claude (claude-sonnet-4-6) with a system prompt encoding deep expertise in the ConnectedHomeIP reference SDK. It evaluates:

* Whether the described behavior is reproducible in the SDK's implementation of Secure Channel, commissioning flows, credential management, or transport security.
* The practical exploitability given the SDK's current codebase.
* Any relevant SDK component or module implicated.

It also returns a structured VALID / INVALID / NEEDS\_FURTHER\_REVIEW verdict plus narrative.

**5.3 Verdict Aggregation**

overall\_verdict = VALID iff spec\_verdict == VALID

and sdk\_verdict == VALID

Any INVALID or NEEDS\_FURTHER\_REVIEW from either reviewer yields a non-VALID overall verdict. Only VALID overall findings proceed to blockchain recording.

**5.4 Re-verification**

A POST /api/findings/{finding\_id}/reverify endpoint allows maintainers to re-trigger the full verification pipeline for any finding — useful when the AI assistants are updated or when a researcher has clarified their submission.

**6. Blockchain Recording**

**6.1 Rationale**

On-chain recording provides three properties that a centralized database cannot:

* **Immutability** — a confirmed finding cannot be silently deleted or retroactively modified.
* **Timestamping** — the block timestamp is generated by consensus, not by the platform operator.
* **Public auditability** — any party can independently verify the existence and content hash of a recorded finding without trusting this system.

**6.2 Mechanism**

When overall\_verdict is set to VALID, the backend submits a transaction to a configured EVM-compatible network (Polygon Amoy testnet or Ethereum Sepolia) containing:

* finding\_id — internal identifier.
* content\_hash — SHA-256 of the submission content.
* submitter\_eth\_address — researcher's Ethereum address (if provided).
* title — human-readable title.

The resulting tx\_hash, block\_number, and explorer\_url are written back to the finding document.

**6.3 Researcher Ownership Claims**

Researchers who provided an Ethereum address may sign a challenge message via MetaMask (EIP-191 personal sign). The signature is verified server-side, cryptographically linking the finding to a wallet the researcher controls. This establishes a verifiable provenance claim without the platform holding private keys.

**7. Frontend**

**7.1 Views**

| **View** | **Purpose** |
| --- | --- |
| **Finding List** | Grid of cards; search by title/researcher, filter by severity |
| **Submit Form** | Text or PDF input, optional MetaMask connection, duplicate warning |
| **Finding Detail** | Full analysis, both AI verdicts, blockchain status and explorer link |
| **Blockchain View** | Visual chain of confirmed on-chain findings; filterable by researcher email |

**7.2 Real-time Updates**

The client polls the detail endpoint every 5 seconds while a finding is in pending or verifying state, updating the UI as the background task progresses through the verification pipeline.

**7.3 MetaMask Integration**

A custom useMetaMask() hook manages wallet connection state, account retrieval, and message signing. The wallet address is optional at submission time but required to sign an ownership claim after a finding is confirmed.

**8. API Reference**

| **Method** | **Path** | **Description** |
| --- | --- | --- |
| POST | /api/findings | Submit a new finding (text or PDF) |
| GET | /api/findings | List findings (filters: email, verdict, blockchain\_only) |
| GET | /api/findings/{id} | Retrieve a single finding with full analysis |
| POST | /api/findings/{id}/reverify | Re-run the verification pipeline |
| GET | /api/health | Service health check |

**9. Security Considerations**

* **Content hashing** uses SHA-256. Collisions are computationally infeasible; the hash is treated as a canonical fingerprint for deduplication and on-chain recording.
* **Wallet signatures** use EIP-191 (personal\_sign), preventing replay across different message contexts. The backend verifies the recovered address matches the stored submitter\_eth\_address.
* **AI verdict integrity** — both reviewers are invoked independently. Neither can influence the other's analysis. The aggregation rule (both must be VALID) is enforced server-side and cannot be overridden by the frontend.
* **PDF extraction** is performed server-side; no client-side PDF parsing occurs, preventing malicious PDF payloads from executing in the browser.

**10. Conclusion**

This system demonstrates that domain-specific AI review and decentralized ledger recording can be practically combined into a coherent vulnerability disclosure pipeline. The dual-reviewer architecture reduces false positives relative to single-model review; blockchain recording provides tamper-evident provenance that a centralized database cannot; and multi-layer duplicate detection keeps the corpus clean as submissions accumulate. The design is extensible — additional specialist reviewers (e.g., a firmware-focused reviewer, a cryptographic protocol reviewer) can be added to the verification pipeline without restructuring the data model or API.

*System implemented on FastAPI (Python), React (TypeScript), MongoDB, Web3.py, Anthropic Claude, and the Understand Tech LLM gateway. Network targets: Polygon Amoy / Ethereum Sepolia.*