/**
 * Converts a normalized json-render spec into a standalone React component (.tsx file)
 * with Tailwind CSS classes. No json-render dependencies required.
 *
 * Supports two modes:
 * - Static: specs without state/events/visibility generate purely static JSX (no useState)
 * - Interactive: specs with state, on events, visible conditions, or $path expressions
 *   generate a fully working component with useState, action dispatch, expression
 *   resolution, and conditional rendering.
 */

/* ── helpers ──────────────────────────────────────────────────── */

function esc(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

function indent(code: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => (line.trim() ? pad + line : ''))
    .join('\n');
}

function jsonLiteral(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Convert a label like "First Name" to "firstName" for state paths */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Check if a prop value contains a $path expression (at any depth).
 */
function hasDynamicExpr(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.$path === 'string') return true;
    if (Array.isArray(obj.$concat)) return true;
    if (typeof obj.$template === 'string') return true;
    return Object.values(obj).some(hasDynamicExpr);
  }
  if (Array.isArray(value)) return value.some(hasDynamicExpr);
  return false;
}

/**
 * Generate a code expression for resolving a dynamic value at runtime.
 * Returns raw JSX expression code (without surrounding {}).
 */
function dynamicExpr(value: unknown): string {
  if (value === null || value === undefined) return "''";
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.$path === 'string') return `get(${JSON.stringify(obj.$path)})`;
    if (Array.isArray(obj.$concat)) {
      const parts = obj.$concat.map((item) => {
        if (typeof item === 'string') return JSON.stringify(item);
        return `String(${dynamicExpr(item)} ?? '')`;
      });
      return parts.join(' + ');
    }
    if (typeof obj.$template === 'string') {
      return `resolve(${JSON.stringify(obj)})`;
    }
  }
  return JSON.stringify(value);
}

/* ── spacing / alignment maps (mirrors ui-registry) ───────────── */

const spacingMap: Record<string, string> = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };
const paddingMap: Record<string, string> = { sm: 'p-3', md: 'p-4', lg: 'p-6' };
const alignMap: Record<string, string> = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' };

/* ── element metadata (on/visible from the spec element) ──────── */

interface ElementMeta {
  on?: Record<string, { action: string; actionParams?: Record<string, unknown> }>;
  visible?: Record<string, unknown>;
}

/* ── component templates ──────────────────────────────────────── */

type TemplateFn = (props: Record<string, any>, children: string, meta?: ElementMeta, stateful?: boolean) => string;

