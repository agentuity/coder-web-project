import { useCallback, useEffect, useId, useState } from 'react';
import { useAnalytics } from '@agentuity/react';
import { Volume2 } from 'lucide-react';
import { Button } from '../ui/button';

interface VoicePreferences {
  voiceEnabled: boolean;
  voiceName: string;
  voiceAutoSpeak: boolean;
  voiceSpeed: number;
}

const VOICE_OPTIONS = [
  { value: 'alloy', label: 'Alloy' },
  { value: 'ash', label: 'Ash' },
  { value: 'ballad', label: 'Ballad' },
  { value: 'coral', label: 'Coral' },
  { value: 'echo', label: 'Echo' },
  { value: 'fable', label: 'Fable' },
  { value: 'nova', label: 'Nova' },
  { value: 'onyx', label: 'Onyx' },
  { value: 'sage', label: 'Sage' },
  { value: 'shimmer', label: 'Shimmer' },
  { value: 'verse', label: 'Verse' },
  { value: 'marin', label: 'Marin' },
  { value: 'cedar', label: 'Cedar' },
];

export function VoiceSettings() {
  const { track } = useAnalytics();
  const [prefs, setPrefs] = useState<VoicePreferences>({
    voiceEnabled: true,
    voiceName: 'coral',
    voiceAutoSpeak: true,
    voiceSpeed: 1.0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const voiceSelectId = useId();
  const speedInputId = useId();

  useEffect(() => {
    fetch('/api/user/voice')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then((data: Partial<VoicePreferences>) => {
        const coerced = { ...data };
        if (coerced.voiceSpeed !== undefined) {
          coerced.voiceSpeed = Number(coerced.voiceSpeed) || 1.0;
        }
        setPrefs(prev => ({ ...prev, ...coerced }));
      })
      .catch(() => {
        // Use defaults - voice settings may not exist yet
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/user/voice', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error('Failed to save');
      track('voice_settings_updated');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Failed to save voice settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestVoice = useCallback(async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/voice/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello! This is your Lead voice.',
          voice: prefs.voiceName,
        }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const data = await res.json() as { audio?: { base64: string; mimeType: string } };
      if (data.audio) {
        const byteChars = atob(data.audio.base64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArray[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: data.audio.mimeType });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
      }
    } catch {
      setError('Voice test failed. The AI Gateway may not be available.');
    } finally {
      setTesting(false);
    }
  }, [prefs.voiceName]);

  if (loading) {
    return <p className="text-xs text-[var(--muted-foreground)]">Loading voice settings...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Voice enabled toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={prefs.voiceEnabled}
          onChange={e => setPrefs(p => ({ ...p, voiceEnabled: e.target.checked }))}
          className="rounded border-[var(--border)]"
        />
        <span className="text-sm text-[var(--foreground)]">Enable voice features</span>
      </label>

      {/* Auto-speak toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={prefs.voiceAutoSpeak}
          onChange={e => setPrefs(p => ({ ...p, voiceAutoSpeak: e.target.checked }))}
          className="rounded border-[var(--border)]"
        />
        <span className="text-sm text-[var(--foreground)]">Auto-speak in narrator mode</span>
      </label>

      {/* Voice selection */}
      <div>
        <label htmlFor={voiceSelectId} className="text-xs text-[var(--muted-foreground)] mb-1 block">
          Voice
        </label>
        <div className="flex items-center gap-2">
          <select
            id={voiceSelectId}
            value={prefs.voiceName}
            onChange={e => setPrefs(p => ({ ...p, voiceName: e.target.value }))}
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]"
          >
            {VOICE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTestVoice}
            disabled={testing}
            className="h-8 gap-1"
          >
            <Volume2 className="h-3.5 w-3.5" />
            {testing ? 'Playing...' : 'Test'}
          </Button>
        </div>
      </div>

      {/* Speed */}
      <div>
        <label htmlFor={speedInputId} className="text-xs text-[var(--muted-foreground)] mb-1 block">
          Speech speed: {prefs.voiceSpeed.toFixed(1)}x
        </label>
        <input
          id={speedInputId}
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={prefs.voiceSpeed}
          onChange={e => setPrefs(p => ({ ...p, voiceSpeed: parseFloat(e.target.value) }))}
          className="w-full"
        />
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Voice Settings'}
        </Button>
        {saved && <span className="text-xs text-green-500">Saved</span>}
      </div>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
