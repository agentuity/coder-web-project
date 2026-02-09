import { useId, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Loader2, X } from 'lucide-react';

interface NewSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { repoUrl?: string; branch?: string; prompt?: string }) => Promise<void>;
  isCreating: boolean;
}

export function NewSessionDialog({ isOpen, onClose, onCreate, isCreating }: NewSessionDialogProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [prompt, setPrompt] = useState('');
  const repoId = useId();
  const branchId = useId();
  const promptId = useId();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreate({
      repoUrl: repoUrl || undefined,
      branch: branch || undefined,
      prompt: prompt || undefined,
    });
    setRepoUrl('');
    setBranch('');
    setPrompt('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">New Session</h2>
          <button type="button" onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={repoId} className="text-sm font-medium text-[var(--foreground)]">Repository URL (optional)</label>
            <Input
              id={repoId}
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Clone a GitHub repo into the sandbox. Leave empty for a blank workspace.
            </p>
          </div>

          <div>
            <label htmlFor={branchId} className="text-sm font-medium text-[var(--foreground)]">Branch (optional)</label>
            <Input
              id={branchId}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Checkout a specific branch after cloning.
            </p>
          </div>

          <div>
            <label htmlFor={promptId} className="text-sm font-medium text-[var(--foreground)]">Initial Prompt (optional)</label>
            <Textarea
              id={promptId}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What would you like to work on?"
              className="mt-1"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Session'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
