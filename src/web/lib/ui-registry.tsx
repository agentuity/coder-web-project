import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import JsxParser from 'react-jsx-parser';
import { defineRegistry, useStateStore } from '@json-render/react';
import { shadcnComponents } from '@json-render/shadcn';
import { catalog } from './ui-catalog';
import { cn } from './utils';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Type bridge: @json-render/shadcn@0.7 components use BaseComponentProps (with `on`, `bindings`)
// but the project's @json-render/react@0.5 uses ComponentContext (without them).
// Runtime is compatible — components only destructure what they need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sc = shadcnComponents as Record<string, any>;

/* ── shadcn component imports (used by custom components) ──── */
import { Card as ShadcnCard } from '../components/ui/card';
import { Button as ShadcnButton } from '../components/ui/button';
import { Input as ShadcnInput } from '../components/ui/input';
import { Select as ShadcnSelect, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { Avatar as ShadcnAvatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';

/* ── helpers ──────────────────────────────────────────────────── */

type ChartDatum = number | Record<string, unknown>;

const spacingMap: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
};

const alignMap: Record<'start' | 'center' | 'end' | 'stretch', string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

/* ── Mermaid text-contrast helpers ──────────────────────────── */

function mermaidGetLuminance(hex: string): number {
  const rgb = hex.replace('#', '').match(/.{2}/g);
  if (!rgb || rgb.length < 3) return 0.5;
  const vals = rgb.map(c => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (vals[0] ?? 0) + 0.7152 * (vals[1] ?? 0) + 0.0722 * (vals[2] ?? 0);
}

function mermaidColorToHex(color: string): string | null {
  if (!color) return null;
  const trimmed = color.trim().toLowerCase();
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) {
    const hex = trimmed.replace('#', '');
    if (hex.length === 3) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    if (hex.length >= 6) return `#${hex.slice(0, 6)}`;
    return null;
  }
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
    const toHex = (n: string) => parseInt(n).toString(16).padStart(2, '0');
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }
  const named: Record<string, string> = {
    white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000',
    blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', pink: '#ffc0cb',
    purple: '#800080', gray: '#808080', grey: '#808080', transparent: '#ffffff',
    lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkgray: '#a9a9a9', darkgrey: '#a9a9a9',
  };
  if (named[trimmed]) return named[trimmed];
  return null;
}

