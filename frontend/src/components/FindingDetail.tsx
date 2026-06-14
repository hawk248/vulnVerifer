import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  BookOpen,
  Code2,
  Calendar,
  Mail,
  User,
  FileText,
  ShieldAlert,
  Link2,
  Blocks,
  Wallet,
  CheckCircle2,
  Loader2,
  XCircle,
  PenLine,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { SeverityBadge } from './SeverityBadge';
import { StatusIndicator } from './StatusIndicator';
import { VerdictBadge } from './VerdictBadge';
import { useMetaMask } from '@/hooks/useMetaMask';
import type { Finding, Verdict } from '@/types';

interface Props {
  findingId: string;
  onBack: () => void;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AnalysisPanel({
  title,
  icon: Icon,
  label,
  analysis,
  verdict,
}: {
  title: string;
  icon: React.ElementType;
  label: string;
  analysis?: string;
  verdict?: Verdict;
}) {
  return (
    <Card className="border-border/60 flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-xs">{label}</CardDescription>
            </div>
          </div>
          {verdict && <VerdictBadge verdict={verdict} />}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {analysis ? (
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground font-sans bg-muted/40 rounded-lg p-4 overflow-auto max-h-[480px]">
            {analysis}
          </pre>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3 text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin text-primary/50" />
            <p className="text-sm">Verification in progress…</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Row inside the blockchain info table */
function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <Icon className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
      <span className="text-xs text-emerald-800 font-medium w-20 shrink-0">{label}</span>
      <span className="flex-1 min-w-0">{value}</span>
    </div>
  );
}

/** Copies text to clipboard and shows a tick for 2 s */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="ml-1 inline-flex items-center text-emerald-600 hover:text-emerald-800 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

/** On-chain record card + MetaMask "store in wallet" flow */
function BlockchainPanel({ finding }: { finding: Finding }) {
  const { address, connecting, isAvailable, connect, signMessage } = useMetaMask();

  const [signing, setSigning] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);

  const bs = finding.blockchain_status;
  const isRecorded = bs === 'recorded' && Boolean(finding.tx_hash);

  if (!bs && finding.overall_verdict !== 'VALID') return null;

  /** Build a human-readable claim message the user signs with MetaMask */
  const buildClaimMessage = () =>
    [
      '=== Matter Security Bug Bounty — Block Handle Claim ===',
      '',
      `Finding:    ${finding.title}`,
      `Finding ID: ${finding.id}`,
      `Block Handle (Tx Hash): ${finding.tx_hash}`,
      `Block Number: ${finding.block_number}`,
      `Network: ${finding.chain_name ?? 'Ethereum Sepolia'}`,
      `Explorer: ${finding.explorer_url}`,
      '',
      `Claimed by: ${address}`,
      `Timestamp: ${new Date().toISOString()}`,
      '',
      'By signing this message I confirm I am the submitter of the above',
      'security finding and I claim ownership of its on-chain record.',
    ].join('\n');

  const handleStoreInWallet = async () => {
    setSignError(null);

    // Connect first if not already connected
    let signer = address;
    if (!signer) {
      signer = await connect();
      if (!signer) return;
    }

    setSigning(true);
    try {
      const msg = buildClaimMessage();
      const sig = await signMessage(msg);
      if (sig) setSignature(sig);
      else setSignError('Signing was cancelled or failed.');
    } catch (err) {
      setSignError(err instanceof Error ? err.message : 'Signing failed');
    } finally {
      setSigning(false);
    }
  };

  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
            <Blocks className="h-4 w-4 text-emerald-700" />
          </div>
          <div>
            <CardTitle className="text-base text-emerald-900">On-Chain Record</CardTitle>
            <CardDescription className="text-xs">
              {finding.chain_name ?? 'Ethereum Sepolia Testnet'}
            </CardDescription>
          </div>
          <div className="ml-auto">
            {bs === 'recorded' && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            {bs === 'recording' && <Loader2 className="h-5 w-5 text-emerald-500 animate-spin" />}
            {bs === 'failed' && <XCircle className="h-5 w-5 text-destructive" />}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Recording in progress */}
        {bs === 'recording' && (
          <p className="text-sm text-emerald-700">Broadcasting to {finding.chain_name ?? 'Sepolia'}…</p>
        )}

        {/* Recorded — show tx details */}
        {isRecorded && (
          <div className="rounded-lg border border-emerald-200 bg-white/60 divide-y divide-emerald-100 text-sm">
            <InfoRow
              icon={Link2}
              label="Tx Hash"
              value={
                <span className="flex items-center gap-1 min-w-0">
                  <a
                    href={finding.explorer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:underline truncate"
                  >
                    {finding.tx_hash}
                  </a>
                  <CopyButton text={finding.tx_hash!} />
                </span>
              }
            />
            <InfoRow
              icon={Blocks}
              label="Block"
              value={<span className="font-mono text-xs">{finding.block_number?.toLocaleString()}</span>}
            />
            {finding.submitter_eth_address && (
              <InfoRow
                icon={Wallet}
                label="Submitter"
                value={
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="font-mono text-xs truncate">{finding.submitter_eth_address}</span>
                    <CopyButton text={finding.submitter_eth_address} />
                  </span>
                }
              />
            )}
          </div>
        )}

        {/* Explorer link */}
        {isRecorded && finding.explorer_url && (
          <a
            href={finding.explorer_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            View on Etherscan <Link2 className="h-3 w-3" />
          </a>
        )}

        {/* Blockchain error */}
        {bs === 'failed' && (
          <p className="text-xs text-destructive">
            {finding.blockchain_error ?? 'Failed to write on-chain record.'}
          </p>
        )}

        {/* Pending verdict */}
        {!bs && finding.overall_verdict === 'VALID' && (
          <p className="text-sm text-emerald-700">Awaiting on-chain record…</p>
        )}

        {/* ── Store in wallet ──────────────────────────────────────────── */}
        {isRecorded && !signature && (
          <div className="border-t border-emerald-200 pt-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-emerald-900">Store Block Handle in Wallet</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Sign a free MetaMask message to cryptographically link this finding's
                block handle to your wallet — no gas required.
              </p>
            </div>

            {!isAvailable && (
              <p className="text-xs text-muted-foreground">
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  Install MetaMask
                </a>{' '}
                to store the block handle in your wallet.
              </p>
            )}

            {isAvailable && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                onClick={handleStoreInWallet}
                disabled={signing || connecting}
              >
                {signing || connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PenLine className="h-4 w-4" />
                )}
                {connecting ? 'Connecting…' : signing ? 'Waiting for signature…' : 'Sign & Store in Wallet'}
              </Button>
            )}

            {signError && (
              <p className="text-xs text-destructive">{signError}</p>
            )}
          </div>
        )}

        {/* ── Wallet receipt ───────────────────────────────────────────── */}
        {signature && (
          <div className="border-t border-emerald-200 pt-4 space-y-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-sm font-semibold text-emerald-900">Block Handle Stored in Wallet</p>
            </div>
            <p className="text-xs text-emerald-700">
              Your wallet (<span className="font-mono">{address?.slice(0, 10)}…{address?.slice(-6)}</span>)
              signed a claim for this finding's on-chain record. Keep this signature as your
              ownership receipt.
            </p>
            <div className="rounded-lg border border-emerald-200 bg-white/60 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-emerald-800 uppercase tracking-wide">
                  Wallet Signature (EIP-191)
                </span>
                <CopyButton text={signature} />
              </div>
              <p className="font-mono text-xs text-muted-foreground break-all leading-relaxed">
                {signature}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              This signature proves your wallet signed the finding claim at{' '}
              {new Date().toLocaleString()}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FindingDetail({ findingId, onBack }: Props) {
  const [finding, setFinding] = useState<Finding | null>(null);
  const [loading, setLoading] = useState(true);
  const [reverifying, setReverifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFinding = useCallback(async () => {
    try {
      const res = await fetch(`/api/findings/${findingId}`);
      if (!res.ok) throw new Error('Not found');
      setFinding(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [findingId]);

  useEffect(() => {
    fetchFinding();
  }, [fetchFinding]);

  useEffect(() => {
    if (!finding) return;
    const inProgress =
      finding.status === 'pending' ||
      finding.status === 'verifying' ||
      finding.blockchain_status === 'recording';
    if (!inProgress) return;
    const t = setTimeout(fetchFinding, 3000);
    return () => clearTimeout(t);
  }, [finding, fetchFinding]);

  const handleReverify = async () => {
    setReverifying(true);
    try {
      await fetch(`/api/findings/${findingId}/reverify`, { method: 'POST' });
      await fetchFinding();
    } finally {
      setReverifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !finding) {
    return (
      <div className="text-center py-20">
        <p className="text-destructive mb-4">{error ?? 'Finding not found'}</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-start justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          All Findings
        </Button>
        <div className="flex items-center gap-2">
          <StatusIndicator status={finding.status} />
          {(finding.status === 'verified' || finding.status === 'failed') && (
            <Button variant="outline" size="sm" onClick={handleReverify} disabled={reverifying}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${reverifying ? 'animate-spin' : ''}`} />
              Re-verify
            </Button>
          )}
        </div>
      </div>

      {/* Overview card */}
      <Card className="border-border/60">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold leading-snug">{finding.title}</h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />{finding.researcher_name}
                </span>
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />{finding.researcher_email}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />{fmt(finding.created_at)}
                </span>
                {finding.pdf_filename && (
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />{finding.pdf_filename}
                  </span>
                )}
                {finding.submitter_eth_address && (
                  <span className="flex items-center gap-1.5 font-mono text-xs">
                    <Wallet className="h-3.5 w-3.5" />
                    {finding.submitter_eth_address.slice(0, 10)}…{finding.submitter_eth_address.slice(-6)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {finding.severity && <SeverityBadge severity={finding.severity} />}
              {finding.overall_verdict && finding.status === 'verified' && (
                <VerdictBadge verdict={finding.overall_verdict} />
              )}
            </div>
          </div>

          {/* Content preview */}
          <div className="rounded-lg bg-muted/50 border border-border/60 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Submission Content
            </p>
            <pre className="whitespace-pre-wrap text-xs text-foreground font-sans leading-relaxed max-h-48 overflow-auto">
              {finding.content}
            </pre>
          </div>

          {finding.status === 'failed' && finding.error_message && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              Verification error: {finding.error_message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blockchain record + wallet flow */}
      {(finding.overall_verdict === 'VALID' || finding.blockchain_status) && (
        <BlockchainPanel finding={finding} />
      )}

      {/* AI verification panels */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          AI Verification Analysis
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AnalysisPanel
            title="Matter Specification"
            icon={BookOpen}
            label="CSA Matter 1.5 Assistant"
            analysis={finding.spec_analysis ?? undefined}
            verdict={finding.spec_verdict ?? undefined}
          />
          <AnalysisPanel
            title="Matter SDK"
            icon={Code2}
            label="ConnectedHomeIP Expert"
            analysis={finding.sdk_analysis ?? undefined}
            verdict={finding.sdk_verdict ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
