import { Hono } from 'hono';
import { join, normalize } from 'path';

const app = new Hono();
const port = Number(Bun.env.PORT ?? 3000);
const publicRoot = join(process.cwd(), 'public');
const srcRoot = join(process.cwd(), 'src');

const applyFrameHeaders = (c: { header: (key: string, value: string) => void }) => {
  c.header('X-Frame-Options', 'ALLOWALL');
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  c.header('Access-Control-Allow-Headers', '*');
  c.header('Content-Security-Policy', 'frame-ancestors *');
};

const resolveWithin = (root: string, pathname: string) => {
  const cleaned = pathname.replace(/^\/+/, '');
  const resolved = normalize(join(root, cleaned));
  if (!resolved.startsWith(root)) {
    return null;
  }
  return resolved;
};

const serveFile = async (
  c: { body: (data: BodyInit | null, status?: number, headers?: Record<string, string>) => Response },
  filePath: string,
) => {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }
  const extension = filePath.split('.').pop()?.toLowerCase();
  const contentType =
    extension === 'html'
      ? 'text/html; charset=utf-8'
      : extension === 'css'
        ? 'text/css; charset=utf-8'
        : extension === 'js' || extension === 'ts' || extension === 'tsx'
          ? 'application/javascript; charset=utf-8'
          : file.type || 'application/octet-stream';
  return c.body(file.stream(), 200, {
    'Content-Type': contentType,
  });
};

app.use('*', async (c, next) => {
  try {
    applyFrameHeaders(c);
    await next();
  } catch (error) {
    console.error('Web runtime error:', error);
    applyFrameHeaders(c);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.options('*', (c) => {
  applyFrameHeaders(c);
  return c.body(null, 204);
});

app.get('/health', (c) => c.json({ status: 'ok' }));

app.get('/app.js', async (c) => {
  const appPath = resolveWithin(srcRoot, '/app.tsx');
  if (!appPath) {
    return c.json({ error: 'App module not found' }, 404);
  }
  const file = Bun.file(appPath);
  if (!(await file.exists())) {
    return c.json({ error: 'App module not found' }, 404);
  }
  try {
    const result = await Bun.build({
      entrypoints: [appPath],
      target: 'browser',
      minify: false,
    });
    if (result.outputs.length === 0) {
      return c.json({ error: 'Build failed' }, 500);
    }
    const output = result.outputs[0];
    return c.body(output.stream(), 200, {
      'Content-Type': 'application/javascript; charset=utf-8',
    });
  } catch (error) {
    console.error('Build error:', error);
    return c.json({ error: 'Build failed' }, 500);
  }
});

app.get('*', async (c) => {
  const pathname = new URL(c.req.url).pathname;

  const publicPath = resolveWithin(publicRoot, pathname);
  if (publicPath) {
    const publicResponse = await serveFile(c, publicPath);
    if (publicResponse) {
      return publicResponse;
    }
  }

  const indexPath = resolveWithin(srcRoot, '/index.html');
  if (!indexPath) {
    return c.json({ error: 'Index not found' }, 404);
  }
  const indexResponse = await serveFile(c, indexPath);
  if (indexResponse) {
    return indexResponse;
  }
  return c.json({ error: 'Index not found' }, 404);
});

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`Web runtime server listening on :${port}`);
