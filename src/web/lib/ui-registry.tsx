import type { ChangeEvent, FormEvent } from 'react';
import { defineRegistry, useStateStore } from '@json-render/react';
import { catalog } from './ui-catalog';
import { cn } from './utils';

type ChartDatum = number | Record<string, unknown>;

const spacingMap: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
};

const paddingMap: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

const alignMap: Record<'start' | 'center' | 'end' | 'stretch', string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

const badgeVariants: Record<'default' | 'success' | 'warning' | 'error' | 'info', string> = {
  default: 'bg-[var(--muted)] text-[var(--foreground)] border-[var(--border)]',
  success: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  error: 'bg-red-500/10 text-red-600 border-red-500/30',
  info: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
};

const alertVariants: Record<'info' | 'success' | 'warning' | 'error', string> = {
  info: 'border-blue-500/40 bg-blue-500/5 text-blue-700',
  success: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700',
  warning: 'border-amber-500/40 bg-amber-500/5 text-amber-700',
  error: 'border-red-500/40 bg-red-500/5 text-red-700',
};

const buttonVariants: Record<'primary' | 'secondary' | 'outline' | 'ghost', string> = {
  primary: 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90',
  secondary: 'bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:opacity-80',
  outline: 'border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
  ghost: 'hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]',
};

const textVariants: Record<'heading' | 'subheading' | 'body' | 'caption', string> = {
  heading: 'text-lg font-semibold text-[var(--foreground)]',
  subheading: 'text-base font-medium text-[var(--foreground)]',
  body: 'text-sm text-[var(--foreground)]',
  caption: 'text-xs text-[var(--muted-foreground)]',
};

const chartPalette = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#14b8a6', '#facc15'];

function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

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

export const { registry } = defineRegistry(catalog, {
  components: {
    Card: ({ props, children }) => {
      const paddingClass = props.padding ? paddingMap[props.padding] : paddingMap.md;
      return (
        <div className={cn('rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-sm', paddingClass)}>
          <div className="space-y-1">
            <div className="text-base font-semibold">{props.title}</div>
            {props.description && (
              <div className="text-sm text-[var(--muted-foreground)]">{props.description}</div>
            )}
          </div>
          {children && <div className="mt-4">{children}</div>}
        </div>
      );
    },
    Text: ({ props }) => (
      <p className={cn(textVariants[props.variant ?? 'body'])}>{props.content}</p>
    ),
    Button: ({ props, emit }) => (
      <button
        type={props.action === 'submit' ? 'submit' : 'button'}
        className={cn(
          'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
          buttonVariants[props.variant ?? 'primary']
        )}
        onClick={() => emit?.('press')}
        data-action={props.action}
      >
        {props.label}
      </button>
    ),
    Table: ({ props }) => (
      <div className="w-full overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-[var(--foreground)]">
            <tr>
              {props.columns.map((column) => (
                <th key={column.key} className="px-3 py-2 text-left font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {props.rows.map((row) => {
              const rowId = row.id ?? row.key ?? row._id;
              const rowKey = (typeof rowId === 'string' || typeof rowId === 'number')
                ? String(rowId)
                : props.columns.map((column) => String(row[column.key] ?? '')).join('|') || JSON.stringify(row);
              return (
                <tr key={rowKey} className="odd:bg-[var(--background)] even:bg-[var(--muted)]/30">
                {props.columns.map((column) => (
                  <td key={column.key} className="px-3 py-2 text-[var(--foreground)]">
                    {String(row[column.key] ?? '')}
                  </td>
                ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ),
    Metric: ({ props }) => (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3">
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
      </div>
    ),
    Chart: ({ props }) => {
      const points = normalizeChartData(props.data, props.xKey, props.yKey);
      if (points.length === 0) {
        return (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 text-center text-xs text-[var(--muted-foreground)]">
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
          <div className="flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
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
        <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
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
    Form: ({ props, children, emit }) => {
      const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        emit?.('submit');
      };

      return (
        <form
          className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4"
          onSubmit={handleSubmit}
        >
          {props.title && <div className="text-sm font-semibold text-[var(--foreground)]">{props.title}</div>}
          <div className="space-y-3">{children}</div>
        </form>
      );
    },
    Input: ({ props }) => {
      const { get, set } = useStateStore();
      const fieldName = slugify(props.label);
      const value = get(`/form/${fieldName}`) ?? '';
      const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const rawValue = event.target.value;
        if (props.type === 'number') {
          const parsed = rawValue === '' ? '' : Number(rawValue);
          set(`/form/${fieldName}`, Number.isNaN(parsed) ? rawValue : parsed);
        } else {
          set(`/form/${fieldName}`, rawValue);
        }
      };

      return (
        <label className="flex flex-col gap-1 text-sm text-[var(--foreground)]">
          <span className="text-xs text-[var(--muted-foreground)]">{props.label}</span>
          <input
            name={fieldName}
            type={props.type ?? 'text'}
            value={String(value)}
            onChange={handleChange}
            placeholder={props.placeholder}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
          />
        </label>
      );
    },
    Select: ({ props }) => {
      const { get, set } = useStateStore();
      const fieldName = slugify(props.label);
      const value = get(`/form/${fieldName}`) ?? '';
      return (
        <label className="flex flex-col gap-1 text-sm text-[var(--foreground)]">
          <span className="text-xs text-[var(--muted-foreground)]">{props.label}</span>
          <select
            name={fieldName}
            value={String(value)}
            onChange={(event) => set(`/form/${fieldName}`, event.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
          >
            <option value="" disabled>Choose an option</option>
            {props.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      );
    },
    Image: ({ props }) => (
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)]">
        <img
          src={props.src}
          alt={props.alt ?? 'Image'}
          width={props.width}
          height={props.height}
          className="h-auto w-full object-cover"
        />
      </div>
    ),
    Badge: ({ props }) => (
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
          badgeVariants[props.variant ?? 'default']
        )}
      >
        {props.text}
      </span>
    ),
    Alert: ({ props }) => (
      <div className={cn('rounded-lg border px-3 py-2 text-sm', alertVariants[props.variant ?? 'info'])}>
        {props.title && <div className="text-xs font-semibold uppercase tracking-wide">{props.title}</div>}
        <div className="mt-1 text-sm">{props.message}</div>
      </div>
    ),
    Row: ({ props, children }) => (
      <div className={cn('flex flex-row', spacingMap[props.gap ?? 'md'], alignMap[props.align ?? 'start'])}>
        {children}
      </div>
    ),
    Column: ({ props, children }) => (
      <div className={cn('flex flex-col', spacingMap[props.gap ?? 'md'], alignMap[props.align ?? 'start'])}>
        {children}
      </div>
    ),
    Stack: ({ props, children }) => (
      <div className={cn('flex', props.direction === 'horizontal' ? 'flex-row' : 'flex-col', spacingMap[props.gap ?? 'md'])}>
        {children}
      </div>
    ),
    Divider: () => (
      <div className="h-px w-full bg-[var(--border)]" />
    ),
    Link: ({ props, emit }) => (
      <a
        href={props.href}
        target={props.external ? '_blank' : undefined}
        rel={props.external ? 'noopener noreferrer' : undefined}
        onClick={() => emit?.('press')}
        className="text-sm font-medium text-[var(--primary)] underline underline-offset-2 hover:opacity-80"
      >
        {props.label}
      </a>
    ),
    Code: ({ props }) => (
      <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs text-[var(--foreground)]">
        <code data-language={props.language}>{props.content}</code>
      </pre>
    ),
  },
});
