import { useEffect, useState, useCallback } from 'react';
import {
  Shield,
  ListFilter,
  PlusCircle,
  Search,
  RefreshCw,
  Bug,
  Blocks,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SubmitForm } from '@/components/SubmitForm';
import { FindingCard } from '@/components/FindingCard';
import { FindingDetail } from '@/components/FindingDetail';
import { BlockchainView } from '@/components/BlockchainView';
import { cn } from '@/lib/utils';
import type { Finding } from '@/types';

type View = 'list' | 'submit' | 'detail';
type ListTab = 'findings' | 'blockchain';

function useFindings() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/findings');
      if (res.ok) setFindings(await res.json());
    } catch {
      // Swallow transient network errors during background polling
      // (e.g. backend restarting after a deploy). The interval will retry.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Poll every 5 s so statuses update without manual refresh
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  return { findings, loading, refresh };
}

export default function App() {
  const [view, setView] = useState<View>('list');
  const [listTab, setListTab] = useState<ListTab>('findings');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const { findings, loading, refresh } = useFindings();

  const handleSuccess = (id: string) => {
    refresh();
    setSelectedId(id);
    setView('detail');
  };

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView('detail');
  };

  const filteredFindings = findings.filter((f) => {
    const matchQ =
      !query ||
      f.title.toLowerCase().includes(query.toLowerCase()) ||
      f.researcher_name.toLowerCase().includes(query.toLowerCase());
    const matchS = !filterSeverity || f.severity === filterSeverity;
    return matchQ && matchS;
  });

  const counts = {
    total: findings.length,
    verified: findings.filter((f) => f.status === 'verified').length,
    pending: findings.filter(
      (f) => f.status === 'pending' || f.status === 'verifying',
    ).length,
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-gradient-to-b from-primary/8 via-background to-background"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="container mx-auto max-w-5xl px-4 py-12">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <header className="mb-10 animate-fade-in">
          <div className="flex items-center gap-2 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="text-sm font-semibold text-primary tracking-wide uppercase">
              Matter Security
            </span>
          </div>

          <h1 className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent mb-3">
            Bug Bounty &amp; Research Portal
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Submit vulnerability findings against the Matter protocol. Each
            submission is automatically verified by the{' '}
            <span className="font-medium text-foreground">
              Matter Specification
            </span>{' '}
            and{' '}
            <span className="font-medium text-foreground">Matter SDK</span> AI
            analysts.
          </p>

          {/* Stats */}
          <div className="flex flex-wrap gap-3 mt-6">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm">
              <Bug className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Total:</span>
              <span className="font-semibold">{counts.total}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm">
              <span className="text-emerald-600">Verified:</span>
              <span className="font-semibold text-emerald-700">
                {counts.verified}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
              <span className="text-amber-600">In Progress:</span>
              <span className="font-semibold text-amber-700">
                {counts.pending}
              </span>
            </div>
          </div>
        </header>

        {/* ── Detail view ──────────────────────────────────────────────── */}
        {view === 'detail' && selectedId && (
          <FindingDetail
            findingId={selectedId}
            onBack={() => setView('list')}
          />
        )}

        {/* ── Submit view ──────────────────────────────────────────────── */}
        {view === 'submit' && (
          <div className="animate-fade-in space-y-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView('list')}
              className="-ml-2 mb-2"
            >
              ← Back to findings
            </Button>
            <SubmitForm onSuccess={handleSuccess} onViewExisting={openDetail} />
          </div>
        )}

        {/* ── List view ────────────────────────────────────────────────── */}
        {view === 'list' && (
          <div className="animate-fade-in space-y-5">

            {/* ── Tab toggle ───────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Tabs */}
              <div className="flex rounded-lg border border-border bg-muted p-1 gap-1">
                <button
                  onClick={() => setListTab('findings')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    listTab === 'findings'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <ListFilter className="h-3.5 w-3.5" />
                  All Findings
                </button>
                <button
                  onClick={() => setListTab('blockchain')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    listTab === 'blockchain'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Blocks className="h-3.5 w-3.5" />
                  Blockchain
                </button>
              </div>

              {/* Actions — only shown on findings tab */}
              {listTab === 'findings' && (
                <Button
                  size="sm"
                  onClick={() => setView('submit')}
                  className="gap-1.5"
                >
                  <PlusCircle className="h-4 w-4" />
                  New Finding
                </Button>
              )}
            </div>

            {/* ── Findings tab ─────────────────────────────────────────── */}
            {listTab === 'findings' && (
              <div className="space-y-4">
                {/* Search + filter toolbar */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search findings…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>

                  {/* Severity filter */}
                  <div className="flex gap-1.5 flex-wrap">
                    {['', 'Critical', 'High', 'Medium', 'Low'].map((s) => (
                      <button
                        key={s}
                        onClick={() => setFilterSeverity(s)}
                        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          filterSeverity === s
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
                        }`}
                      >
                        {s || 'All'}
                      </button>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refresh}
                    className="shrink-0"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Refresh
                  </Button>
                </div>

                {/* Results */}
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : filteredFindings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                      <ListFilter className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {findings.length === 0 ? 'No findings yet' : 'No matches found'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {findings.length === 0
                          ? 'Be the first to submit a Matter protocol finding.'
                          : 'Try adjusting your search or filters.'}
                      </p>
                    </div>
                    {findings.length === 0 && (
                      <Button onClick={() => setView('submit')} className="gap-1.5">
                        <PlusCircle className="h-4 w-4" />
                        Submit First Finding
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {filteredFindings.map((f) => (
                      <FindingCard
                        key={f.id}
                        finding={f}
                        onClick={() => openDetail(f.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Blockchain tab ───────────────────────────────────────── */}
            {listTab === 'blockchain' && (
              <BlockchainView onOpenFinding={openDetail} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
