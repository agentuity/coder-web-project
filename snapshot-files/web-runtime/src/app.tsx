import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#e4e4e7',
      backgroundColor: '#09090b',
    }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Web Sandbox Ready
      </h1>
      <p style={{ color: '#a1a1aa' }}>
        This sandbox is ready for content. Files will be pushed by the coding agent.
      </p>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
}
