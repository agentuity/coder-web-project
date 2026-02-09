import { useState } from 'react';
import type { ReactNode } from 'react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import { CheckIcon, CopyIcon } from 'lucide-react';
import type { TextPart } from '../../types/opencode';

interface TextPartViewProps {
  part: TextPart;
  isStreaming?: boolean;
}

// Create a code plugin with dual themes for dark/light support
const codePlugin = createCodePlugin({
  themes: ['github-dark', 'github-light'],
});

function extractText(node: ReactNode): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as { props?: { children?: React.ReactNode } }).props?.children);
  }
  return '';
}

const components = {
  h1: ({ children, ...props }: React.ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="text-lg font-bold mt-4 mb-2 text-[var(--foreground)]" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }: React.ComponentPropsWithoutRef<'h2'>) => (
    <h2 className="text-base font-bold mt-3 mb-1.5 text-[var(--foreground)]" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }: React.ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="text-sm font-semibold mt-2 mb-1 text-[var(--foreground)]" {...props}>{children}</h3>
  ),
  p: ({ children, ...props }: React.ComponentPropsWithoutRef<'p'>) => (
    <p className="text-sm leading-relaxed text-[var(--foreground)] my-1.5" {...props}>{children}</p>
  ),
  a: ({ href, children, ...props }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="text-[var(--primary)] underline underline-offset-2 hover:opacity-80 text-sm" {...props}>
      {children}
    </a>
  ),
  code: ({ children, className, ...props }: React.ComponentPropsWithoutRef<'code'>) => {
    // If className contains 'language-' this is inside a <pre> (fenced code block) — don't add inline styles
    if (className && className.includes('language-')) {
      return <code className={className} {...props}>{children}</code>;
    }
    // Inline code
    return (
      <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[0.85em] font-mono text-[var(--foreground)]" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
      const text = extractText(children).trim();
      if (!text || typeof window === 'undefined' || !navigator?.clipboard?.writeText) return;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Ignore copy errors
      }
    };

    return (
      <div className="relative group my-2">
        <pre className="overflow-x-auto rounded-lg bg-[var(--muted)] p-3 text-xs leading-relaxed font-mono" {...props}>
          {children}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--foreground)]"
          title={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
          <span className="sr-only">{copied ? 'Copied' : 'Copy code'}</span>
        </button>
      </div>
    );
  },
  ul: ({ children, ...props }: React.ComponentPropsWithoutRef<'ul'>) => (
    <ul className="text-sm list-disc ml-4 my-1.5 space-y-0.5 text-[var(--foreground)]" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.ComponentPropsWithoutRef<'ol'>) => (
    <ol className="text-sm list-decimal ml-4 my-1.5 space-y-0.5 text-[var(--foreground)]" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.ComponentPropsWithoutRef<'li'>) => (
    <li className="text-sm text-[var(--foreground)]" {...props}>{children}</li>
  ),
  blockquote: ({ children, ...props }: React.ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote className="border-l-2 border-[var(--border)] pl-3 my-2 text-sm text-[var(--muted-foreground)] italic" {...props}>
      {children}
    </blockquote>
  ),
  hr: (props: React.ComponentPropsWithoutRef<'hr'>) => (
    <hr className="my-3 border-[var(--border)]" {...props} />
  ),
  strong: ({ children, ...props }: React.ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-semibold text-[var(--foreground)]" {...props}>{children}</strong>
  ),
  table: ({ children, ...props }: React.ComponentPropsWithoutRef<'table'>) => (
    <div className="overflow-x-auto my-2">
      <table className="text-xs border-collapse border border-[var(--border)]" {...props}>{children}</table>
    </div>
  ),
  th: ({ children, ...props }: React.ComponentPropsWithoutRef<'th'>) => (
    <th className="border border-[var(--border)] px-2 py-1 text-left text-xs font-semibold bg-[var(--muted)] text-[var(--foreground)]" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: React.ComponentPropsWithoutRef<'td'>) => (
    <td className="border border-[var(--border)] px-2 py-1 text-xs text-[var(--foreground)]" {...props}>{children}</td>
  ),
};

export function TextPartView({ part, isStreaming }: TextPartViewProps) {
  if (part.ignored) return null;
  return (
    <div className="max-w-none text-sm text-[var(--foreground)]">
      <Streamdown
        plugins={{ code: codePlugin }}
        components={components}
        isAnimating={isStreaming}
        caret={isStreaming ? 'block' : undefined}
        mode={isStreaming ? 'streaming' : undefined}
      >
        {part.text}
      </Streamdown>
    </div>
  );
}
