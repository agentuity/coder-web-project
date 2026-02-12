import { useMemo, type ReactNode } from 'react';
import { ActionProvider, Renderer, StateProvider, VisibilityProvider, useStateStore } from '@json-render/react';
import { registry } from '../../lib/ui-registry';
import { specToReact } from '../../lib/spec-to-react';

interface UIPartViewProps {
  spec: any;
  loading?: boolean;
}

function downloadComponent(spec: any) {
  const code = specToReact(spec, 'GeneratedComponent');
  const blob = new Blob([code], { type: 'text/typescript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'component.tsx';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Normalize a spec to the flat elements map format that @json-render/react expects.
 * Handles both formats:
 * - Flat format: { root: "card-1", elements: { "card-1": { type, props, children: ["child-key"] } } }
 * - Nested format: { root: { type, props, children: [{ type, props, children: [...] }] } }
 */
function normalizeSpec(spec: any): any {
  // Already in flat format
  if (typeof spec?.root === 'string' && spec?.elements) {
    return spec;
  }

  // Nested format — convert to flat
  if (spec?.root && typeof spec.root === 'object' && spec.root.type) {
    const elements: Record<string, any> = {};
    let counter = 0;

    function flattenElement(node: any): string {
      counter++;
      const key = `${(node.type || 'el').toLowerCase()}-${counter}`;
      const childKeys: string[] = [];

      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          if (typeof child === 'object' && child.type) {
            childKeys.push(flattenElement(child));
          }
        }
      }

      elements[key] = {
        type: node.type,
        props: node.props || {},
        ...(childKeys.length > 0 ? { children: childKeys } : {}),
      };

      return key;
    }

    const rootKey = flattenElement(spec.root);
    return { root: rootKey, elements };
  }

  // Unknown format — pass through and let Renderer handle it
  return spec;
}

function UIPartViewInner({ spec }: { spec: any }) {
  const { get, set } = useStateStore();

  const handlers = useMemo(() => ({
    setState: (params: { path?: string; value?: unknown }) => {
      if (typeof params?.path === 'string') {
        set(params.path, params.value);
      }
    },
    toggleState: (params: { path?: string }) => {
      if (typeof params?.path === 'string') {
        set(params.path, !get(params.path));
      }
    },
    appendItem: (params: { path?: string; item?: unknown }) => {
      if (typeof params?.path === 'string') {
        const current = get(params.path);
        const arr = Array.isArray(current) ? current : [];
        set(params.path, [...arr, params.item]);
      }
    },
    removeItem: (params: { path?: string; index?: number }) => {
      if (typeof params?.path === 'string' && typeof params?.index === 'number') {
        const current = get(params.path);
        if (Array.isArray(current)) {
          set(params.path, current.filter((_: unknown, i: number) => i !== params.index));
        }
      }
    },
    navigate: (params: { url?: unknown }) => {
      if (typeof window !== 'undefined' && typeof params?.url === 'string') {
        window.location.assign(params.url);
      }
    },
    submit: (params: { data?: Record<string, unknown> }) => {
      if (params?.data && typeof params.data === 'object') {
        console.info('Form submit', params.data);
      }
    },
    action: (params: Record<string, unknown>) => {
      console.info('Action', params);
    },
  }), [get, set]);

  return (
    <ActionProvider handlers={handlers}>
      <VisibilityProvider>
        <Renderer spec={normalizeSpec(spec)} registry={registry} />
      </VisibilityProvider>
    </ActionProvider>
  );
}

export function UIPartView({ spec, loading }: UIPartViewProps) {
  if (loading) {
    return (
      <div className="rounded-md border border-[var(--border)] p-3 my-2">
        <div className="space-y-3 animate-pulse">
          <div className="h-4 w-1/3 rounded bg-[var(--muted)]" />
          <div className="h-20 rounded bg-[var(--muted)]" />
          <div className="h-10 w-1/2 rounded bg-[var(--muted)]" />
        </div>
      </div>
    );
  }

  const initialState = spec?.state ?? { form: {} };

  let content: ReactNode;
  try {
    content = (
      <StateProvider initialState={initialState}>
        <UIPartViewInner spec={spec} />
      </StateProvider>
    );
  } catch (error) {
    content = (
      <div className="text-xs text-[var(--muted-foreground)]">
        <pre className="whitespace-pre-wrap font-mono text-xs">{String(error)}</pre>
      </div>
    );
    console.error('Failed to render UI spec', error);
  }

  return (
    <div className="group/ui relative rounded-md border border-[var(--border)] p-3 my-2">
      <button
        type="button"
        onClick={() => downloadComponent(spec)}
        title="Download as React component"
        className="absolute right-2 top-2 rounded p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-[var(--foreground)] hover:bg-[var(--muted)] group-hover/ui:opacity-100"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
      {content}
    </div>
  );
}