const templates: Record<string, TemplateFn> = {
  /* ── Layout ──────────────────────────────────────────────────── */

  Card: (p, children) => {
    const pad = p.padding ? paddingMap[p.padding] ?? '' : 'p-6';
    const cls = ['rounded-lg border bg-card shadow-sm', pad, p.className].filter(Boolean).join(' ');
    return [
      `<div className="${cls}">`,
      `  <h2 className="text-base font-semibold">${esc(p.title)}</h2>`,
      p.description ? `  <p className="text-sm text-muted-foreground">${esc(p.description)}</p>` : '',
      children ? `  <div className="mt-3">\n${indent(children, 4)}\n  </div>` : '',
      '</div>',
    ].filter(Boolean).join('\n');
  },

  Row: (p, children) => {
    const gap = spacingMap[p.gap ?? 'md'] ?? 'gap-4';
    const align = alignMap[p.align ?? 'start'] ?? 'items-start';
    const cls = ['flex flex-row', gap, align, p.className].filter(Boolean).join(' ');
    return `<div className="${cls}">\n${indent(children, 2)}\n</div>`;
  },

  Column: (p, children) => {
    const gap = spacingMap[p.gap ?? 'md'] ?? 'gap-4';
    const align = alignMap[p.align ?? 'start'] ?? 'items-start';
    const cls = ['flex flex-col', gap, align, p.className].filter(Boolean).join(' ');
    return `<div className="${cls}">\n${indent(children, 2)}\n</div>`;
  },

  Stack: (p, children) => {
    const dir = p.direction === 'horizontal' ? 'flex-row' : 'flex-col';
    const gap = spacingMap[p.gap ?? 'md'] ?? 'gap-4';
    const cls = ['flex', dir, gap, p.className].filter(Boolean).join(' ');
    return `<div className="${cls}">\n${indent(children, 2)}\n</div>`;
  },

  Grid: (p, children) => {
    const cols = String(p.columns ?? 3);
    const colsMap: Record<string, string> = {
      '1': 'grid-cols-1',
      '2': 'grid-cols-1 md:grid-cols-2',
      '3': 'grid-cols-1 md:grid-cols-3',
      '4': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
    };
    const gap = spacingMap[p.gap ?? 'md'] ?? 'gap-4';
    const colCls = colsMap[cols] ?? 'grid-cols-1 md:grid-cols-3';
    const cls = ['grid', colCls, gap, p.className].filter(Boolean).join(' ');
    return `<div className="${cls}">\n${indent(children, 2)}\n</div>`;
  },

  Container: (p, children) => {
    const maxWidthMap: Record<string, string> = { sm: 'max-w-screen-sm', md: 'max-w-screen-md', lg: 'max-w-screen-lg', xl: 'max-w-screen-xl', full: 'max-w-full' };
    const mw = maxWidthMap[p.maxWidth ?? 'lg'] ?? 'max-w-screen-lg';
    const cls = ['mx-auto px-4', mw, p.className].filter(Boolean).join(' ');
    return `<div className="${cls}">\n${indent(children, 2)}\n</div>`;
  },

  Section: (p, children) => {
    const bgMap: Record<string, string> = { default: 'bg-background', muted: 'bg-muted', primary: 'bg-primary text-primary-foreground', dark: 'bg-gray-900 text-white' };
    const padMap: Record<string, string> = { sm: 'py-8', md: 'py-12', lg: 'py-16', xl: 'py-24' };
    const bg = bgMap[p.background ?? 'default'] ?? '';
    const pad = padMap[p.padding ?? 'lg'] ?? 'py-16';
    const cls = ['w-full px-6', bg, pad, p.className].filter(Boolean).join(' ');
    const header = (p.title || p.subtitle)
      ? [
        '<div className="mx-auto mb-10 max-w-3xl text-center">',
        p.title ? `  <h2 className="text-3xl font-bold tracking-tight">${esc(p.title)}</h2>` : '',
        p.subtitle ? `  <p className="mt-2 text-lg opacity-70">${esc(p.subtitle)}</p>` : '',
        '</div>',
      ].filter(Boolean).join('\n')
      : '';
    return [`<section className="${cls}">`, header, indent(children, 2), '</section>'].filter(Boolean).join('\n');
  },

  Box: (p, children) => {
    if (p.className) return `<div className="${p.className}">\n${indent(children, 2)}\n</div>`;
    return `<div>\n${indent(children, 2)}\n</div>`;
  },

  Flex: (p, children) => {
    const dirMap: Record<string, string> = { row: 'flex-row', col: 'flex-col', 'row-reverse': 'flex-row-reverse', 'col-reverse': 'flex-col-reverse' };
    const justifyMap: Record<string, string> = { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between', around: 'justify-around', evenly: 'justify-evenly' };
    const itemsMap: Record<string, string> = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch', baseline: 'items-baseline' };
    const parts = ['flex', dirMap[p.direction ?? 'row'] ?? 'flex-row'];
    if (p.wrap) parts.push('flex-wrap');
    if (p.justify) parts.push(justifyMap[p.justify] ?? '');
    if (p.items) parts.push(itemsMap[p.items] ?? '');
    if (p.gap) parts.push(spacingMap[p.gap] ?? '');
    if (p.className) parts.push(p.className);
    const cls = parts.filter(Boolean).join(' ');
    return `<div className="${cls}">\n${indent(children, 2)}\n</div>`;
  },

  /* ── Text & Typography ──────────────────────────────────────── */

  Text: (p, _children, _meta, stateful) => {
    const variants: Record<string, string> = { heading: 'text-lg font-semibold', subheading: 'text-base font-medium', body: 'text-sm', caption: 'text-xs text-muted-foreground' };
    const cls = [variants[p.variant ?? 'body'] ?? 'text-sm', p.className].filter(Boolean).join(' ');
    if (stateful && hasDynamicExpr(p.content)) {
      return `<p className="${cls}">{String(${dynamicExpr(p.content)} ?? '')}</p>`;
    }
    return `<p className="${cls}">${esc(p.content)}</p>`;
  },

  Heading: (p, _children, _meta, stateful) => {
    const level = p.level ?? '2';
    const sizeMap: Record<string, string> = { '1': 'text-4xl font-bold tracking-tight', '2': 'text-3xl font-bold tracking-tight', '3': 'text-2xl font-semibold', '4': 'text-xl font-semibold', '5': 'text-lg font-medium', '6': 'text-base font-medium' };
    const cls = [sizeMap[level] ?? 'text-3xl font-bold tracking-tight', p.className].filter(Boolean).join(' ');
    const tag = `h${level}`;
    if (stateful && hasDynamicExpr(p.content)) {
      return `<${tag} className="${cls}">{String(${dynamicExpr(p.content)} ?? '')}</${tag}>`;
    }
    return `<${tag} className="${cls}">${esc(p.content)}</${tag}>`;
  },

  Paragraph: (p, _children, _meta, stateful) => {
    const cls = ['text-sm leading-relaxed', p.className].filter(Boolean).join(' ');
    if (stateful && hasDynamicExpr(p.content)) {
      return `<p className="${cls}">{String(${dynamicExpr(p.content)} ?? '')}</p>`;
    }
    return `<p className="${cls}">${esc(p.content)}</p>`;
  },

  /* ── Interactive ────────────────────────────────────────────── */

  Button: (p, _children, meta, stateful) => {
    const variantMap: Record<string, string> = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
    };
    const v = variantMap[p.variant ?? 'primary'] ?? variantMap.primary;
    const cls = ['inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors', v, p.className].filter(Boolean).join(' ');
    const press = stateful && meta?.on?.press;
    const onClick = press
      ? ` onClick={() => dispatch(${JSON.stringify(press.action)}, ${JSON.stringify(press.actionParams ?? {})})}`
      : '';
    const label = (stateful && hasDynamicExpr(p.label))
      ? `{String(${dynamicExpr(p.label)} ?? '')}`
      : esc(p.label);
    return `<button className="${cls}"${onClick}>${label}</button>`;
  },

  Link: (p) => {
    const extra = p.external ? ' target="_blank" rel="noopener noreferrer"' : '';
    const cls = ['text-sm font-medium text-primary underline underline-offset-2 hover:opacity-80', p.className].filter(Boolean).join(' ');
    return `<a href="${esc(p.href)}" className="${cls}"${extra}>${esc(p.label)}</a>`;
  },

  /* ── Data Display ───────────────────────────────────────────── */

  Table: (p) => {
    const cols = (p.columns ?? []) as Array<{ key: string; label: string }>;
    const rows = (p.rows ?? []) as Array<Record<string, unknown>>;
    const cls = ['w-full border-collapse text-sm', p.className].filter(Boolean).join(' ');
    const headerCells = cols.map((c) => `        <th className="border-b px-4 py-2 text-left font-medium text-muted-foreground">${esc(c.label)}</th>`).join('\n');
    const bodyRows = rows.map((row) => {
      const cells = cols.map((c) => `          <td className="border-b px-4 py-2">${esc(String(row[c.key] ?? ''))}</td>`).join('\n');
      return `        <tr>\n${cells}\n        </tr>`;
    }).join('\n');
    return [
      `<div className="rounded-lg border overflow-hidden${p.className ? ` ${p.className}` : ''}">`,
      `  <table className="${cls}">`,
      '    <thead>',
      '      <tr>',
      headerCells,
      '      </tr>',
      '    </thead>',
      '    <tbody>',
      bodyRows,
      '    </tbody>',
      '  </table>',
      '</div>',
    ].join('\n');
  },

  Metric: (p, _children, _meta, stateful) => {
    const trendCls = p.trend === 'up' ? 'text-emerald-600' : p.trend === 'down' ? 'text-red-600' : 'text-muted-foreground';
    const trendIcon = p.trend === 'up' ? '▲ ' : p.trend === 'down' ? '▼ ' : '';
    const cls = ['rounded-lg border bg-card px-4 py-3 shadow-sm', p.className].filter(Boolean).join(' ');
    const valueContent = (stateful && hasDynamicExpr(p.value))
      ? `{String(${dynamicExpr(p.value)} ?? '')}`
      : esc(p.value);
    return [
      `<div className="${cls}">`,
      `  <div className="text-xs text-muted-foreground">${esc(p.label)}</div>`,
      `  <div className="mt-1 text-2xl font-semibold">${valueContent}</div>`,
      p.change ? `  <div className="mt-1 text-xs font-medium ${trendCls}">${trendIcon}${esc(p.change)}</div>` : '',
      '</div>',
    ].filter(Boolean).join('\n');
  },

  Badge: (p, _children, _meta, stateful) => {
    const variantMap: Record<string, string> = {
      default: 'bg-secondary text-secondary-foreground',
      success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
      warning: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
      error: 'bg-destructive text-destructive-foreground',
      info: 'border-blue-500/30 bg-blue-500/10 text-blue-600',
    };
    const v = variantMap[p.variant ?? 'default'] ?? variantMap.default;
    const cls = ['inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', v, p.className].filter(Boolean).join(' ');
    const text = (stateful && hasDynamicExpr(p.text))
      ? `{String(${dynamicExpr(p.text)} ?? '')}`
      : esc(p.text);
    return `<span className="${cls}">${text}</span>`;
  },

  Alert: (p) => {
    const colorMap: Record<string, string> = {
      info: 'border-blue-500/40 bg-blue-500/5 text-blue-700',
      success: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700',
      warning: 'border-amber-500/40 bg-amber-500/5 text-amber-700',
      error: 'border-red-500/40 bg-red-500/5 text-red-700',
    };
    const color = colorMap[p.variant ?? 'info'] ?? colorMap.info;
    const cls = ['rounded-lg border p-4', color, p.className].filter(Boolean).join(' ');
    return [
      `<div className="${cls}" role="alert">`,
      p.title ? `  <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide">${esc(p.title)}</h5>` : '',
      `  <p className="text-sm">${esc(p.message)}</p>`,
      '</div>',
    ].filter(Boolean).join('\n');
  },

  Image: (p) => {
    const widthAttr = p.width ? ` width={${p.width}}` : '';
    const heightAttr = p.height ? ` height={${p.height}}` : '';
    const cls = ['overflow-hidden rounded-lg border', p.className].filter(Boolean).join(' ');
    return [
      `<div className="${cls}">`,
      `  <img src="${esc(p.src)}" alt="${esc(p.alt ?? 'Image')}"${widthAttr}${heightAttr} className="h-auto w-full object-cover" />`,
      '</div>',
    ].join('\n');
  },

  Code: (p) => {
    const cls = ['overflow-x-auto rounded-lg border bg-muted p-3 text-xs', p.className].filter(Boolean).join(' ');
    return [
      `<pre className="${cls}">`,
      `  <code>${esc(p.content)}</code>`,
      '</pre>',
    ].join('\n');
  },

  Divider: (p) => {
    const cls = ['border-t', p.className].filter(Boolean).join(' ');
    return `<hr className="${cls}" />`;
  },

  List: (p) => {
    const items = (p.items ?? []) as string[];
    const tag = p.ordered ? 'ol' : 'ul';
    const listCls = p.ordered ? 'list-decimal' : 'list-disc';
    const cls = ['space-y-1 pl-5 text-sm', listCls, p.className].filter(Boolean).join(' ');
    const lis = items.map((item) => `  <li>${esc(item)}</li>`).join('\n');
    return `<${tag} className="${cls}">\n${lis}\n</${tag}>`;
  },

  /* ── Landing Page ───────────────────────────────────────────── */

  Hero: (p, children) => {
    const gradientMap: Record<string, string> = {
      none: '',
      blue: 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white',
      purple: 'bg-gradient-to-br from-purple-600 to-pink-600 text-white',
      green: 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white',
      orange: 'bg-gradient-to-br from-orange-500 to-red-600 text-white',
      dark: 'bg-gradient-to-br from-gray-900 to-gray-800 text-white',
    };
    const gradient = gradientMap[p.backgroundGradient ?? 'none'] ?? '';
    const alignment = p.align === 'left' ? 'text-left items-start' : 'text-center items-center';
    const bgStyle = p.backgroundImage
      ? ` style={{ backgroundImage: "url(${p.backgroundImage})", backgroundSize: "cover", backgroundPosition: "center" }}`
      : '';
    const cls = ['relative flex w-full flex-col justify-center px-6 py-20 md:py-32', gradient, alignment, p.className].filter(Boolean).join(' ');
    return [
      `<section className="${cls}"${bgStyle}>`,
      `  <div className="mx-auto flex max-w-4xl flex-col ${alignment} gap-4">`,
      `    <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">${esc(p.headline)}</h1>`,
      p.subheadline ? `    <p className="max-w-2xl text-lg opacity-80 md:text-xl">${esc(p.subheadline)}</p>` : '',
      children ? `    <div className="mt-4 flex flex-wrap gap-3">\n${indent(children, 6)}\n    </div>` : '',
      '  </div>',
      '</section>',
    ].filter(Boolean).join('\n');
  },

  Navbar: (p) => {
    const links = (p.links ?? []) as Array<{ label: string; href: string }>;
    const cls = ['flex w-full items-center justify-between border-b px-6 py-4', p.className].filter(Boolean).join(' ');
    const logoHtml = p.logoSrc
      ? `<img src="${esc(p.logoSrc)}" alt="${esc(p.logo ?? 'Logo')}" className="h-8 w-auto" />`
      : p.logo
        ? `<span className="text-lg font-bold">${esc(p.logo)}</span>`
        : '';
    const linksHtml = links.map((l) =>
      `      <a href="${esc(l.href)}" className="text-sm text-muted-foreground hover:text-foreground transition-colors">${esc(l.label)}</a>`
    ).join('\n');
    const cta = p.ctaLabel
      ? `  <a href="${esc(p.ctaHref ?? '#')}" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">${esc(p.ctaLabel)}</a>`
      : '';
    return [
      `<nav className="${cls}">`,
      `  <div className="flex items-center gap-2">${logoHtml}</div>`,
      links.length > 0 ? `  <div className="hidden items-center gap-6 md:flex">\n${linksHtml}\n  </div>` : '',
      cta,
      '</nav>',
    ].filter(Boolean).join('\n');
  },

  Footer: (p) => {
    const columns = (p.columns ?? []) as Array<{ title: string; links: Array<{ label: string; href: string }> }>;
    const cls = ['w-full bg-gray-900 px-6 py-12 text-gray-300', p.className].filter(Boolean).join(' ');
    const colCount = columns.length;
    const gridCls = colCount <= 2 ? 'grid-cols-1 md:grid-cols-2' : colCount === 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-4';
    const columnsHtml = columns.length > 0
      ? [
        `  <div className="grid ${gridCls} gap-8 mb-8">`,
        ...columns.map((col) => [
          `    <div>`,
          `      <h4 className="mb-3 text-sm font-semibold text-white">${esc(col.title)}</h4>`,
          '      <ul className="space-y-2">',
          ...col.links.map((l) => `        <li><a href="${esc(l.href)}" className="text-sm text-gray-400 hover:text-white transition-colors">${esc(l.label)}</a></li>`),
          '      </ul>',
          '    </div>',
        ].join('\n')),
        '  </div>',
      ].join('\n')
      : '';
    return [
      `<footer className="${cls}">`,
      '  <div className="mx-auto max-w-screen-lg">',
      columnsHtml,
      '    <div className="flex items-center justify-between border-t border-gray-700 pt-6">',
      p.logo ? `      <span className="text-sm font-semibold text-white">${esc(p.logo)}</span>` : '',
      p.copyright ? `      <span className="text-xs text-gray-500">${esc(p.copyright)}</span>` : '',
      '    </div>',
      '  </div>',
      '</footer>',
    ].filter(Boolean).join('\n');
  },

  Feature: (p) => {
    const cls = ['flex flex-col gap-2', p.className].filter(Boolean).join(' ');
    return [
      `<div className="${cls}">`,
      p.icon ? `  <span className="text-3xl">${esc(p.icon)}</span>` : '',
      `  <h3 className="text-base font-semibold">${esc(p.title)}</h3>`,
      p.description ? `  <p className="text-sm text-muted-foreground">${esc(p.description)}</p>` : '',
      '</div>',
    ].filter(Boolean).join('\n');
  },

  Testimonial: (p) => {
    const cls = ['rounded-lg border bg-card p-6 shadow-sm', p.className].filter(Boolean).join(' ');
    const avatar = p.avatarSrc
      ? `<img src="${esc(p.avatarSrc)}" alt="${esc(p.author)}" className="h-10 w-10 rounded-full object-cover" />`
      : `<div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">${esc(p.author.slice(0, 2).toUpperCase())}</div>`;
    return [
      `<div className="${cls}">`,
      `  <blockquote className="text-sm italic leading-relaxed">&ldquo;${esc(p.quote)}&rdquo;</blockquote>`,
      '  <div className="mt-4 flex items-center gap-3">',
      `    ${avatar}`,
      '    <div>',
      `      <div className="text-sm font-medium">${esc(p.author)}</div>`,
      p.role ? `      <div className="text-xs text-muted-foreground">${esc(p.role)}</div>` : '',
      '    </div>',
      '  </div>',
      '</div>',
    ].filter(Boolean).join('\n');
  },

  PricingCard: (p) => {
    const features = (p.features ?? []) as string[];
    const highlighted = p.highlighted ? ' border-primary ring-2 ring-primary' : '';
    const cls = ['flex flex-col rounded-lg border bg-card p-6 shadow-sm' + highlighted, p.className].filter(Boolean).join(' ');
    const featureLis = features.map((f) =>
      `    <li className="flex items-start gap-2 text-sm">\n      <span className="mt-0.5 text-emerald-500">&#10003;</span>\n      ${esc(f)}\n    </li>`
    ).join('\n');
    const btnVariant = p.highlighted
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : 'border border-input bg-background hover:bg-accent';
    return [
      `<div className="${cls}">`,
      '  <div className="mb-4">',
      `    <h3 className="text-lg font-semibold">${esc(p.tier)}</h3>`,
      p.description ? `    <p className="mt-1 text-sm text-muted-foreground">${esc(p.description)}</p>` : '',
      '  </div>',
      `  <div className="mb-6 text-3xl font-bold">${esc(p.price)}</div>`,
      '  <ul className="mb-6 flex-1 space-y-2">',
      featureLis,
      '  </ul>',
      p.ctaLabel ? `  <button className="w-full rounded-md px-4 py-2 text-sm font-medium ${btnVariant}">${esc(p.ctaLabel)}</button>` : '',
      '</div>',
    ].filter(Boolean).join('\n');
  },

  CTA: (p, children) => {
    const cls = ['w-full rounded-lg bg-primary px-6 py-16 text-center text-primary-foreground', p.className].filter(Boolean).join(' ');
    return [
      `<section className="${cls}">`,
      `  <h2 className="text-3xl font-bold">${esc(p.headline)}</h2>`,
      p.description ? `  <p className="mx-auto mt-3 max-w-2xl text-lg opacity-80">${esc(p.description)}</p>` : '',
      children ? `  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">\n${indent(children, 4)}\n  </div>` : '',
      '</section>',
    ].filter(Boolean).join('\n');
  },

  Accordion: (p) => {
    const items = (p.items ?? []) as Array<{ title: string; content: string }>;
    const cls = ['divide-y rounded-lg border', p.className].filter(Boolean).join(' ');
    const itemsHtml = items.map((item) => [
      '  <details className="group">',
      `    <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted transition-colors">`,
      `      ${esc(item.title)}`,
      '      <span className="text-muted-foreground transition-transform group-open:rotate-180">&#9660;</span>',
      '    </summary>',
      `    <div className="px-4 pb-3 text-sm text-muted-foreground">${esc(item.content)}</div>`,
      '  </details>',
    ].join('\n')).join('\n');
    return `<div className="${cls}">\n${itemsHtml}\n</div>`;
  },

  Avatar: (p) => {
    const sizeMap: Record<string, string> = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-base' };
    const size = sizeMap[p.size ?? 'md'] ?? sizeMap.md;
    const cls = ['inline-flex items-center justify-center rounded-full bg-muted overflow-hidden', size, p.className].filter(Boolean).join(' ');
    if (p.src) {
      return `<img src="${esc(p.src)}" alt="${esc(p.alt ?? '')}" className="${cls} object-cover" />`;
    }
    return `<div className="${cls}">${esc(p.fallback ?? '?')}</div>`;
  },

  Spacer: (p) => {
    const sizeMap: Record<string, string> = { sm: 'h-4', md: 'h-8', lg: 'h-12', xl: 'h-16' };
    const h = sizeMap[p.size ?? 'md'] ?? 'h-8';
    const cls = [h, p.className].filter(Boolean).join(' ');
    return `<div className="${cls}" aria-hidden="true" />`;
  },

  /* ── Forms ──────────────────────────────────────────────────── */

  Form: (p, children) => {
    const cls = ['space-y-3 rounded-lg border p-4', p.className].filter(Boolean).join(' ');
    return [
      `<form className="${cls}">`,
      p.title ? `  <div className="text-sm font-semibold">${esc(p.title)}</div>` : '',
      `  <div className="space-y-3">\n${indent(children, 4)}\n  </div>`,
      '</form>',
    ].filter(Boolean).join('\n');
  },

  Input: (p, _children, _meta, stateful) => {
    const cls = ['flex flex-col gap-1 text-sm', p.className].filter(Boolean).join(' ');
    const fieldName = slugify(p.label ?? 'field');
    if (stateful) {
      return [
        `<label className="${cls}">`,
        `  <span className="text-xs text-muted-foreground">${esc(p.label)}</span>`,
        `  <input type="${p.type ?? 'text'}" placeholder="${esc(p.placeholder ?? '')}" value={String(get('/form/${fieldName}') ?? '')} onChange={e => set('/form/${fieldName}', e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />`,
        '</label>',
      ].join('\n');
    }
    return [
      `<label className="${cls}">`,
      `  <span className="text-xs text-muted-foreground">${esc(p.label)}</span>`,
      `  <input type="${p.type ?? 'text'}" placeholder="${esc(p.placeholder ?? '')}" className="rounded-md border border-input bg-background px-3 py-2 text-sm" />`,
      '</label>',
    ].join('\n');
  },

  Select: (p, _children, _meta, stateful) => {
    const options = (p.options ?? []) as Array<{ value: string; label: string }>;
    const cls = ['flex flex-col gap-1 text-sm', p.className].filter(Boolean).join(' ');
    const optionsHtml = options.map((opt) => `    <option value="${esc(opt.value)}">${esc(opt.label)}</option>`).join('\n');
    const fieldName = slugify(p.label ?? 'field');
    if (stateful) {
      return [
        `<label className="${cls}">`,
        `  <span className="text-xs text-muted-foreground">${esc(p.label)}</span>`,
        `  <select value={String(get('/form/${fieldName}') ?? '')} onChange={e => set('/form/${fieldName}', e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">`,
        optionsHtml,
        '  </select>',
        '</label>',
      ].join('\n');
    }
    return [
      `<label className="${cls}">`,
      `  <span className="text-xs text-muted-foreground">${esc(p.label)}</span>`,
      '  <select className="rounded-md border border-input bg-background px-3 py-2 text-sm">',
      optionsHtml,
      '  </select>',
      '</label>',
    ].join('\n');
  },

  /* ── Complex / Placeholder ──────────────────────────────────── */

  Chart: (p) => {
    const data = p.data ?? [];
    return [
      '{/* Chart component — integrate recharts or a charting library */}',
      `<div className="rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground${p.className ? ` ${p.className}` : ''}">`,
      `  [${esc(p.type ?? 'bar')} chart — ${data.length} data points]`,
      `  {/* Data: ${jsonLiteral(data).slice(0, 200)}${jsonLiteral(data).length > 200 ? '...' : ''} */}`,
      '</div>',
    ].join('\n');
  },

  Map: (p) => {
    const center = p.center ?? [0, 20];
    const zoom = p.zoom ?? 2;
    const markerCount = (p.markers ?? []).length;
    return [
      '{/* Map component — integrate maplibre-gl for interactive maps */}',
      `<div className="rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground${p.className ? ` ${p.className}` : ''}" style={{ height: "${p.height ?? '300px'}" }}>`,
      `  [Map: center=[${center}], zoom=${zoom}${markerCount > 0 ? `, ${markerCount} marker(s)` : ''}]`,
      '</div>',
    ].join('\n');
  },

  AutoForm: (p) => {
    const fieldCount = Object.keys(p.schema ?? {}).length;
    return [
      '{/* AutoForm component — generates form fields from schema */}',
      `<div className="rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground${p.className ? ` ${p.className}` : ''}">`,
      `  [Auto-generated form${p.title ? `: ${esc(p.title)}` : ''} — ${fieldCount} field(s)]`,
      '</div>',
    ].join('\n');
  },

};

