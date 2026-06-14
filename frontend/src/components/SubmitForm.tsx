import { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Upload,
  Send,
  AlertCircle,
  X,
  Wallet,
  CheckCircle2,
  Unplug,
  PartyPopper,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useMetaMask } from '@/hooks/useMetaMask';

interface Props {
  onSuccess: (id: string) => void;
  onViewExisting?: (id: string) => void;
}

type InputMode = 'text' | 'pdf';

/** Shown when the submitted content is an exact duplicate */
function DuplicateScreen({
  existingId,
  existingTitle,
  matchType,
  reasoning,
  onViewExisting,
  onReset,
}: {
  existingId: string;
  existingTitle?: string;
  matchType?: 'content' | 'title' | 'semantic';
  reasoning?: string;
  onViewExisting?: (id: string) => void;
  onReset: () => void;
}) {
  const isSemantic = matchType === 'semantic';
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="p-8 text-center space-y-4">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
            <PartyPopper className="h-7 w-7 text-amber-600" />
          </div>
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-amber-900">Already Submitted — Thank You!</h3>
          <p className="text-sm text-amber-700 max-w-sm mx-auto">
            {isSemantic
              ? 'Our AI reviewer determined this finding describes the same vulnerability as an existing submission.'
              : 'This exact finding has already been submitted to the Matter Security Bug Bounty program.'}
            {existingTitle && (
              <> The existing submission is titled: <em>"{existingTitle}"</em>.</>
            )}
          </p>
        </div>

        {/* AI reasoning block — only shown for semantic matches */}
        {isSemantic && reasoning && (
          <div className="rounded-lg border border-amber-200 bg-amber-100/60 px-4 py-3 text-left">
            <p className="text-xs font-semibold text-amber-800 mb-1 uppercase tracking-wide">AI Analysis</p>
            <p className="text-sm text-amber-800 italic">"{reasoning}"</p>
          </div>
        )}

        <p className="text-xs text-amber-600">
          If you believe this is a genuinely different vulnerability, revise your
          description to highlight the distinct root cause and affected component.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          {onViewExisting && existingId && existingId !== 'unknown' && (
            <Button
              size="sm"
              className="gap-2"
              onClick={() => onViewExisting(existingId)}
            >
              View Existing Submission <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onReset}>
            Try a Different Finding
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function SubmitForm({ onSuccess, onViewExisting }: Props) {
  const { address, connecting, error: walletError, isAvailable, connect, disconnect } = useMetaMask();

  const [mode, setMode] = useState<InputMode>('text');
  const [title, setTitle] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [ethAddress, setEthAddress] = useState('');
  const [text, setText] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState<string | undefined>(undefined);
  const [duplicateMatchType, setDuplicateMatchType] = useState<'content' | 'title' | 'semantic' | undefined>(undefined);
  const [duplicateReasoning, setDuplicateReasoning] = useState<string | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (address) setEthAddress(address);
  }, [address]);

  const canSubmit =
    title.trim().length > 0 &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    (mode === 'text' ? text.trim().length > 0 : pdfFile !== null);

  const handleReset = () => {
    setDuplicateId(null);
    setDuplicateTitle(undefined);
    setDuplicateMatchType(undefined);
    setDuplicateReasoning(undefined);
    setError(null);
    setText('');
    setTitle('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setDuplicateId(null);

    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('researcher_name', name.trim());
    fd.append('researcher_email', email.trim());
    fd.append('submitter_eth_address', ethAddress.trim());
    if (mode === 'text') {
      fd.append('finding_text', text.trim());
    } else if (pdfFile) {
      fd.append('pdf_file', pdfFile);
    }

    try {
      const res = await fetch('/api/findings', { method: 'POST', body: fd });
      const data = await res.json();

      if (res.status === 409) {
        // Duplicate — show thank-you screen
        setDuplicateId(data.detail?.existing_id ?? 'unknown');
        setDuplicateTitle(data.detail?.existing_title ?? undefined);
        setDuplicateMatchType(data.detail?.match_type ?? 'content');
        setDuplicateReasoning(data.detail?.reasoning ?? undefined);
        return;
      }
      if (!res.ok) {
        // FastAPI detail can be: a string, an object with .message, or a
        // validation-error array like [{msg, loc, type}, ...].
        // Coercing an array directly to Error gives "[object Object]".
        const det = data.detail;
        let msg = 'Submission failed';
        if (typeof det === 'string') {
          msg = det;
        } else if (det?.message) {
          msg = det.message;
        } else if (Array.isArray(det) && det.length > 0) {
          msg = det.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join('; ');
        } else if (det) {
          msg = JSON.stringify(det);
        }
        throw new Error(msg);
      }
      onSuccess(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  // Show duplicate thank-you screen
  if (duplicateId) {
    return (
      <DuplicateScreen
        existingId={duplicateId}
        existingTitle={duplicateTitle}
        matchType={duplicateMatchType}
        reasoning={duplicateReasoning}
        onViewExisting={onViewExisting}
        onReset={handleReset}
      />
    );
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Submit a Finding</CardTitle>
        <CardDescription>
          Your submission is verified by AI against the Matter Specification
          and SDK. Valid unique findings are recorded on Polygon Amoy (~2 s blocks).
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Researcher info */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="Jane Researcher"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Ethereum wallet */}
          <div className="space-y-2">
            <Label>
              Ethereum Address{' '}
              <span className="text-muted-foreground text-xs">(optional — links on-chain record to your wallet)</span>
            </Label>

            {isAvailable ? (
              address ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="flex-1 font-mono text-xs text-emerald-800 truncate">{address}</span>
                  <button
                    type="button"
                    onClick={disconnect}
                    className="text-emerald-600 hover:text-emerald-800 transition-colors"
                    title="Disconnect wallet"
                  >
                    <Unplug className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 w-full justify-center border-dashed"
                  onClick={connect}
                  disabled={connecting}
                >
                  <Wallet className="h-4 w-4" />
                  {connecting ? 'Connecting…' : 'Connect MetaMask'}
                </Button>
              )
            ) : (
              <p className="text-xs text-muted-foreground">
                MetaMask not detected — enter your address manually, or{' '}
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  install MetaMask
                </a>.
              </p>
            )}

            {walletError && <p className="text-xs text-destructive">{walletError}</p>}

            <div className="relative">
              <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 font-mono text-xs"
                placeholder="0x742d35Cc6634C0532925a3b8D4C9..."
                value={ethAddress}
                onChange={(e) => setEthAddress(e.target.value)}
              />
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Finding Title</Label>
            <Input
              id="title"
              placeholder="e.g. PASE session brute-force not rate-limited"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Content mode toggle */}
          <div className="space-y-3">
            <Label>Finding Content</Label>
            <div className="flex rounded-lg border border-border bg-muted p-1 w-fit gap-1">
              <button
                type="button"
                onClick={() => setMode('text')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  mode === 'text'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                Text
              </button>
              <button
                type="button"
                onClick={() => setMode('pdf')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  mode === 'pdf'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Upload className="h-3.5 w-3.5" />
                PDF
              </button>
            </div>

            {mode === 'text' ? (
              <textarea
                className="w-full min-h-[180px] rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                placeholder="Describe the vulnerability in detail — include steps to reproduce, affected versions, and potential impact…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            ) : (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                />
                {pdfFile ? (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <span className="flex-1 truncate text-sm font-medium">{pdfFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setPdfFile(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center hover:border-primary/50 hover:bg-accent transition-colors"
                  >
                    <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium text-foreground">Click to upload PDF</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF files only, any size</p>
                  </button>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <Button type="submit" disabled={!canSubmit || loading} className="w-full gap-2">
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Submitting…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit Finding
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