function mermaidFixTextContrast(container: HTMLElement) {
  const textEls = container.querySelectorAll<SVGTextElement | SVGTSpanElement>('text, tspan');
  for (const textEl of textEls) {
    let fillColor: string | null = null;
    let ancestor: Element | null = textEl.parentElement;
    while (ancestor && ancestor !== container) {
      if (ancestor.tagName.toLowerCase() === 'g') {
        const shape = ancestor.querySelector('rect, circle, ellipse, polygon, path');
        if (shape) {
          const shapeFill = shape.getAttribute('fill') || (shape as HTMLElement).style?.fill;
          if (shapeFill && shapeFill !== 'none' && shapeFill !== 'transparent') {
            fillColor = shapeFill;
            break;
          }
        }
      }
      const ancestorFill = ancestor.getAttribute('fill') || (ancestor as HTMLElement).style?.fill;
      if (ancestorFill && ancestorFill !== 'none' && ancestorFill !== 'transparent' &&
          ['rect', 'circle', 'ellipse', 'polygon', 'path'].includes(ancestor.tagName.toLowerCase())) {
        fillColor = ancestorFill;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (!fillColor) continue;
    const hex = mermaidColorToHex(fillColor);
    if (!hex) {
      textEl.setAttribute('fill', '#000000');
      textEl.style.textShadow = '0 1px 2px rgba(255,255,255,0.6)';
      continue;
    }
    const lum = mermaidGetLuminance(hex);
    if (lum < 0.18) {
      textEl.setAttribute('fill', '#ffffff');
      textEl.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';
    } else {
      textEl.setAttribute('fill', '#000000');
      textEl.style.textShadow = '0 1px 2px rgba(255,255,255,0.6)';
    }
  }
}

const chartPalette = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#14b8a6', '#facc15'];

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function normalizeChartData(data: ChartDatum[], xKey?: string, yKey?: string) {
  return data.map((item, index) => {
    if (typeof item === 'number') {
      return { x: String(index + 1), y: item };
    }
    const x = xKey ? item[xKey] : item.label ?? item.name ?? index + 1;
    const y = yKey ? item[yKey] : item.value ?? item.count ?? 0;
    return { x: String(x ?? index + 1), y: toNumber(y) };
  });
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const toRadians = (angle: number) => (Math.PI / 180) * angle;
  const start = {
    x: cx + r * Math.cos(toRadians(startAngle)),
    y: cy + r * Math.sin(toRadians(startAngle)),
  };
  const end = {
    x: cx + r * Math.cos(toRadians(endAngle)),
    y: cy + r * Math.sin(toRadians(endAngle)),
  };
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

/* ── registry ─────────────────────────────────────────────────── */

export const { registry } = defineRegistry(catalog, {
  components: {
    /* ── shadcn-backed components (from @json-render/shadcn) ──── */
    Card: sc.Card,
    Text: sc.Text,
    Button: sc.Button,
    Table: sc.Table,
    Input: sc.Input,
    Select: sc.Select,
    Image: sc.Image,
    Badge: sc.Badge,
    Alert: sc.Alert,
    Link: sc.Link,
    Stack: sc.Stack,
    Heading: sc.Heading,
    Avatar: sc.Avatar,
    Accordion: sc.Accordion,
    Grid: sc.Grid,
    Separator: sc.Separator,

    /* ── New shadcn components ────────────────────────────────── */
    Tabs: sc.Tabs,
    Collapsible: sc.Collapsible,
    Pagination: sc.Pagination,
    Dialog: sc.Dialog,
    Drawer: sc.Drawer,
    Tooltip: sc.Tooltip,
    Popover: sc.Popover,
    DropdownMenu: sc.DropdownMenu,
    Carousel: sc.Carousel,
    Progress: sc.Progress,
    Skeleton: sc.Skeleton,
    Spinner: sc.Spinner,
    Textarea: sc.Textarea,
    Checkbox: sc.Checkbox,
    Radio: sc.Radio,
    Switch: sc.Switch,
    Slider: sc.Slider,
    Toggle: sc.Toggle,
    ToggleGroup: sc.ToggleGroup,
    ButtonGroup: sc.ButtonGroup,

    /* ── custom: Metric (uses shadcn Card internally) ──────────── */
    Metric: ({ props }) => (
      <ShadcnCard className={cn('px-4 py-3', props.className)}>
        <div className="text-xs text-[var(--muted-foreground)]">{props.label}</div>
        <div className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{props.value}</div>
        {props.change && (
          <div className={cn(
            'mt-1 text-xs font-medium',
            props.trend === 'up'
              ? 'text-emerald-600'
              : props.trend === 'down'
                ? 'text-red-600'
                : 'text-[var(--muted-foreground)]'
          )}>
            {props.trend === 'up' && '▲ '}
            {props.trend === 'down' && '▼ '}
            {props.change}
          </div>
        )}
      </ShadcnCard>
    ),

    /* ── custom: Chart ─────────────────────────────────────────── */
    Chart: ({ props }) => {
      const points = normalizeChartData(props.data, props.xKey, props.yKey);
      if (points.length === 0) {
        return (
          <div className={cn('rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 text-center text-xs text-[var(--muted-foreground)]', props.className)}>
            No data to display
          </div>
        );
      }
      const width = 360;
      const height = 160;
      const padding = 24;
      const maxY = Math.max(1, ...points.map((point) => point.y));
      const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
      const barWidth = points.length > 0 ? (width - padding * 2) / points.length : 0;

      if (props.type === 'pie') {
        const total = points.reduce((sum, point) => sum + point.y, 0) || 1;
        let startAngle = -90;
        return (
          <div className={cn('flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] p-3', props.className)}>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
              <title>Chart</title>
              {points.map((point, index) => {
                const sliceAngle = (point.y / total) * 360;
                const endAngle = startAngle + sliceAngle;
                const path = describeArc(width / 2, height / 2, Math.min(width, height) / 2 - 12, startAngle, endAngle);
                const fill = chartPalette[index % chartPalette.length];
                const slice = (
                  <path key={`${point.x}-${point.y}`} d={path} fill={fill} />
                );
                startAngle = endAngle;
                return slice;
              })}
            </svg>
          </div>
        );
      }

      return (
        <div className={cn('rounded-lg border border-[var(--border)] bg-[var(--background)] p-3', props.className)}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
            <title>Chart</title>
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border)" />
            <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="var(--border)" />
            {props.type === 'bar' && points.map((point, index) => {
              const barHeight = (point.y / maxY) * (height - padding * 2);
              const x = padding + index * barWidth;
              const y = height - padding - barHeight;
              return (
                <rect
                  key={`${point.x}-${point.y}`}
                  x={x + 4}
                  y={y}
                  width={Math.max(2, barWidth - 8)}
                  height={barHeight}
                  rx={4}
                  fill={chartPalette[index % chartPalette.length]}
                />
              );
            })}
            {props.type === 'line' && points.length > 0 && (
              <>
                <path
                  d={points.map((point, index) => {
                    const x = padding + index * stepX;
                    const y = height - padding - (point.y / maxY) * (height - padding * 2);
                    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
                  }).join(' ')}
                  fill="none"
                  stroke={chartPalette[0]}
                  strokeWidth={2}
                />
                {points.map((point, index) => {
                  const x = padding + index * stepX;
                  const y = height - padding - (point.y / maxY) * (height - padding * 2);
                  return <circle key={`${point.x}-${point.y}`} cx={x} cy={y} r={3.5} fill={chartPalette[0]} />;
                })}
              </>
            )}
          </svg>
        </div>
      );
    },

    /* ── custom: Form ──────────────────────────────────────────── */
    Form: ({ props, children, emit }) => {
      const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        emit?.('submit');
      };

      return (
        <form
          className={cn('space-y-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4', props.className)}
          onSubmit={handleSubmit}
        >
          {props.title && <div className="text-sm font-semibold text-[var(--foreground)]">{props.title}</div>}
          <div className="space-y-3">{children}</div>
        </form>
      );
    },

    /* ── custom layout: Row ────────────────────────────────────── */
    Row: ({ props, children }) => (
      <div className={cn('flex flex-row', spacingMap[props.gap ?? 'md'], alignMap[props.align ?? 'start'], props.className)}>
        {children}
      </div>
    ),

    /* ── custom layout: Column ─────────────────────────────────── */
    Column: ({ props, children }) => (
      <div className={cn('flex flex-col', spacingMap[props.gap ?? 'md'], alignMap[props.align ?? 'start'], props.className)}>
        {children}
      </div>
    ),

    /* ── custom: Code ──────────────────────────────────────────── */
    Code: ({ props }) => (
      <pre className={cn('overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs text-[var(--foreground)]', props.className)}>
        <code data-language={props.language}>{props.content}</code>
      </pre>
    ),

    /* ── Phase 2: Landing page components ────────────────────────── */

    /* ── Hero ─────────────────────────────────────────────────────── */
    Hero: ({ props, children }) => {
      const gradientMap: Record<string, string> = {
        none: '',
        blue: 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white',
        purple: 'bg-gradient-to-br from-purple-600 to-pink-600 text-white',
        green: 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white',
        orange: 'bg-gradient-to-br from-orange-500 to-red-600 text-white',
        dark: 'bg-gradient-to-br from-gray-900 to-gray-800 text-white',
      };
      const gradient = gradientMap[props.backgroundGradient ?? 'none'] ?? '';
      const alignment = props.align === 'left' ? 'text-left items-start' : 'text-center items-center';

      return (
        <section
          className={cn(
            'relative flex w-full flex-col justify-center px-6 py-20 md:py-32',
            gradient,
            alignment,
            props.className,
          )}
          style={props.backgroundImage ? { backgroundImage: `url(${props.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          <div className={cn('mx-auto flex max-w-4xl flex-col', alignment, 'gap-4')}>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">{props.headline}</h1>
            {props.subheadline && (
              <p className="max-w-2xl text-lg opacity-80 md:text-xl">{props.subheadline}</p>
            )}
            {children && <div className="mt-4 flex flex-wrap gap-3">{children}</div>}
          </div>
        </section>
      );
    },

    /* ── Section ──────────────────────────────────────────────────── */
    Section: ({ props, children }) => {
      const sectionBgMap: Record<string, string> = {
        default: 'bg-[var(--background)]',
        muted: 'bg-[var(--muted)]',
        primary: 'bg-[var(--primary)] text-[var(--primary-foreground)]',
        dark: 'bg-gray-900 text-white',
      };
      const sectionPaddingMap: Record<string, string> = {
        sm: 'py-8',
        md: 'py-12',
        lg: 'py-16',
        xl: 'py-24',
      };
      const bg = sectionBgMap[props.background ?? 'default'] ?? '';
      const pad = sectionPaddingMap[props.padding ?? 'lg'] ?? 'py-16';

      return (
        <section className={cn('w-full px-6', bg, pad, props.className)}>
          {(props.title || props.subtitle) && (
            <div className="mx-auto mb-10 max-w-3xl text-center">
              {props.title && <h2 className="text-3xl font-bold tracking-tight">{props.title}</h2>}
              {props.subtitle && <p className="mt-2 text-lg opacity-70">{props.subtitle}</p>}
            </div>
          )}
          {children}
        </section>
      );
    },

    /* ── Container ────────────────────────────────────────────────── */
    Container: ({ props, children }) => {
      const maxWidthMap: Record<string, string> = {
        sm: 'max-w-screen-sm',
        md: 'max-w-screen-md',
        lg: 'max-w-screen-lg',
        xl: 'max-w-screen-xl',
        full: 'max-w-full',
      };
      return (
        <div className={cn('mx-auto px-4', maxWidthMap[props.maxWidth ?? 'lg'], props.className)}>
          {children}
        </div>
      );
    },

    /* ── Navbar ────────────────────────────────────────────────────── */
    Navbar: ({ props }) => (
      <nav className={cn('flex w-full items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--background)]', props.className)}>
        <div className="flex items-center gap-2">
          {props.logoSrc ? (
            <img src={props.logoSrc} alt={props.logo ?? 'Logo'} className="h-8 w-auto" />
          ) : props.logo ? (
            <span className="text-lg font-bold text-[var(--foreground)]">{props.logo}</span>
          ) : null}
        </div>
        <div className="hidden items-center gap-6 md:flex">
          {props.links?.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
              {link.label}
            </a>
          ))}
        </div>
        {props.ctaLabel && (
          <ShadcnButton size="sm" asChild>
            <a href={props.ctaHref ?? '#'}>{props.ctaLabel}</a>
          </ShadcnButton>
        )}
      </nav>
    ),

    /* ── Footer ────────────────────────────────────────────────────── */
    Footer: ({ props }) => (
      <footer className={cn('w-full bg-gray-900 px-6 py-12 text-gray-300', props.className)}>
        <div className="mx-auto max-w-screen-lg">
          {props.columns && props.columns.length > 0 && (
            <div className={cn('grid gap-8 mb-8', props.columns.length <= 2 ? 'grid-cols-1 md:grid-cols-2' : props.columns.length === 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-4')}>
              {props.columns.map((col) => (
                <div key={col.title}>
                  <h4 className="mb-3 text-sm font-semibold text-white">{col.title}</h4>
                  <ul className="space-y-2">
                    {col.links.map((link) => (
                      <li key={link.href}>
                        <a href={link.href} className="text-sm text-gray-400 hover:text-white transition-colors">{link.label}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-gray-700 pt-6">
            {props.logo && <span className="text-sm font-semibold text-white">{props.logo}</span>}
            {props.copyright && <span className="text-xs text-gray-500">{props.copyright}</span>}
          </div>
        </div>
      </footer>
    ),

    /* ── Feature ───────────────────────────────────────────────────── */
    Feature: ({ props }) => (
      <div className={cn('flex flex-col gap-2', props.className)}>
        {props.icon && <span className="text-3xl">{props.icon}</span>}
        <h3 className="text-base font-semibold text-[var(--foreground)]">{props.title}</h3>
        {props.description && (
          <p className="text-sm text-[var(--muted-foreground)]">{props.description}</p>
        )}
      </div>
    ),

    /* ── Testimonial ──────────────────────────────────────────────── */
    Testimonial: ({ props }) => (
      <ShadcnCard className={cn('p-6', props.className)}>
        <blockquote className="text-sm italic text-[var(--foreground)] leading-relaxed">
          &ldquo;{props.quote}&rdquo;
        </blockquote>
        <div className="mt-4 flex items-center gap-3">
          {props.avatarSrc ? (
            <ShadcnAvatar className="h-10 w-10">
              <AvatarImage src={props.avatarSrc} alt={props.author} />
              <AvatarFallback>{props.author.slice(0, 2).toUpperCase()}</AvatarFallback>
            </ShadcnAvatar>
          ) : (
            <ShadcnAvatar className="h-10 w-10">
              <AvatarFallback>{props.author.slice(0, 2).toUpperCase()}</AvatarFallback>
            </ShadcnAvatar>
          )}
          <div>
            <div className="text-sm font-medium text-[var(--foreground)]">{props.author}</div>
            {props.role && <div className="text-xs text-[var(--muted-foreground)]">{props.role}</div>}
          </div>
        </div>
      </ShadcnCard>
    ),

    /* ── PricingCard ──────────────────────────────────────────────── */
    PricingCard: ({ props }) => (
      <ShadcnCard className={cn(
        'flex flex-col p-6',
        props.highlighted && 'border-[var(--primary)] ring-2 ring-[var(--primary)]',
        props.className,
      )}>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">{props.tier}</h3>
          {props.description && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{props.description}</p>}
        </div>
        <div className="mb-6 text-3xl font-bold text-[var(--foreground)]">{props.price}</div>
        <ul className="mb-6 flex-1 space-y-2">
          {props.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-[var(--foreground)]">
              <span className="mt-0.5 text-emerald-500">&#10003;</span>
              {feature}
            </li>
          ))}
        </ul>
        {props.ctaLabel && (
          <ShadcnButton variant={props.highlighted ? 'default' : 'outline'} className="w-full">
            {props.ctaLabel}
          </ShadcnButton>
        )}
      </ShadcnCard>
    ),

    /* ── CTA ──────────────────────────────────────────────────────── */
    CTA: ({ props, children }) => (
      <section className={cn('w-full rounded-lg bg-[var(--primary)] px-6 py-16 text-center text-[var(--primary-foreground)]', props.className)}>
        <h2 className="text-3xl font-bold">{props.headline}</h2>
        {props.description && <p className="mx-auto mt-3 max-w-2xl text-lg opacity-80">{props.description}</p>}
        {children && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div>}
      </section>
    ),

    /* ── Spacer ────────────────────────────────────────────────────── */
    Spacer: ({ props }) => {
      const spacerSizeMap: Record<string, string> = {
        sm: 'h-4',
        md: 'h-8',
        lg: 'h-12',
        xl: 'h-16',
      };
      return <div className={cn(spacerSizeMap[props.size ?? 'md'], props.className)} aria-hidden="true" />;
    },

    /* ── Phase 3: Rich integrations ──────────────────────────────── */

    /* ── Map (MapLibre GL) ───────────────────────────────────────── */
    Map: ({ props }) => {
      const stateStore = useStateStore();
      const containerRef = useRef<HTMLDivElement>(null);
      const mapRef = useRef<maplibregl.Map | null>(null);
      const domMarkersRef = useRef<maplibregl.Marker[]>([]);

      // Read markers from state if markersPath provided
      const stateMarkers = props.markersPath
        ? ((stateStore.get(props.markersPath) as Array<{ longitude: number; latitude: number; label?: string; popup?: string }>) ?? [])
        : [];
      const allMarkers = [...(props.markers ?? []), ...stateMarkers];

      // Initialize map
      useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const center = props.center ?? [0, 20];
        const zoom = props.zoom ?? 2;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
          center: center as [number, number],
          zoom,
        });

        map.addControl(new maplibregl.NavigationControl(), 'top-right');

        mapRef.current = map;

        // Click-to-add markers
        if (props.interactive && props.markersPath) {
          map.on('click', (e) => {
            const current = (stateStore.get(props.markersPath!) as Array<{ longitude: number; latitude: number; label?: string }>) ?? [];
            const label = props.labelPath
              ? (stateStore.get(props.labelPath) as string) || `Point ${current.length + 1}`
              : `Point ${current.length + 1}`;
            stateStore.set(props.markersPath!, [...current, {
              longitude: e.lngLat.lng,
              latitude: e.lngLat.lat,
              label,
            }]);
          });
        }

        // Draw route line
        map.on('load', () => {
          if (props.route && props.route.length >= 2) {
            map.addSource('route', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: props.route as [number, number][],
                },
              },
            });
            map.addLayer({
              id: 'route',
              type: 'line',
              source: 'route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: { 'line-color': '#3b82f6', 'line-width': 4 },
            });
          }
        });

        return () => {
          map.remove();
          mapRef.current = null;
        };
      }, []); // eslint-disable-line react-hooks/exhaustive-deps

      // Sync markers to map whenever they change
      useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        // Remove old markers
        for (const m of domMarkersRef.current) m.remove();
        domMarkersRef.current = [];

        // Add all markers
        for (const marker of allMarkers) {
          const el = document.createElement('div');
          el.style.cssText = 'width:24px;height:24px;background:#3b82f6;border:2px solid #fff;border-radius:50%;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.3);';

          const m = new maplibregl.Marker({ element: el })
            .setLngLat([marker.longitude, marker.latitude])
            .addTo(map);

          if (marker.popup) {
            m.setPopup(new maplibregl.Popup({ offset: 16 }).setText(marker.popup));
          }

          if (marker.label) {
            new maplibregl.Popup({
              offset: 16,
              closeButton: false,
              closeOnClick: false,
              className: 'maplibre-label-popup',
            })
              .setLngLat([marker.longitude, marker.latitude])
              .setText(marker.label)
              .addTo(map);
          }

          domMarkersRef.current.push(m);
        }
      }, [JSON.stringify(allMarkers)]); // eslint-disable-line

      return (
        <div
          ref={containerRef}
          className={cn('rounded-lg border border-[var(--border)] overflow-hidden', props.className)}
          style={{ height: props.height ?? '300px', width: '100%' }}
        />
      );
    },

    /* ── AutoForm (dynamic form generator) ───────────────────────── */
    AutoForm: ({ props, emit }) => {
      const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
        const defaults: Record<string, string | number | boolean> = {};
        for (const [name, field] of Object.entries(props.schema)) {
          if (field.default !== undefined) {
            defaults[name] = field.default;
          }
        }
        return defaults;
      });

      const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        emit?.('submit');
      };

      const updateField = (name: string, value: string | number | boolean) => {
        setValues((prev) => ({ ...prev, [name]: value }));
      };

      return (
        <form
          className={cn('space-y-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4', props.className)}
          onSubmit={handleSubmit}
        >
          {props.title && <div className="text-sm font-semibold text-[var(--foreground)]">{props.title}</div>}
          {Object.entries(props.schema).map(([name, field]) => {
            const fieldId = `autoform-${name}`;
            if (field.type === 'boolean') {
              return (
                <label key={name} className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                  <input
                    id={fieldId}
                    type="checkbox"
                    checked={Boolean(values[name])}
                    onChange={(e) => updateField(name, e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border)]"
                  />
                  <span>{field.label ?? name}</span>
                  {field.description && <span className="text-xs text-[var(--muted-foreground)]">({field.description})</span>}
                </label>
              );
            }
            if (field.type === 'select' && field.options) {
              return (
                <div key={name} className="flex flex-col gap-1">
                  <label htmlFor={fieldId} className="text-xs text-[var(--muted-foreground)]">{field.label ?? name}</label>
                  {field.description && <span className="text-xs text-[var(--muted-foreground)]">{field.description}</span>}
                  <ShadcnSelect
                    value={String(values[name] ?? '')}
                    onValueChange={(v) => updateField(name, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={field.placeholder ?? 'Select...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </ShadcnSelect>
                </div>
              );
            }
            // string or number
            return (
              <div key={name} className="flex flex-col gap-1">
                <label htmlFor={fieldId} className="text-xs text-[var(--muted-foreground)]">{field.label ?? name}</label>
                {field.description && <span className="text-xs text-[var(--muted-foreground)]">{field.description}</span>}
                <ShadcnInput
                  id={fieldId}
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={String(values[name] ?? '')}
                  placeholder={field.placeholder}
                  min={field.min}
                  max={field.max}
                  minLength={field.minLength}
                  maxLength={field.maxLength}
                  required={field.required}
                  onChange={(e) => {
                    const raw = e.target.value;
                    updateField(name, field.type === 'number' ? (raw === '' ? '' as unknown as number : Number(raw)) : raw);
                  }}
                />
              </div>
            );
          })}
          <ShadcnButton type="submit" variant="default" size="sm">
            {props.submitLabel ?? 'Submit'}
          </ShadcnButton>
        </form>
      );
    },

    /* ── Primitive components ────────────────────────────────────── */

    /* ── Box ──────────────────────────────────────────────────────── */
    Box: ({ props, children }) => (
      <div className={cn(props.className)}>{children}</div>
    ),

    /* ── Flex ─────────────────────────────────────────────────────── */
    Flex: ({ props, children }) => {
      const directionMap: Record<string, string> = {
        row: 'flex-row',
        col: 'flex-col',
        'row-reverse': 'flex-row-reverse',
        'col-reverse': 'flex-col-reverse',
      };
      const justifyMap: Record<string, string> = {
        start: 'justify-start',
        center: 'justify-center',
        end: 'justify-end',
        between: 'justify-between',
        around: 'justify-around',
        evenly: 'justify-evenly',
      };
      const itemsMap: Record<string, string> = {
        start: 'items-start',
        center: 'items-center',
        end: 'items-end',
        stretch: 'items-stretch',
        baseline: 'items-baseline',
      };
      return (
        <div className={cn(
          'flex',
          directionMap[props.direction ?? 'row'],
          props.wrap && 'flex-wrap',
          props.justify && justifyMap[props.justify],
          props.items && itemsMap[props.items],
          props.gap && spacingMap[props.gap],
          props.className,
        )}>
          {children}
        </div>
      );
    },

    /* ── Paragraph ────────────────────────────────────────────────── */
    Paragraph: ({ props }) => (
      <p className={cn('text-sm leading-relaxed text-[var(--foreground)]', props.className)}>{props.content}</p>
    ),

    /* ── List ─────────────────────────────────────────────────────── */
    List: ({ props }) => {
      const Tag = props.ordered ? 'ol' : 'ul';
      return (
        <Tag className={cn(
          'space-y-1 pl-5 text-sm text-[var(--foreground)]',
          props.ordered ? 'list-decimal' : 'list-disc',
          props.className,
        )}>
          {props.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </Tag>
      );
    },

    /* ── JSXPreview ────────────────────────────────────────────── */
    JSXPreview: ({ props }) => {
      const [error, setError] = useState<string | null>(null);

      return (
        <div className={cn('rounded-lg border border-[var(--border)] overflow-hidden', props.className)}>
          {props.title && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--muted)] border-b border-[var(--border)]">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
              </div>
              <span className="text-xs text-[var(--muted-foreground)] truncate">{props.title}</span>
            </div>
          )}
          <div className="p-4 bg-[var(--background)]">
            {error ? (
              <div className="text-sm text-red-400">JSX Error: {error}</div>
            ) : (
              <JsxParser
                jsx={props.jsx}
                renderInWrapper={false}
                renderError={({ error: err }: { error: string }) => {
                  setError(String(err));
                  return null;
                }}
                components={{}}
                onError={(err: Error) => setError(err.message)}
              />
            )}
          </div>
        </div>
      );
    },

    /* ── HtmlViewer ──────────────────────────────────────────────── */
    HtmlViewer: ({ props }) => {
      const height = props.height || '300px';
      // Wrap the HTML in a basic document with theme-aware styles
      const srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #e4e4e7;
    background: #18181b;
  }
  a { color: #60a5fa; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #3f3f46; padding: 8px; text-align: left; }
  th { background: #27272a; }
  pre { background: #27272a; padding: 12px; border-radius: 6px; overflow-x: auto; }
  code { font-family: ui-monospace, monospace; font-size: 13px; }
</style>
</head>
<body>${props.html}</body>
</html>`;

      return (
        <div className={cn('rounded-lg border border-[var(--border)] overflow-hidden', props.className)}>
          {props.title && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--muted)] border-b border-[var(--border)]">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
              </div>
              <span className="text-xs text-[var(--muted-foreground)] truncate">{props.title}</span>
            </div>
          )}
          <iframe
            srcDoc={srcdoc}
            sandbox="allow-scripts"
            className="w-full border-0 bg-[#18181b]"
            style={{ height }}
            title={props.title || 'HTML preview'}
          />
        </div>
      );
    },

    /* ── Mermaid ────────────────────────────────────────────────── */
    Mermaid: ({ props }) => {
      const containerRef = useRef<HTMLDivElement | null>(null);
      const [error, setError] = useState<string | null>(null);
      const [copied, setCopied] = useState(false);
      const [scale, setScale] = useState(1);
      const [translate, setTranslate] = useState({ x: 0, y: 0 });
      const [isDragging, setIsDragging] = useState(false);
      const dragStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

      const mermaidThemes = [
        { key: 'github-dark', label: 'GitHub Dark' },
        { key: 'github-light', label: 'GitHub Light' },
      ];

      const getDefaultTheme = () => {
        const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');
        return isDark ? 'github-dark' : 'github-light';
      };

      const [selectedTheme, setSelectedTheme] = useState(getDefaultTheme);

      useEffect(() => {
        let cancelled = false;
        setError(null);

        (async () => {
          try {
            const { renderMermaid, THEMES } = await import('beautiful-mermaid');
            if (cancelled) return;

            const theme = THEMES[selectedTheme as keyof typeof THEMES] || THEMES['github-dark'];
            const svg = await renderMermaid(props.code, theme);
            if (cancelled || !containerRef.current) return;
            containerRef.current.innerHTML = DOMPurify.sanitize(svg, {
              USE_PROFILES: { svg: true, svgFilters: true },
              ADD_TAGS: ['foreignObject'],
            });

            // Make SVG responsive
            const svgEl = containerRef.current.querySelector('svg');
            if (svgEl) {
              svgEl.style.width = '100%';
              svgEl.style.height = 'auto';
              svgEl.style.maxHeight = '600px';
            }

            // Fix text contrast on colored node fills
            mermaidFixTextContrast(containerRef.current);
          } catch (err) {
            if (!cancelled) {
              setError(err instanceof Error ? err.message : 'Failed to render diagram');
            }
          }
        })();

        return () => { cancelled = true; };
      }, [props.code, selectedTheme]);

      // ── Zoom/pan handlers ──────────────────────────────────────
      const zoomIn = useCallback(() => setScale(s => Math.min(s * 1.25, 4)), []);
      const zoomOut = useCallback(() => setScale(s => Math.max(s / 1.25, 0.25)), []);
      const resetView = useCallback(() => { setScale(1); setTranslate({ x: 0, y: 0 }); }, []);

      const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        const delta = e.deltaY > 0 ? 1 / 1.1 : 1.1;

        setScale(prevScale => {
          const newScale = Math.min(Math.max(prevScale * delta, 0.25), 4);
          const ratio = newScale / prevScale;
          setTranslate(prev => ({
            x: cursorX - ratio * (cursorX - prev.x),
            y: cursorY - ratio * (cursorY - prev.y),
          }));
          return newScale;
        });
      }, []);

      const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        // Don't start drag on button/select clicks
        if ((e.target as HTMLElement).closest('button, select, option')) return;
        e.preventDefault();
        setIsDragging(true);
        dragStart.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
      }, [translate.x, translate.y]);

      const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging || !dragStart.current) return;
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setTranslate({ x: dragStart.current.tx + dx, y: dragStart.current.ty + dy });
      }, [isDragging]);

      const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        dragStart.current = null;
      }, []);

      const handleCopy = () => {
        void navigator.clipboard.writeText(props.code).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      };

      if (error) {
        return (
          <div className={cn('rounded-lg border border-red-500/30 bg-red-500/5 p-4', props.className)}>
            <p className="text-xs text-red-500 mb-2">Failed to render Mermaid diagram</p>
            <pre className="text-xs text-[var(--muted-foreground)] whitespace-pre-wrap">{props.code}</pre>
          </div>
        );
      }

      return (
        <div className={cn('w-full rounded-lg border border-[var(--border)] overflow-hidden', props.className)}>
          <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--muted)] border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <select
                value={selectedTheme}
                onChange={(e) => setSelectedTheme(e.target.value)}
                className="text-[10px] bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)] rounded px-1.5 py-0.5 hover:text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)] cursor-pointer [&_option]:bg-[var(--muted)] [&_option]:text-[var(--foreground)]"
                title="Diagram theme"
              >
                {mermaidThemes.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
              <div className="flex items-center gap-0.5 border border-[var(--border)] rounded">
                <button
                  type="button"
                  onClick={zoomOut}
                  className="px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors rounded-l"
                  title="Zoom out"
                >
                  −
                </button>
                <span className="px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)] min-w-[3.5em] text-center select-none">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={zoomIn}
                  className="px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
                  title="Zoom in"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={resetView}
                  className="px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors rounded-r border-l border-[var(--border)]"
                  title="Reset zoom and position"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              title="Copy Mermaid code"
            >
              {copied ? (
                <>
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  Copied
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
                  Copy code
                </>
              )}
            </button>
          </div>
          <div
            className="relative overflow-hidden"
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`, transformOrigin: '0 0', transition: isDragging ? 'none' : 'transform 0.1s ease-out' }}>
              <div ref={containerRef} className="p-4" />
            </div>
          </div>
        </div>
      );
    },
  },
});
