import { AccountView } from '@daveyplate/better-auth-ui';
import type { AccountViewPath } from '@daveyplate/better-auth-ui';
import { useCallback, useEffect, useState } from 'react';

/** Map URL path segments (from the `av` query param) to AccountView keys. */
const segmentToView: Record<string, AccountViewPath> = {
	'': 'SETTINGS',
	settings: 'SETTINGS',
	security: 'SECURITY',
	'api-keys': 'API_KEYS',
	organizations: 'ORGANIZATIONS',
	teams: 'TEAMS',
};

/** Read the current account view from URL query params and re-render on popstate. */
function useAccountView(): AccountViewPath {
	const getView = useCallback((): AccountViewPath => {
		const params = new URLSearchParams(window.location.search);
		const av = params.get('av') || '';
		return segmentToView[av] || 'SETTINGS';
	}, []);

	const [view, setView] = useState<AccountViewPath>(getView);

	useEffect(() => {
		const handler = () => setView(getView());
		window.addEventListener('popstate', handler);
		return () => window.removeEventListener('popstate', handler);
	}, [getView]);

	return view;
}

export function ProfilePage() {
	const view = useAccountView();

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
