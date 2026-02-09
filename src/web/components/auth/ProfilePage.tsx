import { authClient } from '../../lib/auth-client';

export function ProfilePage() {
	const { data: session } = authClient.useSession();
	const userName = session?.user?.name ? String(session.user.name) : 'Not set';
	const userEmail = session?.user?.email ? String(session.user.email) : 'Not set';

	return (
		<div className="p-6 space-y-4 max-w-md">
			<h2 className="text-lg font-semibold">Profile</h2>
			<div className="space-y-2">
				<div>
					<p className="text-xs text-[var(--muted-foreground)]">Name</p>
					<p className="text-sm">{userName}</p>
				</div>
				<div>
					<p className="text-xs text-[var(--muted-foreground)]">Email</p>
					<p className="text-sm">{userEmail}</p>
				</div>
			</div>
			<p className="text-xs text-[var(--muted-foreground)]">
				Full profile management coming soon via Better Auth UI.
			</p>
		</div>
	);
}
