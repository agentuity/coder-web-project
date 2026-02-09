import { CheckCircle2, Circle, Clock } from 'lucide-react';

interface PlanItem {
  text: string;
  status: 'pending' | 'in-progress' | 'done';
}

interface PlanProps {
  title?: string;
  items: PlanItem[];
}

export function Plan({ title, items }: PlanProps) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3 space-y-2">
      {title && (
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {title}
        </h4>
      )}
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={`${item.text}-${item.status}-${i}`} className="flex items-start gap-2">
            {item.status === 'done' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
            ) : item.status === 'in-progress' ? (
              <Clock className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5 animate-pulse" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0 mt-0.5" />
            )}
            <span className="text-xs">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
