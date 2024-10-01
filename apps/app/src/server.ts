import { existsSync } from 'node:fs';
import { join } from 'node:path';

const distPath = './';

const contentTypes = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    // Handle ngsw.json specifically
    if (path === '/ngsw.json') {
      const filePath = join(distPath, 'ngsw.json');
      const file = Bun.file(filePath);
      const exists = existsSync(filePath);

      if (exists) {
        const headers = new Headers({
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        });
        return new Response(file, { headers });
      }
    }

    // Serve index.html for all navigation requests
    if (!path.includes('.')) {
      path = '/index.html';
    }

    // Remove leading slash
    path = path.slice(1);

    // Construct full path
    const filePath = `${distPath}/${path}`;

    // Try to serve the file
    try {
      const file = Bun.file(filePath);
      const exists = await file.exists();

      if (exists) {
        // Set appropriate headers based on file extension
        const headers = new Headers();
        const fileExtension = '.' + path.split('.').pop();
        const contentType =
          contentTypes[fileExtension] || 'application/octet-stream';
        headers.set('Content-Type', contentType);

        // Set caching headers
        headers.set('Cache-Control', 'no-cache');

        return new Response(file, { headers });
      }
    } catch (error) {
      console.error(`Error serving ${filePath}:`, error);
    }

    // If file not found or error occurred, return 404
    return new Response('Not Found', { status: 404 });
  },
  error(error) {
    console.error('Server error:', error);
    return new Response('Internal Server Error', { status: 500 });
  },
});

function graceful() {
  console.log('⛑️  graceful shutdown');
  process.exit(0);
}

process.on('SIGTERM', graceful);
process.on('SIGINT', graceful);
process.on('SIGQUIT', graceful);

process.on('uncaughtException', (error) => {
  console.log('🙀 uncaught exception', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log(`😽 unhandled promise rejection: ${promise}: ${reason}`);
});

console.log('🛰️ Insta app is running on port 3000');
