import { CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Verdict } from '@/types';

const config: Record<Verdict, { label: string; icon: React.ElementType; cls: string }> = {
  VALID:               { label: 'Valid',              icon: CheckCircle,  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  INVALID:             { label: 'Invalid',            icon: XCircle,      cls: 'bg-red-100 text-red-700 border-red-200' },
  NEEDS_FURTHER_REVIEW:{ label: 'Needs Review',       icon: HelpCircle,   cls: 'bg-amber-100 text-amber-700 border-amber-200' },
};

interface Props {
  verdict: Verdict;
  className?: string;
}

export function VerdictBadge({ verdict, className }: Props) {
  const { label, icon: Icon, cls } = config[verdict] ?? config.NEEDS_FURTHER_REVIEW;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold',
        cls,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
