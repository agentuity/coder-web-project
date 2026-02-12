/**
 * Converts a normalized json-render spec into a standalone React component (.tsx file)
 * with Tailwind CSS classes. No json-render dependencies required.
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

/* ── spacing / alignment maps (mirrors ui-registry) ───────────── */

const spacingMap: Record<string, string> = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };
const paddingMap: Record<string, string> = { sm: 'p-3', md: 'p-4', lg: 'p-6' };
const alignMap: Record<string, string> = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' };

/* ── component templates ──────────────────────────────────────── */

type TemplateFn = (props: Record<string, any>, children: string) => string;

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

  Text: (p) => {
    const variants: Record<string, string> = { heading: 'text-lg font-semibold', subheading: 'text-base font-medium', body: 'text-sm', caption: 'text-xs text-muted-foreground' };
    const cls = [variants[p.variant ?? 'body'] ?? 'text-sm', p.className].filter(Boolean).join(' ');
    return `<p className="${cls}">${esc(p.content)}</p>`;
  },

  Heading: (p) => {
    const level = p.level ?? '2';
    const sizeMap: Record<string, string> = { '1': 'text-4xl font-bold tracking-tight', '2': 'text-3xl font-bold tracking-tight', '3': 'text-2xl font-semibold', '4': 'text-xl font-semibold', '5': 'text-lg font-medium', '6': 'text-base font-medium' };
    const cls = [sizeMap[level] ?? 'text-3xl font-bold tracking-tight', p.className].filter(Boolean).join(' ');
    const tag = `h${level}`;
    return `<${tag} className="${cls}">${esc(p.content)}</${tag}>`;
  },

  Paragraph: (p) => {
    const cls = ['text-sm leading-relaxed', p.className].filter(Boolean).join(' ');
    return `<p className="${cls}">${esc(p.content)}</p>`;
  },

  /* ── Interactive ────────────────────────────────────────────── */

  Button: (p) => {
    const variantMap: Record<string, string> = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
    };
    const v = variantMap[p.variant ?? 'primary'] ?? variantMap.primary;
    const cls = ['inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors', v, p.className].filter(Boolean).join(' ');
    return `<button className="${cls}">${esc(p.label)}</button>`;
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

  Metric: (p) => {
    const trendCls = p.trend === 'up' ? 'text-emerald-600' : p.trend === 'down' ? 'text-red-600' : 'text-muted-foreground';
    const trendIcon = p.trend === 'up' ? '▲ ' : p.trend === 'down' ? '▼ ' : '';
    const cls = ['rounded-lg border bg-card px-4 py-3 shadow-sm', p.className].filter(Boolean).join(' ');
    return [
      `<div className="${cls}">`,
      `  <div className="text-xs text-muted-foreground">${esc(p.label)}</div>`,
      `  <div className="mt-1 text-2xl font-semibold">${esc(p.value)}</div>`,
      p.change ? `  <div className="mt-1 text-xs font-medium ${trendCls}">${trendIcon}${esc(p.change)}</div>` : '',
      '</div>',
    ].filter(Boolean).join('\n');
  },

  Badge: (p) => {
    const variantMap: Record<string, string> = {
      default: 'bg-secondary text-secondary-foreground',
      success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
      warning: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
      error: 'bg-destructive text-destructive-foreground',
      info: 'border-blue-500/30 bg-blue-500/10 text-blue-600',
    };
    const v = variantMap[p.variant ?? 'default'] ?? variantMap.default;
    const cls = ['inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', v, p.className].filter(Boolean).join(' ');
    return `<span className="${cls}">${esc(p.text)}</span>`;
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

  Input: (p) => {
    const cls = ['flex flex-col gap-1 text-sm', p.className].filter(Boolean).join(' ');
    return [
      `<label className="${cls}">`,
      `  <span className="text-xs text-muted-foreground">${esc(p.label)}</span>`,
      `  <input type="${p.type ?? 'text'}" placeholder="${esc(p.placeholder ?? '')}" className="rounded-md border border-input bg-background px-3 py-2 text-sm" />`,
      '</label>',
    ].join('\n');
  },

  Select: (p) => {
    const options = (p.options ?? []) as Array<{ value: string; label: string }>;
    const cls = ['flex flex-col gap-1 text-sm', p.className].filter(Boolean).join(' ');
    const optionsHtml = options.map((opt) => `    <option value="${esc(opt.value)}">${esc(opt.label)}</option>`).join('\n');
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

  ApiReference: (p) => {
    return [
      '{/* ApiReference component — integrate @scalar/api-reference-react */}',
      `<div className="rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground${p.className ? ` ${p.className}` : ''}" style={{ height: "600px" }}>`,
      p.specUrl ? `  [API Reference: ${esc(p.specUrl)}]` : '  [API Reference: inline spec]',
      '</div>',
    ].join('\n');
  },
};

/* ── spec walker ──────────────────────────────────────────────── */

function renderElement(
  key: string,
  elements: Record<string, { type: string; props?: Record<string, any>; children?: string[] }>,
): string {
  const el = elements[key];
  if (!el) return `{/* Unknown element: ${key} */}`;

  const props = el.props ?? {};
  const template = templates[el.type];

  // Render children first
  let childrenJsx = '';
  if (el.children && el.children.length > 0) {
    childrenJsx = el.children
      .map((childKey) => renderElement(childKey, elements))
      .join('\n');
  }

  if (template) {
    return template(props, childrenJsx);
  }

  // Fallback for unknown types
  return [
    `{/* Unknown component: ${el.type} */}`,
    `<div className="rounded-lg border bg-muted p-4 text-center text-sm text-muted-foreground">`,
    `  [${el.type}]`,
    '</div>',
  ].join('\n');
}

/* ── normalizer (same as UIPartView) ──────────────────────────── */

function normalizeSpec(spec: any): { root: string; elements: Record<string, any> } | null {
  if (typeof spec?.root === 'string' && spec?.elements) {
    return spec;
  }

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

  return null;
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

  const jsx = renderElement(normalized.root, normalized.elements);
  const indentedJsx = indent(jsx, 4);

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
