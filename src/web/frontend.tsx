/**
 * Agentuity Coder — Frontend entry point.
 * Sets up React providers and renders the app.
 */
import { AuthProvider, createAuthClient } from '@agentuity/auth/react';
import { AgentuityProvider } from '@agentuity/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { AuthUIProvider } from '@daveyplate/better-auth-ui';
import { type MouseEvent, type ReactNode, StrictMode, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { router } from './router';
import './styles.css';

/**
 * Handle navigation for account-scoped paths by updating URL query params
 * instead of performing a full page redirect.
 */
function getAccountNavigateTarget(href: string) {
	const segment = href.replace(/^\/account\/?/, '');
	return {
		to: '/profile',
		search: segment ? { av: segment } : {},
	};
}

function isInternalHref(href: string) {
	return href.startsWith('/') && !href.startsWith('/api') && !href.startsWith('//');
}

/**
 * Custom Link component for AuthUIProvider that intercepts account paths
 * to prevent full page redirects when switching settings tabs.
 */
function AuthLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
	const handleClick = useCallback(
		(e: MouseEvent<HTMLAnchorElement>) => {
			if (href.startsWith('/account')) {
				e.preventDefault();
				router.navigate({ ...getAccountNavigateTarget(href) });
				return;
			}
			if (isInternalHref(href)) {
				e.preventDefault();
				router.navigate({ to: href });
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
						if (href.startsWith('/account')) {
							router.navigate({ ...getAccountNavigateTarget(href) });
							return;
						}
						if (isInternalHref(href)) {
							router.navigate({ to: href });
							return;
						}
						window.location.href = href;
					}}
					replace={(href: string) => {
						if (href.startsWith('/account')) {
							router.navigate({ ...getAccountNavigateTarget(href), replace: true });
							return;
						}
						if (isInternalHref(href)) {
							router.navigate({ to: href, replace: true });
							return;
						}
						window.location.replace(href);
					}}
					Link={AuthLink}
					organization
					apiKey
					credentials={{ forgotPassword: true }}
					account={{ fields: ['image', 'name'] }}
					avatar
				>
					<RouterProvider router={router} />
					<Toaster richColors position="bottom-right" />
				</AuthUIProvider>
			</AuthProvider>
		</AgentuityProvider>
    </QueryClientProvider>
  </StrictMode>
);