/* ── spec walker ──────────────────────────────────────────────── */

interface ElementDef {
  type: string;
  props?: Record<string, any>;
  children?: string[];
  on?: Record<string, { action: string; actionParams?: Record<string, unknown> }>;
  visible?: Record<string, unknown>;
}

function renderElement(
  key: string,
  elements: Record<string, ElementDef>,
  stateful: boolean,
): string {
  const el = elements[key];
  if (!el) return `{/* Unknown element: ${key} */}`;

  const props = el.props ?? {};
  const template = templates[el.type];

  // Build element metadata for templates that need on/visible
  const meta: ElementMeta = {};
  if (el.on) meta.on = el.on;
  if (el.visible) meta.visible = el.visible;

  // Render children first
  let childrenJsx = '';
  if (el.children && el.children.length > 0) {
    childrenJsx = el.children
      .map((childKey) => renderElement(childKey, elements, stateful))
      .join('\n');
  }

  let jsx: string;
  if (template) {
    jsx = template(props, childrenJsx, meta, stateful);
  } else {
    // Fallback for unknown types
    jsx = [
      `{/* Unknown component: ${el.type} */}`,
      `<div className="rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground">`,
      `  [${el.type}]`,
      '</div>',
    ].join('\n');
  }

  // If stateful, handle onClick for non-Button elements with `on.press`
  if (stateful && el.on?.press && el.type !== 'Button') {
    const press = el.on.press;
    const handler = `onClick={() => dispatch(${JSON.stringify(press.action)}, ${JSON.stringify(press.actionParams ?? {})})}`;
    // Wrap in a clickable div
    jsx = `<div ${handler} style={{ cursor: 'pointer' }}>\n${indent(jsx, 2)}\n</div>`;
  }

  // Wrap with visibility condition if present
  if (stateful && el.visible) {
    jsx = `{evalCondition(${JSON.stringify(el.visible)}) && (\n${indent(jsx, 2)}\n)}`;
  }

  return jsx;
}

