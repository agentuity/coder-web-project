import {
  Plus,
  Sparkles,
  Plug,
  Settings,
  Star,
  RefreshCw,
  Trash2,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  LogOut,
  Moon,
  Sun,
  User,
  Keyboard,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAnalytics } from "@agentuity/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import { AgentuityLogo } from "../ui/AgentuityLogo";

interface Session {
  id: string;
  title: string | null;
  status: string;
  agent: string | null;
  createdAt: string;
  flagged: boolean | null;
}

interface SidebarProps {
  sessions: Session[];
  sessionsLoading?: boolean;
  activeSessionId?: string;
  onFlagSession?: (id: string, flagged: boolean) => void | Promise<void>;
  onRetrySession?: (id: string) => void | Promise<void>;
  onDeleteSession?: (id: string) => void | Promise<void>;
  isMobileOpen?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  userEmail?: string;
  userName?: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onShowShortcuts?: () => void;
  onSignOut: () => void | Promise<void>;
}

function getCurrentPage(pathname: string) {
  if (pathname.startsWith("/skills")) return "skills";
  if (pathname.startsWith("/sources")) return "sources";
  if (pathname.startsWith("/webhooks")) return "webhooks";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/profile")) return "profile";
  return "chat";
}

function SessionSkeleton({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <>
      {[75, 60, 85, 50, 70].map((width) => (
        <div
          key={width}
          className={cn(
            "flex items-center gap-2 rounded-md py-2 animate-pulse",
            isCollapsed ? "justify-center px-2" : "px-3",
          )}
        >
          <div className="h-2 w-2 rounded-full bg-[var(--muted)]" />
          {!isCollapsed && (
            <div className="flex-1">
              <div
                className="h-3 rounded bg-[var(--muted)]"
                style={{ width: `${width}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/** Parse a background task session title from JSON metadata to a friendly display string. */
function parseSessionTitle(title: string | null): string {
  if (!title) return "Untitled Session";
  if (!title.startsWith("{")) return title;
  try {
    const meta = JSON.parse(title) as {
      taskId?: string;
      agent?: string;
      description?: string;
    };
    if (meta.taskId && meta.taskId.startsWith("bg_")) {
      const agentName = meta.agent?.replace("Agentuity Coder ", "") ?? "Agent";
      return meta.description
        ? `🔄 ${agentName}: ${meta.description}`
        : `🔄 Background · ${agentName}`;
    }
    return title;
  } catch {
    return title;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-green-500";
    case "creating":
      return "bg-yellow-500 animate-pulse";
    case "terminated":
      return "bg-gray-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

export function Sidebar({
  sessions,
  sessionsLoading,
  activeSessionId,
  onFlagSession,
  onRetrySession,
  onDeleteSession,
  isMobileOpen,
  collapsed,
  onToggleCollapse,
  userEmail,
  userName,
  theme,
  onToggleTheme,
  onShowShortcuts,
  onSignOut,
}: SidebarProps) {
  const { track } = useAnalytics();
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location });
  const currentPage = getCurrentPage(location.pathname);
  const [showTerminated, setShowTerminated] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const isCollapsed = Boolean(collapsed) && !isMobileOpen;
  const displayName = userName || userEmail || "User";
  const showEmail = Boolean(userName && userEmail);

  const {
    activeSessions,
    terminatedFavorites,
    terminatedRecent,
    terminatedTotalCount,
  } = useMemo(() => {
    const isTerminated = (session: Session) =>
      session.status === "terminated" || session.status === "error";
    const terminated = sessions.filter(isTerminated);
    const favorites = terminated.filter((s) => s.flagged);
    const nonFavorites = terminated.filter((s) => !s.flagged);
    return {
      activeSessions: sessions.filter((session) => !isTerminated(session)),
      terminatedFavorites: favorites,
      terminatedRecent: nonFavorites.slice(0, 30),
      terminatedTotalCount: terminated.length,
    };
  }, [sessions]);

  const handleNewSession = () => {
    track("sidebar_new_session_clicked");
    navigate({ to: "/" });
  };

  const handleSessionSelect = (id: string) => {
    track("sidebar_session_selected");
    navigate({ to: "/session/$sessionId", params: { sessionId: id } });
  };

  const handleNavigate = (
    destination: "skills" | "sources" | "webhooks" | "settings" | "profile",
  ) => {
    track("sidebar_navigation", { destination });
    navigate({ to: `/${destination}` });
  };

  const handleGoHome = () => {
    navigate({ to: "/" });
  };

  const renderSessionRow = (session: Session) => (
    <div
      key={session.id}
      className={cn(
        "group w-full flex items-center gap-2 rounded-md py-2 text-sm transition-colors hover:bg-[var(--accent)]",
        isCollapsed ? "justify-center px-2" : "px-3",
        activeSessionId === session.id
          ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
          : "text-[var(--foreground)]",
      )}
    >
      <button
        type="button"
        onClick={() => handleSessionSelect(session.id)}
        className={cn(
          "flex flex-1 items-center gap-2 truncate text-left",
          isCollapsed && "justify-center",
        )}
        title={parseSessionTitle(session.title)}
      >
        <div
          className={`h-2 w-2 rounded-full ${getStatusColor(session.status)}`}
        />
        {!isCollapsed && (
          <div className="flex-1 truncate">
            {parseSessionTitle(session.title)}
          </div>
        )}
      </button>
      {!isCollapsed && (
        <div className="ml-auto flex items-center gap-1">
          {session.status === "error" && (
            <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
              Error
            </Badge>
          )}
          {session.status === "error" && onRetrySession && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onRetrySession(session.id);
              }}
              title="Retry session"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
          {onFlagSession ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFlagSession(session.id, !session.flagged);
              }}
              className="shrink-0 p-0.5 rounded hover:bg-[var(--muted)] transition-colors"
              title={session.flagged ? "Remove flag" : "Flag session"}
            >
              <Star
                className={`h-3 w-3 ${session.flagged ? "text-yellow-500 fill-yellow-500" : "text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100"}`}
              />
            </button>
          ) : (
            session.flagged && (
              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
            )
          )}
          {onDeleteSession && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const isActive = activeSessionId === session.id;
                const message = isActive
                  ? "Delete this session? You will be redirected to another session."
                  : "Delete this session?";
                if (window.confirm(message)) {
                  onDeleteSession(session.id);
                }
              }}
              className="shrink-0 rounded p-0.5 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
              title="Delete session"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r border-[var(--border)] bg-[var(--card)] transition-all duration-200",
        isCollapsed ? "w-14" : "w-64",
        isMobileOpen
          ? "absolute inset-y-0 left-0 z-50 flex md:static md:flex"
          : "hidden md:flex",
      )}
    >
      <button
        type="button"
        onClick={handleGoHome}
        className={cn(
          "flex items-center gap-2 px-4 py-3 hover:opacity-80 transition-opacity cursor-pointer",
          isCollapsed && "justify-center px-2",
        )}
        title="Go to home"
      >
        <AgentuityLogo size={20} className="text-cyan-400" />
        {!isCollapsed && (
          <span className="logo text-xl font-semibold tracking-tight">
            Coder
          </span>
        )}
      </button>
      <div className={cn("p-3", isCollapsed && "px-2")}>
        {isCollapsed ? (
          <Button
            onClick={handleNewSession}
            className="w-full"
            size="icon"
            variant="outline"
            title="New Session"
            aria-label="New Session"
          >
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleNewSession} className="w-full" size="sm" variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            New Session
          </Button>
        )}
      </div>

      <Separator />

      <ScrollArea className={cn("flex-1 p-2", isCollapsed && "px-1")}>
        <div className="space-y-3">
          {isCollapsed ? (
            <div className="space-y-1">
              {sessionsLoading ? (
                <SessionSkeleton isCollapsed={true} />
              ) : (
                activeSessions.map(renderSessionRow)
              )}
            </div>
          ) : (
            <>
              {sessionsLoading ? (
                <div>
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                    Sessions
                  </div>
                  <div className="space-y-1">
                    <SessionSkeleton isCollapsed={false} />
                  </div>
                </div>
              ) : (
                <>
                  {activeSessions.length > 0 && (
                    <div>
                      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                        Active
                      </div>
                      <div className="space-y-1">
                        {activeSessions.map(renderSessionRow)}
                      </div>
                    </div>
                  )}
                  {terminatedTotalCount > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowTerminated((prev) => !prev)}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                      >
                        {showTerminated ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        Terminated
                        <Badge
                          variant="secondary"
                          className="ml-auto text-[9px]"
                        >
                          {terminatedTotalCount}
                        </Badge>
                      </button>
                      {showTerminated && (
                        <div className="mt-1 space-y-1">
                          {terminatedFavorites.length > 0 && (
                            <>
                              {terminatedFavorites.map(renderSessionRow)}
                              {terminatedRecent.length > 0 && (
                                <div className="mx-3 border-t border-[var(--border)]" />
                              )}
                            </>
                          )}
                          {terminatedRecent.map(renderSessionRow)}
                        </div>
                      )}
                    </div>
                  )}
                  {sessions.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
                      No sessions yet. Create one to get started.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <div className={cn("p-2 space-y-1", isCollapsed && "px-1")}>
        <button
          type="button"
          onClick={() => handleNavigate("skills")}
          className={cn(
            "w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)]",
            currentPage === "skills" ? "bg-[var(--accent)]" : "",
            isCollapsed && "justify-center px-2",
          )}
          title="Skills"
          aria-label={isCollapsed ? "Skills" : undefined}
        >
          <Sparkles className="h-4 w-4" />
          {!isCollapsed && "Skills"}
        </button>
        <button
          type="button"
          onClick={() => handleNavigate("sources")}
          className={cn(
            "w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)]",
            currentPage === "sources" ? "bg-[var(--accent)]" : "",
            isCollapsed && "justify-center px-2",
          )}
          title="Sources"
          aria-label={isCollapsed ? "Sources" : undefined}
        >
          <Plug className="h-4 w-4" />
          {!isCollapsed && "Sources"}
        </button>
        <button
          type="button"
          onClick={() => handleNavigate("webhooks")}
          className={cn(
            "w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)]",
            currentPage === "webhooks" ? "bg-[var(--accent)]" : "",
            isCollapsed && "justify-center px-2",
          )}
          title="Webhooks"
          aria-label={isCollapsed ? "Webhooks" : undefined}
        >
          <Zap className="h-4 w-4" />
          {!isCollapsed && "Webhooks"}
        </button>
        <button
          type="button"
          onClick={() => handleNavigate("settings")}
          className={cn(
            "w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)]",
            currentPage === "settings" ? "bg-[var(--accent)]" : "",
            isCollapsed && "justify-center px-2",
          )}
          title="Settings"
          aria-label={isCollapsed ? "Settings" : undefined}
        >
          <Settings className="h-4 w-4" />
          {!isCollapsed && "Settings"}
        </button>
      </div>
      <div className="mt-auto border-t border-[var(--border)]">
        <div
          className={cn(
            "flex items-center gap-2 p-3",
            isCollapsed && "flex-col p-2",
          )}
        >
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{displayName}</p>
              {showEmail && (
                <p className="text-[10px] text-[var(--muted-foreground)] truncate">
                  {userEmail}
                </p>
              )}
            </div>
          )}
          <button
            onClick={() => handleNavigate("profile")}
            className={cn(
              "shrink-0 rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]",
              currentPage === "profile" && "text-[var(--foreground)]",
            )}
            title="Profile"
            aria-label="Profile"
            type="button"
          >
            <User className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onToggleTheme}
            className="shrink-0 rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]"
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            type="button"
          >
            {theme === "dark" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>
          {onShowShortcuts && (
            <button
              onClick={onShowShortcuts}
              className="shrink-0 rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]"
              title="Keyboard Shortcuts"
              type="button"
              aria-label="Keyboard Shortcuts"
            >
              <Keyboard className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setShowSignOutConfirm(true)}
            className="shrink-0 rounded p-1.5 text-[var(--muted-foreground)] hover:text-red-500 hover:bg-[var(--accent)]"
            title="Sign out"
            type="button"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onToggleCollapse}
            className="shrink-0 rounded p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]"
            type="button"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      {showSignOutConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--foreground) 50%, transparent)",
          }}
        >
          <div className="w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Sign out?
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Are you sure you want to sign out?
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSignOutConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setShowSignOutConfirm(false);
                  onSignOut();
                }}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
