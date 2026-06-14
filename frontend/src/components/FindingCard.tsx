import { ArrowRight, FileText, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SeverityBadge } from './SeverityBadge';
import { StatusIndicator } from './StatusIndicator';
import { VerdictBadge } from './VerdictBadge';
import type { Finding } from '@/types';

interface Props {
  finding: Finding;
  onClick: () => void;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function FindingCard({ finding, onClick }: Props) {
  return (
    <Card
      className="cursor-pointer border-border/60 transition-all hover:border-primary/40 hover:shadow-md group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={finding.severity} />
              <StatusIndicator status={finding.status} />
              {finding.overall_verdict && finding.status === 'verified' && (
                <VerdictBadge verdict={finding.overall_verdict} />
              )}
            </div>

            <h3 className="text-sm font-semibold leading-snug truncate text-foreground group-hover:text-primary transition-colors">
              {finding.title}
            </h3>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{finding.researcher_name}</span>
              {finding.pdf_filename && (
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  PDF
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {fmt(finding.created_at)}
              </span>
            </div>
          </div>

          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>
      </CardContent>
    </Card>
  );
}
