import { zodValidator } from '@tanstack/zod-adapter';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useParams,
  useRouterState,
} from '@tanstack/react-router';
import { z } from 'zod';
import { AppLayout } from './App';
import { ProfilePage, ProfilePageFromParam } from './components/auth/ProfilePage';
import { SignIn } from './components/auth/SignIn';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ChatPage } from './components/pages/ChatPage';
import { SettingsPage } from './components/pages/SettingsPage';
import { SharedSessionPage } from './components/pages/SharedSessionPage';
import { SkillsPage } from './components/pages/SkillsPage';
import { SourcesPage } from './components/pages/SourcesPage';
import { WorkspacePage } from './components/pages/WorkspacePage';
import { ToastProvider } from './components/ui/toast';
import { AppProvider, useAppContext } from './context/AppContext';
import { authClient } from './lib/auth-client';

export const sessionSearchSchema = z.object({
  v: z.enum(['chat', 'ide']).default('chat'),
  tab: z.enum(['files', 'git', 'env']).default('files'),
});

const profileSearchSchema = z.object({
  av: z.string().optional(),
});

function RootLayout() {
  const { data: authSession, isPending: authLoading } = authClient.useSession();
  const location = useRouterState({ select: (state) => state.location });
  const isShared = location.pathname.startsWith('/shared/');
  const user = authSession?.user;
  const userName = user?.name ? String(user.name) : undefined;
  const userEmail = user?.email ? String(user.email) : undefined;
  const hasUser = Boolean(userName || userEmail);

  return (
    <ToastProvider>
      {isShared ? (
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      ) : authLoading ? (
        <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
          <div className="text-[var(--muted-foreground)]">Loading...</div>
        </div>
      ) : !hasUser ? (
        <SignIn />
      ) : (
        <AppProvider userName={userName} userEmail={userEmail}>
          <AppLayout />
        </AppProvider>
      )}
    </ToastProvider>
  );
}

function ChatRoute() {
  const { sessionId } = useParams({ from: '/session/$sessionId' });
  const { sessions, sessionsLoading, githubAvailable, handleForkedSession } = useAppContext();
  const session = sessions.find((item) => item.id === sessionId);

  if (!session) {
    return (
      <div className="p-6">
        <div className="text-sm text-[var(--muted-foreground)]">
          {sessionsLoading ? 'Loading session...' : 'Session not found.'}
        </div>
      </div>
    );
  }

  return (
    <ChatPage
      sessionId={session.id}
      session={session}
      onForkedSession={handleForkedSession}
      githubAvailable={githubAvailable}
    />
  );
}

function SkillsRoute() {
  const { workspaceId } = useAppContext();
  if (!workspaceId) {
    return (
      <div className="p-6">
        <div className="text-sm text-[var(--muted-foreground)]">Loading workspace...</div>
      </div>
    );
  }
  return <SkillsPage workspaceId={workspaceId} />;
}

function SourcesRoute() {
  const { workspaceId } = useAppContext();
  if (!workspaceId) {
    return (
      <div className="p-6">
        <div className="text-sm text-[var(--muted-foreground)]">Loading workspace...</div>
      </div>
    );
  }
  return <SourcesPage workspaceId={workspaceId} />;
}

function SettingsRoute() {
  const { workspaceId, handleWorkspaceChange } = useAppContext();
  if (!workspaceId) {
    return (
      <div className="p-6">
        <div className="text-sm text-[var(--muted-foreground)]">Loading workspace...</div>
      </div>
    );
  }
  return <SettingsPage workspaceId={workspaceId} onWorkspaceChange={handleWorkspaceChange} />;
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: WorkspacePage,
});

const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/session/$sessionId',
  validateSearch: zodValidator(sessionSearchSchema),
  component: ChatRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsRoute,
});

const skillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/skills',
  component: SkillsRoute,
});

const sourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sources',
  component: SourcesRoute,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  validateSearch: zodValidator(profileSearchSchema),
  component: ProfilePage,
});

const profileParamRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile/$view',
  component: ProfilePageFromParam,
});

const sharedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shared/$streamId',
  component: SharedSessionPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  sessionRoute,
  settingsRoute,
  skillsRoute,
  sourcesRoute,
  profileRoute,
  profileParamRoute,
  sharedRoute,
]);

export const router = createRouter({ routeTree });

declare global {
  interface Window {
    __agentuityNavigate?: (to: string) => void;
  }
}

/**
 * Global navigation bridge for dynamically-generated UI components.
 * Used by spec-to-react.ts to enable internal navigation in json-render components
 * that don't have access to React hooks.
 * @internal
 */
if (typeof window !== 'undefined') {
  window.__agentuityNavigate = (to: string) => {
    router.navigate({ to });
  };
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
