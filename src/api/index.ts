/**
 * API routes for Agentuity Coder.
 * Mounts auth, workspace, session, chat, skills, and sources routes.
 */
import { createRouter } from '@agentuity/runtime';
import { auth, authMiddleware, authRoutes } from '../auth';
import workspaceRoutes from '../routes/workspaces';
import sessionRoutes from '../routes/sessions';
import sessionDetailRoutes from '../routes/session-detail';
import chatRoutes from '../routes/chat';
import terminalRoutes from '../routes/terminal';
import skillRoutes from '../routes/skills';
import sourceRoutes from '../routes/sources';

const api = createRouter();

// Auth routes (public — no middleware). Uses mountAuthRoutes for proper cookie handling.
api.on(['GET', 'POST'], '/auth/*', authRoutes);

// Public endpoint: which auth methods are available
api.get('/auth-methods', (c) => {
  const hasGoogle = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return c.json({
    google: hasGoogle,
    email: !hasGoogle,
  });
});

// All other routes require authentication
api.use('/*', authMiddleware);

// GET /api/me — current authenticated user
api.get('/me', async (c) => {
  const session = c.get('session');
  const user = c.get('user');
  return c.json({ user, session });
});

// Workspace routes
api.route('/workspaces', workspaceRoutes);

// Session routes (nested under workspaces)
api.route('/workspaces/:wid/sessions', sessionRoutes);

// Individual session operations
api.route('/sessions', sessionDetailRoutes);

// Chat routes (nested under sessions)
api.route('/sessions', chatRoutes);

// Terminal WebSocket route (nested under sessions)
api.route('/sessions', terminalRoutes);

// Skills routes (nested under workspaces + standalone)
api.route('/workspaces/:wid/skills', skillRoutes);
api.route('/skills', skillRoutes);

// Sources routes (nested under workspaces + standalone)
api.route('/workspaces/:wid/sources', sourceRoutes);
api.route('/sources', sourceRoutes);

export default api;
