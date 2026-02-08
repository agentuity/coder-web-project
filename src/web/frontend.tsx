/**
 * Agentuity Coder — Frontend entry point.
 * Sets up React providers and renders the app.
 */
import { AuthProvider, createAuthClient } from '@agentuity/auth/react';
import { AgentuityProvider } from '@agentuity/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
          <App />
        </AuthProvider>
      </AgentuityProvider>
    </QueryClientProvider>
  </StrictMode>
);
