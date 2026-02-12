import { useMemo, useRef, type ReactNode } from 'react';
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

/**
 * Resolve $path expressions in action params by reading from state.
 * E.g., { "label": { "$path": "/form/label" } } -> { "label": "actual value" }
 * Also supports $concat for string concatenation:
 * { "msg": { "$concat": ["Hello ", { "$path": "/name" }] } }
 * And $template for string interpolation:
 * { "msg": { "$template": "Hello ${/name}, welcome!" } }
 */
function resolveExpressions(params: unknown, get: (path: string) => unknown): unknown {
  if (params === null || params === undefined) return params;

  // Handle object expressions
  if (typeof params === 'object' && !Array.isArray(params)) {
    const obj = params as Record<string, unknown>;

    // $path — read from state
    if (typeof obj.$path === 'string') {
      return get(obj.$path);
    }

    // $concat — concatenate values (resolve each, join as string)
    if (Array.isArray(obj.$concat)) {
      return obj.$concat.map(item => resolveExpressions(item, get)).join('');
    }

    // $template — string template with ${/path} replacements
    if (typeof obj.$template === 'string') {
      return obj.$template.replace(/\$\{([^}]+)\}/g, (_, path) => {
        const val = get(path.trim());
        return val !== undefined && val !== null ? String(val) : '';
      });
    }

    // Regular object — recursively resolve all values
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveExpressions(value, get);
    }
    return resolved;
  }

  // Array — recursively resolve each item
  if (Array.isArray(params)) {
    return params.map(item => resolveExpressions(item, get));
  }

  // Primitive — return as-is
  return params;
}

function UIPartViewInner({ spec }: { spec: any }) {
  const { get, set } = useStateStore();

  // Build a dispatch function that all handlers can reference (including self-referencing meta-actions)
  const dispatchRef = useRef<(action: string, params: Record<string, unknown>) => void>(() => {});

  const handlers = useMemo(() => {
    const h: Record<string, (params: any) => void> = {
      setState: (params: Record<string, unknown>) => {
        const r = resolveExpressions(params, get) as { path?: string; value?: unknown };
        if (typeof r?.path === 'string') {
          set(r.path, r.value);
        }
      },
      toggleState: (params: Record<string, unknown>) => {
        const r = resolveExpressions(params, get) as { path?: string };
        if (typeof r?.path === 'string') {
          set(r.path, !get(r.path));
        }
      },
      appendItem: (params: Record<string, unknown>) => {
        const r = resolveExpressions(params, get) as { path?: string; item?: unknown };
        if (typeof r?.path === 'string') {
          const current = get(r.path);
          const arr = Array.isArray(current) ? current : [];
          set(r.path, [...arr, r.item]);
        }
      },
      removeItem: (params: Record<string, unknown>) => {
        const r = resolveExpressions(params, get) as { path?: string; index?: number };
        if (typeof r?.path === 'string' && typeof r?.index === 'number') {
          const current = get(r.path);
          if (Array.isArray(current)) {
            set(r.path, current.filter((_: unknown, i: number) => i !== r.index));
          }
        }
      },
      navigate: (params: Record<string, unknown>) => {
        const r = resolveExpressions(params, get) as { url?: string };
        if (typeof window !== 'undefined' && typeof r?.url === 'string') {
          window.location.assign(r.url);
        }
      },
      submit: (params: Record<string, unknown>) => {
        const r = resolveExpressions(params, get) as { data?: Record<string, unknown> };
        if (r?.data && typeof r.data === 'object') {
          console.info('Form submit', r.data);
        }
      },
      action: (params: Record<string, unknown>) => {
        console.info('Action', resolveExpressions(params, get));
      },
      // Meta-action: run multiple actions in sequence
      sequence: (params: Record<string, unknown>) => {
        const r = resolveExpressions(params, get) as {
          actions?: Array<{ action: string; actionParams?: Record<string, unknown> }>;
        };
        if (Array.isArray(r?.actions)) {
          for (const step of r.actions) {
            if (step.action) {
              dispatchRef.current(step.action, step.actionParams ?? {});
            }
          }
        }
      },
      // Meta-action: conditionally dispatch an action
      conditional: (params: Record<string, unknown>) => {
        const r = resolveExpressions(params, get) as {
          condition?: unknown;
          then?: { action: string; actionParams?: Record<string, unknown> };
          else?: { action: string; actionParams?: Record<string, unknown> };
        };

        let conditionMet = false;
        const cond = r?.condition;

        if (cond && typeof cond === 'object') {
          const condObj = cond as Record<string, unknown>;
          if (typeof condObj.path === 'string') {
            conditionMet = !!get(condObj.path);
          } else if (Array.isArray(condObj.eq)) {
            const [left, right] = condObj.eq.map(v => resolveExpressions(v, get));
            conditionMet = left === right;
          } else if (Array.isArray(condObj.ne)) {
            const [left, right] = condObj.ne.map(v => resolveExpressions(v, get));
            conditionMet = left !== right;
          } else if (Array.isArray(condObj.gt)) {
            const [left, right] = condObj.gt.map(v => resolveExpressions(v, get));
            conditionMet = Number(left) > Number(right);
          } else if (Array.isArray(condObj.gte)) {
            const [left, right] = condObj.gte.map(v => resolveExpressions(v, get));
            conditionMet = Number(left) >= Number(right);
          } else if (Array.isArray(condObj.lt)) {
            const [left, right] = condObj.lt.map(v => resolveExpressions(v, get));
            conditionMet = Number(left) < Number(right);
          } else if (Array.isArray(condObj.lte)) {
            const [left, right] = condObj.lte.map(v => resolveExpressions(v, get));
            conditionMet = Number(left) <= Number(right);
          }
        } else {
          conditionMet = !!cond;
        }

        const branch = conditionMet ? r?.then : r?.else;
        if (branch?.action) {
          dispatchRef.current(branch.action, branch.actionParams ?? {});
        }
      },
    };

    dispatchRef.current = (action, params) => {
      if (h[action]) h[action](params);
    };

    return h;
  }, [get, set]);

  return (
    <ActionProvider handlers={handlers}>
      <VisibilityProvider>
        <div className="w-full">
          <Renderer spec={normalizeSpec(spec)} registry={registry} />
        </div>
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
    <div className="group/ui relative w-full rounded-md border border-[var(--border)] p-3 my-2">
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
