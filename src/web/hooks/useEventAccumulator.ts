import { useCallback, useEffect, useRef } from 'react';
import type { Part, ToolPart } from '../types/opencode';

export interface AccumulatedEvent {
  type: 'file_write' | 'file_read' | 'build' | 'test' | 'error' | 'command' | 'tool' | 'text' | 'complete';
  summary: string;
  timestamp: number;
}

interface UseEventAccumulatorOptions {
  enabled: boolean;  // Only accumulate in Lead mode
  parts: Part[];     // All parts from current assistant message
  isBusy: boolean;   // Whether session is busy
  onBatch: (events: AccumulatedEvent[]) => void; // Called when a batch is ready
}

// Classify a tool part into a meaningful event
function classifyToolPart(part: ToolPart): AccumulatedEvent | null {
  const tool = part.tool;
  const state = part.state;
  const input = state.input ?? {};

  // Skip pending/running tools -- only narrate completed/errored
  if (state.status === 'pending' || state.status === 'running') return null;

  const filePath = (input as { filePath?: string }).filePath;
  const command = (input as { command?: string }).command;
  let timestamp = Date.now();
  if ('time' in state && state.time) {
    const t = state.time as { start: number; end?: number };
    timestamp = t.end ?? t.start;
  }

  if (state.status === 'error') {
    return {
      type: 'error',
      summary: `Error in ${tool}: ${('error' in state ? state.error : 'unknown').slice(0, 100)}`,
      timestamp,
    };
  }

  // File operations
  if (tool === 'write' || tool === 'edit') {
    return { type: 'file_write', summary: `Modified ${filePath || 'a file'}`, timestamp };
  }
  if (tool === 'read') {
    return { type: 'file_read', summary: `Read ${filePath || 'a file'}`, timestamp };
  }

  // Bash commands
  if (tool === 'bash' && command) {
    const cmd = command.trim();
    if (cmd.includes('build') || cmd.includes('tsc')) {
      const output = 'output' in state ? state.output : '';
      const passed = !output.includes('error') && !output.includes('Error');
      return { type: 'build', summary: passed ? 'Build completed' : 'Build had issues', timestamp };
    }
    if (cmd.includes('test')) {
      const output = 'output' in state ? state.output : '';
      const passed = !output.includes('FAIL');
      return { type: 'test', summary: passed ? 'Tests passed' : 'Some tests failed', timestamp };
    }
    return { type: 'command', summary: `Ran: ${cmd.slice(0, 80)}`, timestamp };
  }

  // Other tools
  return { type: 'tool', summary: `Used ${tool}`, timestamp };
}

export function useEventAccumulator(options: UseEventAccumulatorOptions) {
  const { enabled, parts, isBusy, onBatch } = options;
  const accumulatorRef = useRef<AccumulatedEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedPartsRef = useRef<Set<string>>(new Set());
  const onBatchRef = useRef(onBatch);
  const wasBusyRef = useRef(false);

  useEffect(() => {
    onBatchRef.current = onBatch;
  }, [onBatch]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const batch = accumulatorRef.current;
    if (batch.length === 0) return;
    accumulatorRef.current = [];

    // Deduplicate: aggregate file_reads as "Read N files", multiple file_writes as "Modified N files"
    const fileWrites = batch.filter(e => e.type === 'file_write');
    const others = batch.filter(e => e.type !== 'file_read' && e.type !== 'file_write');

    const deduped: AccumulatedEvent[] = [...others];
    if (fileWrites.length > 2) {
      deduped.push({ type: 'file_write', summary: `Modified ${fileWrites.length} files`, timestamp: Date.now() });
    } else {
      deduped.push(...fileWrites);
    }
    // Skip file_reads entirely -- too noisy for narration

    if (deduped.length > 0) {
      onBatchRef.current(deduped);
    }
  }, []);

  // Watch parts for new tool completions
  useEffect(() => {
    if (!enabled) return;

    for (const part of parts) {
      if (processedPartsRef.current.has(part.id)) continue;

      if (part.type === 'tool') {
        const event = classifyToolPart(part);
        if (event) {
          processedPartsRef.current.add(part.id);
          accumulatorRef.current.push(event);

          // Immediate triggers: errors, build results, test results
          if (event.type === 'error' || event.type === 'build' || event.type === 'test') {
            flush();
          } else {
            // Start/reset 3-second batch timer
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(flush, 3000);
          }
        }
      } else if (part.type === 'text') {
        // Extract text content for narrator context
        if (!processedPartsRef.current.has(part.id) && (part as { text?: string }).text) {
          processedPartsRef.current.add(part.id);
          const textContent = ((part as { text?: string }).text || '').slice(0, 300);
          if (textContent.length > 0) {
            accumulatorRef.current.push({
              type: 'text',
              summary: textContent,
              timestamp: Date.now(),
            });
          }
        }
      }
    }
  }, [enabled, parts, flush]);

  // When session transitions from busy to idle, flush remaining mid-task events
  useEffect(() => {
    if (!enabled) return;
    if (wasBusyRef.current && !isBusy) {
      flush();
    }
    wasBusyRef.current = isBusy;
  }, [enabled, isBusy, flush]);

  // Clear on disable or unmount
  useEffect(() => {
    if (!enabled) {
      accumulatorRef.current = [];
      processedPartsRef.current.clear();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled]);
}
