import { Info, Layers } from 'lucide-react';
import { Badge } from '../ui/badge';

type TokenUsage = {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
};

interface ContextIndicatorProps {
  tokens?: TokenUsage;
  cost?: number;
  modelID?: string | null;
  providerID?: string | null;
  label?: string;
  compact?: boolean;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatCost(cost: number) {
  if (!Number.isFinite(cost)) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function ContextIndicator({
  tokens,
  cost = 0,
  modelID,
  providerID,
  label = 'Context',
  compact = false,
}: ContextIndicatorProps) {
  if (!tokens) return null;

  const totalTokens = tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;

  return (
    <div className="relative group">
      <Badge variant="secondary" className="gap-1 text-[10px]">
        <Layers className="h-3 w-3" />
        {label}
        <span className="ml-1">{formatNumber(totalTokens)} tokens</span>
        {cost ? <span>· {formatCost(cost)}</span> : null}
        {!compact && <Info className="ml-1 h-3 w-3" />}
      </Badge>
      {!compact && (
        <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-64 rounded-md border border-[var(--border)] bg-[var(--popover)] p-3 text-[10px] text-[var(--foreground)] shadow-lg group-hover:block">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Usage</div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span>Input</span>
              <span>{formatNumber(tokens.input)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Output</span>
              <span>{formatNumber(tokens.output)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Reasoning</span>
              <span>{formatNumber(tokens.reasoning)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Cache read</span>
              <span>{formatNumber(tokens.cache.read)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Cache write</span>
              <span>{formatNumber(tokens.cache.write)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between font-medium">
              <span>Total</span>
              <span>{formatNumber(totalTokens)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Cost</span>
              <span>{formatCost(cost)}</span>
            </div>
          </div>
          {(modelID || providerID) && (
            <div className="mt-2 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--muted-foreground)]">
              {providerID ? <div>Provider: {providerID}</div> : null}
              {modelID ? <div>Model: {modelID}</div> : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
