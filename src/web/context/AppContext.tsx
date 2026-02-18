import { useAnalytics } from "@agentuity/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useToast } from "../components/ui/toast";
import { useAnalyticsIdentify } from "../hooks/useAnalyticsIdentify";
import { apiFetch } from "../lib/api";

export interface Session {
  id: string;
  title: string | null;
  status: string;
  archiveStatus?: string;
  agent: string | null;
  model: string | null;
  sandboxId: string | null;
  sandboxUrl: string | null;
  createdAt: string;
  flagged: boolean | null;
  metadata?: Record<string, unknown> | null;
}

export interface NewSessionPayload {
  repoUrl?: string;
  branch?: string;
  prompt?: string;
  agent?: string;
  model?: string;
  snapshotId?: string;
}

interface AppContextValue {
  userEmail?: string;
  userName?: string;
  sessions: Session[];
  sessionsLoading: boolean;
  workspaceId: string | null;
  githubAvailable: boolean;
  theme: "light" | "dark";
  activeSessionId?: string;
  currentPage: string;
  isCreating: boolean;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  shortcutsHelpOpen: boolean;
  openShortcutsHelp: () => void;
  closeShortcutsHelp: () => void;
  isSidebarOpen: boolean;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  toggleSidebarCollapse: () => void;
  toggleSidebarOpen: () => void;
  closeSidebar: () => void;
  handleNewSession: (data: NewSessionPayload) => Promise<void>;
  handleQuickSession: (
    prompt: string,
    options?: { command?: string; model?: string },
  ) => void;
  handleForkedSession: (session: Session) => void;
  handleFlagSession: (id: string, flagged: boolean) => Promise<void>;
  handleRetrySession: (id: string) => Promise<void>;
  handleDeleteSession: (id: string) => Promise<void>;
  handleWorkspaceChange: (id: string) => void;
  handleToggleTheme: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function getCurrentPage(pathname: string): string {
  if (pathname.startsWith("/session/")) return "chat";
  if (pathname.startsWith("/skills")) return "skills";
  if (pathname.startsWith("/sources")) return "sources";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/shared/")) return "shared";
  return "workspace";
}

function getActiveSessionId(pathname: string): string | undefined {
  const match = pathname.match(/^\/session\/([^/]+)/);
  return match?.[1];
}

export function AppProvider({
  children,
  userEmail,
  userName,
}: {
  children: ReactNode;
  userEmail?: string;
  userName?: string;
}) {
  const { toast } = useToast();
  const { track } = useAnalytics();
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location });

  useAnalyticsIdentify({ name: userName, email: userEmail });

  const [isCreating, setIsCreating] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isCreatingRef = useRef(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [githubAvailable, setGithubAvailable] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("agentuity-theme");
      if (stored === "dark" || stored === "light") return stored;
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light";
  });

  const currentPage = useMemo(
    () => getCurrentPage(location.pathname),
    [location.pathname],
  );
  const activeSessionId = useMemo(
    () => getActiveSessionId(location.pathname),
    [location.pathname],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("agentuity-theme", theme);
  }, [theme]);

  useEffect(() => {
    track("page_viewed", { page: currentPage });
  }, [currentPage, track]);

  const fetchGithubStatus = useCallback(
    (signal?: AbortSignal) => {
      if (!userName && !userEmail) return;
      apiFetch("/api/user/github", { signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { configured?: boolean } | null) =>
          setGithubAvailable(data?.configured ?? false),
        )
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setGithubAvailable(false);
        });
    },
    [userName, userEmail],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchGithubStatus(controller.signal);
    return () => controller.abort();
  }, [fetchGithubStatus]);

  useEffect(() => {
    const handler = () => fetchGithubStatus();
    window.addEventListener("github-status-changed", handler);
    return () => window.removeEventListener("github-status-changed", handler);
  }, [fetchGithubStatus]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => {
      const newTheme = prev === "dark" ? "light" : "dark";
      track("theme_toggled", { theme: newTheme });
      return newTheme;
    });
  }, [track]);

  useEffect(() => {
    if (!userName && !userEmail) return;
    const controller = new AbortController();
    let aborted = false;

    (async () => {
      try {
        const res = await apiFetch("/api/workspaces", {
          signal: controller.signal,
        });
        const workspaceList = await res.json();
        if (aborted) return;

        if (workspaceList.length > 0) {
          const savedId = localStorage.getItem("selectedWorkspaceId");
          const selected =
            workspaceList.find((w: any) => w.id === savedId)?.id ??
            workspaceList[0].id;
          setWorkspaceId(selected);
          localStorage.setItem("selectedWorkspaceId", selected);
        } else {
          const createRes = await apiFetch("/api/workspaces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Default Workspace" }),
            signal: controller.signal,
          });
          const w = await createRes.json();
          if (!aborted) {
            setWorkspaceId(w.id);
            localStorage.setItem("selectedWorkspaceId", w.id);
          }
        }
      } catch (err) {
        if (
          !aborted &&
          !(err instanceof DOMException && err.name === "AbortError")
        ) {
          console.error("Workspace setup failed:", err);
        }
      }
    })();

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [userEmail, userName]);

  useEffect(() => {
    if (!workspaceId) return;
    setSessionsLoading(true);
    const controller = new AbortController();
    let aborted = false;
    let inFlight = false;

    const fetchSessions = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const res = await apiFetch(`/api/workspaces/${workspaceId}/sessions`, {
          signal: controller.signal,
        });
        const s = await res.json();
        if (!aborted) {
          startTransition(() => {
            setSessions(s);
          });
          setSessionsLoading(false);
        }
      } catch (err) {
        if (
          !aborted &&
          !(err instanceof DOMException && err.name === "AbortError")
        ) {
          console.error("Failed to fetch sessions:", err);
        }
        if (!aborted) setSessionsLoading(false);
      } finally {
        inFlight = false;
      }
    };

    void fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => {
      aborted = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [workspaceId]);

  const handleNewSession = useCallback(
    async (data: NewSessionPayload) => {
      if (!workspaceId) return;
      if (isCreatingRef.current) return;
      isCreatingRef.current = true;
      setIsCreating(true);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          throw new Error("Failed to create session");
        }
        const session = await res.json();
        setSessions((prev) =>
          prev.some((s) => s.id === session.id) ? prev : [session, ...prev],
        );
        navigate({
          to: "/session/$sessionId",
          params: { sessionId: session.id },
        });
        track("session_created", {
          hasRepo: !!data.repoUrl,
          hasBranch: !!data.branch,
          hasPrompt: !!data.prompt,
        });
      } catch (error) {
        console.error("Failed to create session:", error);
        toast({ type: "error", message: "Failed to create session" });
      } finally {
        isCreatingRef.current = false;
        setIsCreating(false);
      }
    },
    [navigate, toast, track, workspaceId],
  );

  const handleFlagSession = useCallback(
    async (id: string, flagged: boolean) => {
      try {
        await fetch(`/api/sessions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flagged }),
        });
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, flagged } : s)),
        );
        track("session_flagged", { flagged });
      } catch (err) {
        console.error("Failed to flag session:", err);
      }
    },
    [track],
  );

  const handleRetrySession = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/sessions/${id}/retry`, {
          method: "POST",
        });
        if (!res.ok) {
          throw new Error("Failed to retry session");
        }
        const session = await res.json();
        setSessions((prev) => prev.map((s) => (s.id === id ? session : s)));
        track("session_retried");
      } catch (error) {
        console.error("Failed to retry session:", error);
        toast({ type: "error", message: "Failed to retry session" });
      }
    },
    [toast, track],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
        if (!res.ok) {
          throw new Error("Failed to delete session");
        }
        setSessions((prev) => {
          const updated = prev.filter((session) => session.id !== id);
          if (activeSessionId === id) {
            const nextSession = updated[0];
            if (nextSession) {
              navigate({
                to: "/session/$sessionId",
                params: { sessionId: nextSession.id },
              });
            } else {
              navigate({ to: "/" });
            }
          }
          return updated;
        });
        track("session_deleted");
      } catch (error) {
        console.error("Failed to delete session:", error);
        toast({ type: "error", message: "Failed to delete session" });
      }
    },
    [activeSessionId, navigate, toast, track],
  );

  const handleWorkspaceChange = useCallback(
    (id: string) => {
      setWorkspaceId(id);
      localStorage.setItem("selectedWorkspaceId", id);
      track("workspace_switched", { workspaceId: id });
    },
    [track],
  );

  const handleQuickSession = useCallback(
    (prompt: string, options?: { command?: string; model?: string }) => {
      void handleNewSession({
        prompt,
        model: options?.model,
        agent: options?.command || undefined,
      });
    },
    [handleNewSession],
  );

  const handleForkedSession = useCallback(
    (session: Session) => {
      setSessions((prev) => [session, ...prev]);
      navigate({
        to: "/session/$sessionId",
        params: { sessionId: session.id },
      });
    },
    [navigate],
  );

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const closeCommandPalette = useCallback(
    () => setCommandPaletteOpen(false),
    [],
  );
  const toggleCommandPalette = useCallback(
    () => setCommandPaletteOpen((prev) => !prev),
    [],
  );
  const openShortcutsHelp = useCallback(() => setShortcutsHelpOpen(true), []);
  const closeShortcutsHelp = useCallback(() => setShortcutsHelpOpen(false), []);
  const toggleSidebarCollapse = useCallback(
    () => setSidebarCollapsed((prev) => !prev),
    [],
  );
  const toggleSidebarOpen = useCallback(
    () => setIsSidebarOpen((prev) => !prev),
    [],
  );
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsSidebarOpen((prev) => !prev);
      return;
    }
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      userEmail,
      userName,
      sessions,
      sessionsLoading,
      workspaceId,
      githubAvailable,
      theme,
      activeSessionId,
      currentPage,
      isCreating,
      commandPaletteOpen,
      setCommandPaletteOpen,
      openCommandPalette,
      closeCommandPalette,
      toggleCommandPalette,
      shortcutsHelpOpen,
      openShortcutsHelp,
      closeShortcutsHelp,
      isSidebarOpen,
      sidebarCollapsed,
      toggleSidebar,
      toggleSidebarCollapse,
      toggleSidebarOpen,
      closeSidebar,
      handleNewSession,
      handleQuickSession,
      handleForkedSession,
      handleFlagSession,
      handleRetrySession,
      handleDeleteSession,
      handleWorkspaceChange,
      handleToggleTheme,
    }),
    [
      userEmail,
      userName,
      sessions,
      sessionsLoading,
      workspaceId,
      githubAvailable,
      theme,
      activeSessionId,
      currentPage,
      isCreating,
      commandPaletteOpen,
      openCommandPalette,
      closeCommandPalette,
      toggleCommandPalette,
      shortcutsHelpOpen,
      openShortcutsHelp,
      closeShortcutsHelp,
      isSidebarOpen,
      sidebarCollapsed,
      toggleSidebar,
      toggleSidebarCollapse,
      toggleSidebarOpen,
      closeSidebar,
      handleNewSession,
      handleQuickSession,
      handleForkedSession,
      handleFlagSession,
      handleRetrySession,
      handleDeleteSession,
      handleWorkspaceChange,
      handleToggleTheme,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
}