/* ── normalizer (same as UIPartView) ──────────────────────────── */

function normalizeSpec(spec: any): { root: string; elements: Record<string, ElementDef>; state?: Record<string, unknown> } | null {
  if (typeof spec?.root === 'string' && spec?.elements) {
    return { root: spec.root, elements: spec.elements, state: spec.state };
  }

  if (spec?.root && typeof spec.root === 'object' && spec.root.type) {
    const elements: Record<string, ElementDef> = {};
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

      const el: ElementDef = {
        type: node.type,
        props: node.props || {},
        ...(childKeys.length > 0 ? { children: childKeys } : {}),
      };

      // Preserve on and visible from nested format
      if (node.on) el.on = node.on;
      if (node.visible) el.visible = node.visible;

      elements[key] = el;

      return key;
    }

    const rootKey = flattenElement(spec.root);
    return { root: rootKey, elements, state: spec.state };
  }

  return null;
}

/* ── state detection ──────────────────────────────────────────── */

/**
 * Determine whether a spec requires interactive (stateful) code generation.
 * Returns true if the spec has state, any element has `on` or `visible`,
 * or any prop contains a $path/$concat/$template expression.
 */
function specNeedsState(spec: any, elements: Record<string, ElementDef>): boolean {
  // Has explicit state
  if (spec?.state && typeof spec.state === 'object' && Object.keys(spec.state).length > 0) {
    return true;
  }

  // Check all elements for on, visible, or dynamic props
  for (const el of Object.values(elements)) {
    if (el.on) return true;
    if (el.visible) return true;
    if (el.props && hasDynamicExpr(el.props)) return true;
    // Input/Select always need state binding in stateful mode,
    // but we only go stateful if something else triggers it
  }

  return false;
}

