import { lazy, memo, Suspense } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import type { PersonaState } from '../ai-elements/persona';
import { Button } from '../ui/button';

const Persona = lazy(() =>
  import('../ai-elements/persona').then((m) => ({ default: m.Persona }))
);

interface LeadPersonaViewProps {
  personaState: PersonaState;
  isListening: boolean;
  isProcessing: boolean;
  isSupported: boolean;
  onToggleListening: () => void;
  sessionActive: boolean;
}

export const LeadPersonaView = memo(function LeadPersonaView({
  personaState,
  isListening,
  isProcessing,
  isSupported,
  onToggleListening,
  sessionActive,
}: LeadPersonaViewProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-0 overflow-hidden bg-[var(--background)]">
      {/* Persona -- centered, fills the space */}
      <section className="flex flex-col items-center justify-center gap-6" aria-label="Lead AI persona">
        <Suspense fallback={<div className="size-48 md:size-64" />}>
          <Persona
            state={personaState}
            variant="command"
            className="size-48 md:size-64"
          />
        </Suspense>

        {/* Mic button -- directly below persona */}
        {isSupported && sessionActive && (
          <div className="relative">
            {isListening && (
              <div className="absolute inset-0 rounded-full animate-ping bg-red-500/20 pointer-events-none" />
            )}
            <Button
              variant={isListening ? 'destructive' : 'default'}
              size="icon"
              className="h-14 w-14 rounded-full"
              onClick={onToggleListening}
              disabled={isProcessing}
              aria-label={isListening ? 'Stop listening' : 'Start listening'}
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isListening ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
});
