import { cn } from '@/lib/utils';
import type { Severity } from '@/types';

const styles: Record<Severity, string> = {
  Critical: 'bg-red-100 text-red-700 border-red-200',
  High:     'bg-orange-100 text-orange-700 border-orange-200',
  Medium:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  Low:      'bg-blue-100 text-blue-700 border-blue-200',
};

interface Props {
  severity?: Severity;
  className?: string;
}

export function SeverityBadge({ severity, className }: Props) {
  if (!severity) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold',
        styles[severity] ?? styles.Low,
        className,
      )}
    >
      {severity}
    </span>
  );
}
