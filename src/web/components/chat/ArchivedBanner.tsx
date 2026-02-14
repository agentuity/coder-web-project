import { Archive, GitFork, Loader2 } from "lucide-react";
import { Button } from "../ui/button";

interface ArchivedBannerProps {
  stats?: {
    totalCost?: number;
    totalMessages?: number;
    totalTokens?: number;
    sessionCount?: number;
  };
  onFork?: () => void;
  isForking?: boolean;
}

export function ArchivedBanner({
  stats,
  onFork,
  isForking,
}: ArchivedBannerProps) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-400">
              This session is archived
            </p>
            <p className="text-xs text-amber-400/70">
              Read-only — the sandbox was terminated
            </p>
          </div>
        </div>
        {onFork && (
          <Button
            variant="outline"
            size="sm"
            onClick={onFork}
            disabled={isForking}
            className="text-xs shrink-0"
          >
            {isForking ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <GitFork className="h-3 w-3 mr-1" />
            )}
            Fork Session
          </Button>
        )}
      </div>
      {stats && (stats.totalCost != null || stats.totalMessages != null) && (
        <div className="flex gap-4 mt-2 text-[10px] text-amber-400/60">
          {stats.totalMessages != null && stats.totalMessages > 0 && (
            <span>{stats.totalMessages} messages</span>
          )}
          {stats.totalCost != null && stats.totalCost > 0 && (
            <span>${stats.totalCost.toFixed(4)}</span>
          )}
          {stats.sessionCount != null && stats.sessionCount > 1 && (
            <span>{stats.sessionCount} sub-sessions</span>
          )}
        </div>
      )}
    </div>
  );
}
