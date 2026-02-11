import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ActionProvider, Renderer, StateProvider, VisibilityProvider } from '@json-render/react';
import { registry } from '../../lib/ui-registry';
import { cn } from '../../lib/utils';

interface UIPartViewProps {
  spec: any;
  loading?: boolean;
}

const COLLAPSE_THRESHOLD = 2200;

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function UIPartView({ spec, loading }: UIPartViewProps) {
  const [expanded, setExpanded] = useState(false);
  const jsonPreview = useMemo(() => safeStringify(spec), [spec]);
  const isLarge = jsonPreview.length > COLLAPSE_THRESHOLD;
  const shouldCollapse = isLarge && !expanded;

  if (loading) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5">Generated UI</span>
          <span className="animate-pulse">Rendering…</span>
        </div>
        <div className="mt-4 space-y-3">
          <div className="h-4 w-1/3 rounded bg-[var(--muted)] animate-pulse" />
          <div className="h-20 rounded bg-[var(--muted)] animate-pulse" />
          <div className="h-10 w-1/2 rounded bg-[var(--muted)] animate-pulse" />
        </div>
      </div>
    );
  }

  let content: ReactNode;
  try {
    content = (
      <StateProvider initialState={{ form: {} }}>
        <ActionProvider
          handlers={{
            navigate: (params: { url?: unknown }) => {
              if (typeof window !== 'undefined' && typeof params?.url === 'string') {
                window.location.assign(params.url);
              }
            },
            submit: (params: { data?: Record<string, unknown> }) => {
              if (params?.data && typeof params.data === 'object') {
                // Placeholder for WS6 streaming hook
                console.info('Form submit', params.data);
              }
            },
            action: (params: Record<string, unknown>) => {
              console.info('Action', params);
            },
          }}
        >
          <VisibilityProvider>
            <Renderer spec={spec} registry={registry} />
          </VisibilityProvider>
        </ActionProvider>
      </StateProvider>
    );
  } catch (error) {
    content = (
      <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-3 text-xs text-[var(--foreground)]">
        <div className="mb-2 text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">UI render failed</div>
        <pre className="whitespace-pre-wrap font-mono text-xs">{jsonPreview}</pre>
      </div>
    );
    console.error('Failed to render UI spec', error);
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5">Generated UI</span>
          <span>Interactive</span>
        </div>
        {isLarge && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-xs font-medium text-[var(--primary)] hover:opacity-80"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
      <div
        className={cn(
          'relative mt-3 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--background)] p-3',
          shouldCollapse && 'max-h-[320px]'
        )}
      >
        {content}
        {shouldCollapse && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--background)] to-transparent" />
        )}
      </div>
      {shouldCollapse && (
        <div className="mt-2 text-xs text-[var(--muted-foreground)]">Expand to view full UI</div>
      )}
    </div>
  );
}