/* ── runtime helpers code generation ──────────────────────────── */

function generateRuntimeHelpers(initialState: Record<string, unknown>): string {
  const stateJson = JSON.stringify(initialState, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : '  ' + line))
    .join('\n');

  return `  // ── State management ────────────────────────────────────────
  const [state, _setState] = useState<Record<string, unknown>>(${stateJson});

  function get(path: string): unknown {
    return path.split('/').filter(Boolean).reduce((obj: any, key: string) => obj?.[key], state);
  }

  function set(path: string, value: unknown) {
    _setState(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('/').filter(Boolean);
      let obj: any = next;
      for (let i = 0; i < keys.length - 1; i++) {
        if (obj[keys[i]] === undefined) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  }

  // ── Expression resolver ──────────────────────────────────────
  function resolve(params: any): any {
    if (params === null || params === undefined) return params;
    if (typeof params === 'object' && !Array.isArray(params)) {
      if (typeof params.$path === 'string') return get(params.$path);
      if (Array.isArray(params.$concat)) return params.$concat.map((i: any) => resolve(i)).join('');
      if (typeof params.$template === 'string') {
        return params.$template.replace(/\\$\\{([^}]+)\\}/g, (_: string, p: string) => String(get(p.trim()) ?? ''));
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(params)) out[k] = resolve(v);
      return out;
    }
    if (Array.isArray(params)) return params.map(resolve);
    return params;
  }

  // ── Visibility evaluator ─────────────────────────────────────
  function evalCondition(cond: any): boolean {
    if (!cond) return false;
    if (typeof cond !== 'object') return !!cond;
    if (typeof cond.path === 'string') return !!get(cond.path);
    if (cond.eq) return resolve(cond.eq[0]) === resolve(cond.eq[1]);
    if (cond.ne) return resolve(cond.ne[0]) !== resolve(cond.ne[1]);
    if (cond.gt) return Number(resolve(cond.gt[0])) > Number(resolve(cond.gt[1]));
    if (cond.gte) return Number(resolve(cond.gte[0])) >= Number(resolve(cond.gte[1]));
    if (cond.lt) return Number(resolve(cond.lt[0])) < Number(resolve(cond.lt[1]));
    if (cond.lte) return Number(resolve(cond.lte[0])) <= Number(resolve(cond.lte[1]));
    if (cond.and) return cond.and.every(evalCondition);
    if (cond.or) return cond.or.some(evalCondition);
    if (cond.not) return !evalCondition(cond.not);
    return false;
  }

  // ── Action dispatch ──────────────────────────────────────────
  function dispatch(action: string, params: any) {
    const r = resolve(params);
    switch (action) {
      case 'setState':
        if (r?.path) set(r.path, r.value);
        break;
      case 'toggleState':
        if (r?.path) set(r.path, !get(r.path));
        break;
      case 'appendItem':
        if (r?.path) {
          const cur = get(r.path);
          set(r.path, [...(Array.isArray(cur) ? cur : []), r.item]);
        }
        break;
      case 'removeItem':
        if (r?.path && typeof r.index === 'number') {
          const cur = get(r.path);
          if (Array.isArray(cur)) set(r.path, cur.filter((_: any, i: number) => i !== r.index));
        }
        break;
      case 'navigate':
        if (r?.url) window.location.assign(r.url);
        break;
      case 'submit':
        console.info('Form submit', r?.data);
        break;
      case 'sequence':
        if (Array.isArray(r?.actions)) r.actions.forEach((s: any) => dispatch(s.action, s.actionParams));
        break;
      case 'conditional': {
        const met = evalCondition(r?.condition);
        const branch = met ? r?.then : r?.else;
        if (branch?.action) dispatch(branch.action, branch.actionParams);
        break;
      }
    }
  }
`;
}

/* ── public API ───────────────────────────────────────────────── */

export function specToReact(spec: any, componentName = 'GeneratedComponent'): string {
  const normalized = normalizeSpec(spec);

  if (!normalized) {
    return [
      "import React from 'react';",
      '',
      `export function ${componentName}() {`,
      '  return (',
      '    <div className="p-4 text-sm text-muted-foreground">',
      '      {/* Could not parse spec */}',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
  }

  const stateful = specNeedsState(spec, normalized.elements);
  const jsx = renderElement(normalized.root, normalized.elements, stateful);
  const indentedJsx = indent(jsx, 4);

  if (!stateful) {
    // Static path — backwards compatible, no useState
    return [
      "import React from 'react';",
      '',
      `export function ${componentName}() {`,
      '  return (',
      indentedJsx,
      '  );',
      '}',
    ].join('\n');
  }

  // Interactive path — includes state, handlers, expression resolution
  const initialState = normalized.state ?? { form: {} };
  const helpers = generateRuntimeHelpers(initialState as Record<string, unknown>);

  return [
    "import React, { useState } from 'react';",
    '',
    `export function ${componentName}() {`,
    helpers,
    '  return (',
    indentedJsx,
    '  );',
    '}',
  ].join('\n');
}
