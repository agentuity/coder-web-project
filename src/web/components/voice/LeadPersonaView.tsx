import { memo } from 'react';
import { Mic, MicOff, Loader2, MessageSquare } from 'lucide-react';
import { Persona } from '../ai-elements/persona';
import type { PersonaState } from '../ai-elements/persona';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface LeadPersonaViewProps {
  personaState: PersonaState;
  isListening: boolean;
  isProcessing: boolean;
  isSupported: boolean;
  lastSpokenText: string | null;
  transcript: string[];
  onToggleListening: () => void;
  onSwitchToChat: () => void;
  sessionActive: boolean;
}

export const LeadPersonaView = memo(function LeadPersonaView({
  personaState,
  isListening,
  isProcessing,
  isSupported,
  lastSpokenText,
  transcript,
  onToggleListening,
  onSwitchToChat,
  sessionActive,
}: LeadPersonaViewProps) {
  const stateLabel = (() => {
    switch (personaState) {
      case 'listening': return 'Listening...';
      case 'thinking': return 'Thinking...';
      case 'speaking': return 'Speaking...';
      case 'asleep': return 'Asleep';
      default: return 'Ready';
    }
  })();

  return (
    <div className="flex flex-1 flex-col items-center min-h-0 overflow-hidden bg-[var(--background)]">
      {/* Persona area -- centered, takes most space */}
      <section className="flex flex-1 flex-col items-center justify-center gap-4 p-6 min-h-0" aria-label="Lead AI persona">
        <Persona
          state={personaState}
          variant="command"
          className="size-40 md:size-52"
        />
        <output 
          className="text-xs text-[var(--muted-foreground)] tracking-wide uppercase"
          aria-live="polite"
        >
          {stateLabel}
        </output>
        {lastSpokenText && (
          <p className="max-w-sm text-center text-sm text-[var(--foreground)] leading-relaxed">
            "{lastSpokenText}"
          </p>
        )}
      </section>

      {/* Transcript -- scrollable, compact */}
      {transcript.length > 0 && (
        <div className="w-full max-w-md px-4 pb-2 max-h-32 overflow-y-auto" role="log" aria-label="Voice conversation transcript">
          <div className="space-y-1">
            {transcript.map((line, i) => (
              <p
                key={`${line.slice(0, 20)}-${i}`}
                className={cn(
                  'text-xs leading-relaxed',
                  line.startsWith('You:')
                    ? 'text-[var(--muted-foreground)]'
                    : 'text-[var(--foreground)]'
                )}
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="shrink-0 flex flex-col items-center gap-3 pb-6 pt-4 border-t border-[var(--border)] w-full">
        {/* Large mic button */}
        {isSupported && sessionActive && (
          <div className="relative">
            {isListening && (
              <div className="absolute inset-0 rounded-full animate-ping bg-red-500/20" />
            )}
            <Button
              variant={isListening ? 'destructive' : 'default'}
              size="icon"
              className="h-16 w-16 rounded-full"
              onClick={onToggleListening}
              disabled={isProcessing}
              aria-label={isListening ? 'Stop listening' : 'Start listening'}
            >
              {isProcessing ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : isListening ? (
                <MicOff className="h-6 w-6" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </Button>
          </div>
        )}

        {/* Back to chat link */}
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          onClick={onSwitchToChat}
        >
          <MessageSquare className="h-3 w-3" />
          Back to Chat
        </button>
      </div>
    </div>
  );
});
