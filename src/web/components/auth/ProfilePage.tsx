import { AccountView } from '@daveyplate/better-auth-ui';
import type { AccountViewPath } from '@daveyplate/better-auth-ui';
import { useParams, useSearch } from '@tanstack/react-router';

/** Map URL path segments (from the `av` query param) to AccountView keys. */
const segmentToView: Record<string, AccountViewPath> = {
  '': 'SETTINGS',
  settings: 'SETTINGS',
  security: 'SECURITY',
  'api-keys': 'API_KEYS',
  organizations: 'ORGANIZATIONS',
  teams: 'TEAMS',
};

function resolveView(segment?: string): AccountViewPath {
  const key = segment ?? '';
  return segmentToView[key] || 'SETTINGS';
}

function ProfilePageContent({ view }: { view: AccountViewPath }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Manage your account, security, and organization.
        </p>
      </div>
      <AccountView view={view} />
    </div>
  );
}

export function ProfilePage() {
  const { av } = useSearch({ from: '/profile' });
  const view = resolveView(av);
  return <ProfilePageContent view={view} />;
}

export function ProfilePageFromParam() {
  const { view } = useParams({ from: '/profile/$view' });
  const resolved = resolveView(view);
  return <ProfilePageContent view={resolved} />;
}
