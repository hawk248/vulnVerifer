import { useState, useEffect, useCallback } from 'react';
import {
  Link2,
  ExternalLink,
  Search,
  RefreshCw,
  Blocks,
  Clock,
  Hash,
  CheckCircle2,
  Loader2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Finding } from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortHash(hash: string | undefined, head = 8, tail = 6): string {
  if (!hash) return '—';
  if (hash.length <= head + tail + 3) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

function formatTs(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Block card ────────────────────────────────────────────────────────────────

function BlockCard({
  finding,
  index,
  isLast,
  onClick,
}: {
  finding: Finding;
  index: number;
  isLast: boolean;
  onClick: () => void;
}) {
  const recorded = finding.blockchain_status === 'recorded';
  const recording = finding.blockchain_status === 'recording';
  const failed = finding.blockchain_status === 'failed';

  return (
    <div className="relative flex flex-col items-center">
      {/* ── Block card ─────────────────────────────────────────────────── */}
      <div
        onClick={onClick}
        className={cn(
          'w-full rounded-xl border bg-card shadow-sm cursor-pointer',
          'transition-all duration-200 hover:shadow-md hover:-translate-y-0.5',
          recorded
            ? 'border-emerald-200 hover:border-emerald-300'
            : recording
              ? 'border-amber-200 hover:border-amber-300'
              : failed
                ? 'border-destructive/30 hover:border-destructive/50'
                : 'border-border',
        )}
      >
        {/* Block header stripe */}
        <div
          className={cn(
            'flex items-center justify-between rounded-t-xl px-4 py-2.5 text-xs font-mono',
            recorded
              ? 'bg-emerald-50 text-emerald-700 border-b border-emerald-100'
              : recording
                ? 'bg-amber-50 text-amber-700 border-b border-amber-100'
                : failed
                  ? 'bg-destructive/5 text-destructive border-b border-destructive/10'
                  : 'bg-muted text-muted-foreground border-b border-border',
          )}
        >
          <div className="flex items-center gap-2">
            {recorded ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : recording ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
            ) : failed ? (
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span>
              {recorded
                ? `Block #${finding.block_number ?? '—'} · ${finding.chain_name ?? 'On-chain'}`
                : recording
                  ? 'Recording to chain…'
                  : failed
                    ? 'Chain record failed'
                    : 'Verified · Off-chain'}
            </span>
          </div>
          <span className="text-muted-foreground/70">#{index + 1}</span>
        </div>

        {/* Block body */}
        <div className="p-4 space-y-3">
          <div>
            <p className="font-semibold text-sm text-foreground leading-snug line-clamp-2">
              {finding.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {finding.researcher_name}
            </p>
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-1 gap-1.5 text-xs">
            {/* Finding ID */}
            <div className="flex items-center gap-2">
              <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">ID</span>
              <span className="font-mono text-foreground/80 truncate">
                {shortHash(finding.id, 8, 4)}
              </span>
            </div>

            {/* Content hash */}
            {finding.content_hash && (
              <div className="flex items-center gap-2">
                <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Hash</span>
                <span className="font-mono text-foreground/80 truncate">
                  {shortHash(finding.content_hash)}
                </span>
              </div>
            )}

            {/* Tx hash */}
            {finding.tx_hash && (
              <div className="flex items-center gap-2">
                <Blocks className="h-3 w-3 text-emerald-600 shrink-0" />
                <span className="text-muted-foreground">Tx</span>
                <span className="font-mono text-emerald-700 truncate">
                  {shortHash(finding.tx_hash)}
                </span>
              </div>
            )}

            {/* Timestamp */}
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">
                {finding.recorded_at ? 'Recorded' : 'Submitted'}
              </span>
              <span className="text-foreground/70">
                {formatTs(finding.recorded_at ?? finding.created_at)}
              </span>
            </div>
          </div>

          {/* Footer: verdict + explorer link */}
          <div className="flex items-center justify-between pt-1 border-t border-border/60">
            <Badge
              variant={
                finding.overall_verdict === 'VALID'
                  ? 'default'
                  : finding.overall_verdict === 'INVALID'
                    ? 'destructive'
                    : 'secondary'
              }
              className="text-[10px] px-1.5 py-0"
            >
              {finding.overall_verdict ?? finding.status}
            </Badge>

            {finding.explorer_url && (
              <a
                href={finding.explorer_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                View on {finding.chain_name ?? 'Explorer'}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Chain connector ────────────────────────────────────────────── */}
      {!isLast && (
        <div className="flex flex-col items-center my-1 select-none" aria-hidden>
          <div className="w-px h-3 bg-border" />
          <Link2 className="h-4 w-4 text-muted-foreground/50 rotate-90 my-0.5" />
          <div className="w-px h-3 bg-border" />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onOpenFinding: (id: string) => void;
}

export function BlockchainView({ onOpenFinding }: Props) {
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const load = useCallback(async (filterEmail: string) => {
    setLoading(true);
    try {
      // Show all VALID findings — on-chain status shown per-block
      const params = new URLSearchParams({ verdict: 'VALID' });
      if (filterEmail.trim()) params.set('email', filterEmail.trim().toLowerCase());
      const res = await fetch(`/api/findings?${params}`);
      if (res.ok) setFindings(await res.json());
    } catch {
      // swallow
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, []);

  // Load all blockchain findings on mount
  useEffect(() => {
    load('');
  }, [load]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedEmail(email.trim());
    load(email.trim());
  };

  const handleClear = () => {
    setEmail('');
    setSubmittedEmail('');
    load('');
  };

  const onChain  = findings.filter((f) => f.blockchain_status === 'recorded');
  const recording = findings.filter((f) => f.blockchain_status === 'recording');
  const verified  = findings.filter((f) => !f.blockchain_status || f.blockchain_status === 'failed');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <form onSubmit={handleFilter} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="bc-email" className="text-xs text-muted-foreground">
              Filter by researcher email to see your submissions
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="bc-email"
                type="email"
                className="pl-9"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm" className="gap-1.5">
              <Search className="h-3.5 w-3.5" />
              Filter
            </Button>
            {submittedEmail && (
              <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
                Clear
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => load(submittedEmail)}
              className="gap-1.5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </form>

        {submittedEmail && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing on-chain findings for{' '}
            <span className="font-medium text-foreground">{submittedEmail}</span>
          </p>
        )}
      </div>

      {/* ── Stats strip ────────────────────────────────────────────────── */}
      {fetched && findings.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm">
            <Blocks className="h-4 w-4 text-primary" />
            <span className="text-primary font-medium">{findings.length} valid finding{findings.length !== 1 ? 's' : ''}</span>
          </div>
          {onChain.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-emerald-700 font-medium">{onChain.length} recorded on-chain</span>
            </div>
          )}
          {recording.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
              <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
              <span className="text-amber-700 font-medium">{recording.length} recording…</span>
            </div>
          )}
          {verified.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{verified.length} verified (off-chain)</span>
            </div>
          )}
        </div>
      )}

      {/* ── Chain ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : findings.length === 0 && fetched ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Blocks className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No valid findings yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              {submittedEmail
                ? 'No validated findings found for this email address.'
                : 'Findings marked VALID by the AI analysts will appear here.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto">
          {/* Genesis label */}
          {findings.length > 0 && (
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground font-mono">GENESIS</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          {findings.map((f, i) => (
            <BlockCard
              key={f.id}
              finding={f}
              index={i}
              isLast={i === findings.length - 1}
              onClick={() => onOpenFinding(f.id)}
            />
          ))}

          {/* Tail label */}
          {findings.length > 0 && (
            <div className="flex items-center gap-3 mt-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground font-mono">LATEST</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
