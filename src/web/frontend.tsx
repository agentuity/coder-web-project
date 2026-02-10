/**
 * Agentuity Coder — Frontend entry point.
 * Sets up React providers and renders the app.
 */
import { AuthProvider, createAuthClient } from '@agentuity/auth/react';
import { AgentuityProvider } from '@agentuity/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthUIProvider } from '@daveyplate/better-auth-ui';
import { NuqsAdapter } from 'nuqs/adapters/react';
import { type MouseEvent, type ReactNode, StrictMode, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import './styles.css';

/**
 * Handle navigation for account-scoped paths by updating URL query params
 * instead of performing a full page redirect.
 */
function handleAccountNavigate(href: string): boolean {
	if (href.startsWith('/account')) {
		const segment = href.replace(/^\/account\/?/, '');
		const params = new URLSearchParams(window.location.search);
		params.set('p', 'profile');
		if (segment) {
			params.set('av', segment);
		} else {
			params.delete('av');
		}
		window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
		window.dispatchEvent(new PopStateEvent('popstate'));
		return true;
	}
	return false;
}

/**
 * Custom Link component for AuthUIProvider that intercepts account paths
 * to prevent full page redirects when switching settings tabs.
 */
function AuthLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
	const handleClick = useCallback(
		(e: MouseEvent<HTMLAnchorElement>) => {
			if (handleAccountNavigate(href)) {
				e.preventDefault();
			}
		},
		[href],
	);

	return (
		<a href={href} className={className} onClick={handleClick}>
			{children}
		</a>
	);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      refetchOnWindowFocus: false,
    },
  },
});

const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/api/auth',
});

const elem = document.getElementById('root');
if (!elem) throw new Error('Root element not found');

createRoot(elem).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
		<AgentuityProvider>
			<AuthProvider authClient={authClient}>
				<AuthUIProvider
					authClient={authClient}
					navigate={(href: string) => {
						if (!handleAccountNavigate(href)) {
							window.location.href = href;
						}
					}}
					replace={(href: string) => {
						if (!handleAccountNavigate(href)) {
							window.location.replace(href);
						}
					}}
					Link={AuthLink}
					organization
					apiKey
					credentials={{ forgotPassword: true }}
					account={{ fields: ['image', 'name'] }}
					avatar
				>
					<NuqsAdapter>
						<App />
					</NuqsAdapter>
					<Toaster richColors position="bottom-right" />
				</AuthUIProvider>
			</AuthProvider>
		</AgentuityProvider>
    </QueryClientProvider>
  </StrictMode>
);
