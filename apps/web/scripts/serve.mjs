import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(webRoot, process.argv[2] ?? 'dist');
const port = Number.parseInt(process.env.PORT ?? '4174', 10);
const host = process.env.HOST ?? '127.0.0.1';

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.png', 'image/png'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.ttf', 'font/ttf'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const resolveRequest = (requestUrl) => {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}:${port}`).pathname);
  const relative = pathname === '/'
    ? 'index.html'
    : path.extname(pathname)
      ? pathname.slice(1)
      : path.join(pathname.slice(1), 'index.html');
  const resolved = path.resolve(root, relative);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  return resolved;
};

const sendFile = async (response, file, statusCode = 200) => {
  const details = await stat(file);
  response.writeHead(statusCode, {
    'Content-Length': details.size,
    'Content-Type': contentTypes.get(path.extname(file)) ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  });
  createReadStream(file).pipe(response);
};

const server = createServer(async (request, response) => {
  try {
    const file = resolveRequest(request.url ?? '/');
    if (!file) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    await sendFile(response, file);
  } catch {
    try {
      await sendFile(response, path.join(root, '404.html'), 404);
    } catch {
      response.writeHead(404).end('Not found');
    }
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Vital website preview: http://${host}:${port}\n`);
});
