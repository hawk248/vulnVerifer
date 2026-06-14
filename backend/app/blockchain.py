"""Polygon Amoy on-chain record creation for verified findings.

Polygon Amoy testnet: ~2 second block times, free test MATIC from
https://faucet.polygon.technology/ — far faster than Ethereum Sepolia.

Uses a funded app wallet (ETH_PRIVATE_KEY) to broadcast a 0-value
transaction. The calldata carries compact JSON metadata:
  { app, finding_id, content_hash, submitter, title }

The transaction hash is the immutable "block handle" returned to
the submitter.

Configuration (add to .env):
  ETH_PRIVATE_KEY  — 0x-prefixed private key of the app's signing wallet
                     (fund with test MATIC from the Polygon faucet)
  ETH_RPC_URL      — optional override; defaults to the public Amoy RPC
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os

# Polygon Amoy testnet — ~2 s block times
AMOY_CHAIN_ID = 80002
AMOY_PUBLIC_RPC = "https://rpc-amoy.polygon.technology/"
AMOY_EXPLORER = "https://amoy.polygonscan.com/tx/{tx_hash}"


def is_blockchain_configured() -> bool:
    """Only the private key is strictly required; RPC has a public fallback."""
    return bool(os.environ.get("ETH_PRIVATE_KEY"))


def compute_content_hash(content: str) -> str:
    """Stable SHA-256 fingerprint of normalised content (for dedup)."""
    normalised = " ".join(content.lower().split())
    return hashlib.sha256(normalised.encode()).hexdigest()


def _record_sync(
    finding_id: str,
    content_hash: str,
    submitter_address: str,
    title: str,
) -> dict:
    """Blocking Web3 call — always run via asyncio thread executor."""
    from web3 import Web3  # type: ignore

    rpc_url = os.environ.get("ETH_RPC_URL", "").strip() or AMOY_PUBLIC_RPC
    private_key = os.environ.get("ETH_PRIVATE_KEY", "").strip()
    if not private_key:
        raise RuntimeError("ETH_PRIVATE_KEY must be configured to record on-chain")

    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 30}))
    if not w3.is_connected():
        raise RuntimeError(f"Cannot connect to RPC at {rpc_url}")

    account = w3.eth.account.from_key(private_key)

    meta = json.dumps(
        {
            "app": "matter-security-bounty",
            "fid": finding_id,
            "hash": content_hash[:16],
            "sub": submitter_address or "",
            "title": title[:60],
        },
        separators=(",", ":"),
    )
    calldata = "0x" + meta.encode().hex()

    to_addr = (
        submitter_address
        if submitter_address and Web3.is_address(submitter_address)
        else account.address
    )

    nonce = w3.eth.get_transaction_count(account.address)

    tx: dict = {
        "from": account.address,
        "to": to_addr,
        "value": 0,
        "nonce": nonce,
        "data": calldata,
        "chainId": AMOY_CHAIN_ID,
    }

    try:
        tx["gas"] = w3.eth.estimate_gas(tx) + 5000
    except Exception:
        tx["gas"] = 80_000

    # Polygon uses legacy gas pricing (type 0) more reliably on Amoy
    tx["gasPrice"] = w3.eth.gas_price

    signed = w3.eth.account.sign_transaction(tx, private_key)
    raw_tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)

    # Amoy confirms in ~2 s; timeout set conservatively at 60 s
    receipt = w3.eth.wait_for_transaction_receipt(raw_tx_hash, timeout=60)
    tx_hash_hex = raw_tx_hash.hex()

    return {
        "tx_hash": tx_hash_hex,
        "block_number": receipt["blockNumber"],
        "block_hash": receipt["blockHash"].hex(),
        "from_address": account.address,
        "to_address": to_addr,
        "chain_id": AMOY_CHAIN_ID,
        "chain_name": "Polygon Amoy",
        "explorer_url": AMOY_EXPLORER.format(tx_hash=tx_hash_hex),
    }


async def create_finding_record(
    finding_id: str,
    content_hash: str,
    submitter_address: str,
    title: str,
) -> dict:
    """Async entry-point — runs the blocking Web3 call in a thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        _record_sync,
        finding_id,
        content_hash,
        submitter_address,
        title,
    )
