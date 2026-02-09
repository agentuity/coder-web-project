import {
	AccountSettingsCards,
	ApiKeysCard,
	OrganizationSettingsCards,
	OrganizationSwitcher,
	SecuritySettingsCards,
} from '@daveyplate/better-auth-ui';

export function ProfilePage() {
	return (
		<div className="mx-auto max-w-2xl space-y-8 p-6">
			<div>
				<h1 className="text-2xl font-semibold text-[var(--foreground)]">Settings</h1>
				<p className="text-sm text-[var(--muted-foreground)]">
					Manage your account, security, and organization.
				</p>
			</div>

			<section className="space-y-2">
				<h2 className="text-lg font-medium text-[var(--foreground)]">Account</h2>
				<AccountSettingsCards />
			</section>

			<section className="space-y-2">
				<h2 className="text-lg font-medium text-[var(--foreground)]">Security</h2>
				<SecuritySettingsCards />
			</section>

			<section className="space-y-2">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-medium text-[var(--foreground)]">Organization</h2>
					<OrganizationSwitcher />
				</div>
				<OrganizationSettingsCards />
			</section>

			<section className="space-y-2">
				<h2 className="text-lg font-medium text-[var(--foreground)]">API Keys</h2>
				<ApiKeysCard />
			</section>
		</div>
	);
}
