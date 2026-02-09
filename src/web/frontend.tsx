/**
 * Agentuity Coder — Frontend entry point.
 * Sets up React providers and renders the app.
 */
import { AuthProvider, createAuthClient } from '@agentuity/auth/react';
import { AgentuityProvider } from '@agentuity/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthUIProvider } from '@daveyplate/better-auth-ui';
import { NuqsAdapter } from 'nuqs/adapters/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

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
						window.location.href = href;
					}}
					organization
					apiKey
					credentials={{ forgotPassword: true }}
					account={{ fields: ['image', 'name'] }}
					avatar
				>
					<NuqsAdapter>
						<App />
					</NuqsAdapter>
				</AuthUIProvider>
			</AuthProvider>
		</AgentuityProvider>
    </QueryClientProvider>
  </StrictMode>
);
