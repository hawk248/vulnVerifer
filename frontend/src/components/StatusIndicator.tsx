import { Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FindingStatus } from '@/types';

const config: Record<
  FindingStatus,
  { label: string; icon: React.ElementType; cls: string; spin?: boolean }
> = {
  pending:   { label: 'Queued',      icon: Clock,         cls: 'text-muted-foreground' },
  verifying: { label: 'Verifying…',  icon: Loader2,       cls: 'text-primary',          spin: true },
  verified:  { label: 'Verified',    icon: CheckCircle2,  cls: 'text-emerald-600' },
  failed:    { label: 'Failed',      icon: AlertTriangle, cls: 'text-destructive' },
};

interface Props {
  status: FindingStatus;
  className?: string;
}

export function StatusIndicator({ status, className }: Props) {
  const { label, icon: Icon, cls, spin } = config[status] ?? config.pending;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', cls, className)}>
      <Icon className={cn('h-3.5 w-3.5', spin && 'animate-spin')} />
      {label}
    </span>
  );
}
