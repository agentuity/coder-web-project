import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import type { TextPart } from '../../types/opencode';

interface TextPartViewProps {
  part: TextPart;
}

// Create a code plugin with dual themes for dark/light support
const codePlugin = createCodePlugin({
  themes: ['github-dark', 'github-light'],
});

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
  pre: ({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-[var(--muted)] p-3 text-xs leading-relaxed font-mono" {...props}>
      {children}
    </pre>
  ),
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

export function TextPartView({ part }: TextPartViewProps) {
  if (part.ignored) return null;
  return (
    <div className="max-w-none text-sm text-[var(--foreground)]">
      <Streamdown plugins={{ code: codePlugin }} components={components}>
        {part.text}
      </Streamdown>
    </div>
  );
}
