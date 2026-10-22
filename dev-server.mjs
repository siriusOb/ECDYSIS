/* ECDYSIS / development server with automatic free-port selection.
   The existing npm run dev script can continue to call this file. */
   import http from 'node:http';
   import fs from 'node:fs';
   import path from 'node:path';
   import { fileURLToPath } from 'node:url';
   
   const root = path.dirname(fileURLToPath(import.meta.url));
   const requestedPort = Number(process.env.PORT || 5173);
   const host = '127.0.0.1';
   const types = {
     '.html':'text/html; charset=utf-8',
     '.css':'text/css; charset=utf-8',
     '.js':'text/javascript; charset=utf-8',
     '.mjs':'text/javascript; charset=utf-8',
     '.json':'application/json; charset=utf-8',
     '.png':'image/png',
     '.jpg':'image/jpeg',
     '.jpeg':'image/jpeg',
     '.webp':'image/webp',
     '.svg':'image/svg+xml',
     '.otf':'font/otf',
     '.woff2':'font/woff2',
     '.ico':'image/x-icon'
   };
   const clients = new Set();
   
   const server = http.createServer((req,res) => {
     let urlPath;
     try {
       urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
     } catch {
       res.writeHead(400); res.end('Bad request'); return;
     }
     if (urlPath === '/__ecdysis_events') {
       res.writeHead(200, {
         'Content-Type':'text/event-stream; charset=utf-8',
         'Cache-Control':'no-cache, no-transform',
         'Connection':'keep-alive',
         'X-Accel-Buffering':'no'
       });
       res.write(': connected\n\n');
       clients.add(res);
       req.on('close', () => clients.delete(res));
       return;
     }
   
     const filePath = path.resolve(root, '.' + (urlPath === '/' ? '/index.html' : urlPath));
     if (filePath !== root && !filePath.startsWith(root + path.sep)) {
       res.writeHead(403); res.end('Forbidden'); return;
     }
     fs.readFile(filePath, (err, data) => {
       if (err) {
         res.writeHead(err.code === 'ENOENT' ? 404 : 500);
         res.end(err.code === 'ENOENT' ? 'Not found' : 'Read error');
         return;
       }
       res.writeHead(200, {
         'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
         'Cache-Control':'no-store'
       });
       res.end(data);
     });
   });
   
   let port = requestedPort;
   server.on('error', err => {
     if (err.code === 'EADDRINUSE' && port < requestedPort + 15) {
       const occupied = port;
       port++;
       console.warn(`[ECDYSIS] Port ${occupied} is occupied; trying ${port}...`);
       server.listen(port, host);
     } else {
       console.error('[ECDYSIS] Could not start the development server:', err.message);
       process.exitCode = 1;
     }
   });
   server.on('listening', () => {
     const addr = server.address();
     const activePort = addr && typeof addr === 'object' ? addr.port : port;
     console.log(`\nECDYSIS development server: http://localhost:${activePort}/`);
     console.log(`Project folder: ${root}`);
     console.log('Save files in VS Code to reload the page. Ctrl+C stops the server.\n');
   });
   
   try {
     fs.watch(root, {recursive:true}, (event, filename) => {
       if (!filename || /(^|[/\\])(node_modules|\.git)([/\\]|$)|\.DS_Store|~$|\.swp$/.test(filename)) return;
       for (const res of clients) {
         try { res.write(`event: reload\ndata: ${Date.now()}\n\n`); }
         catch { clients.delete(res); }
       }
     });
   } catch (error) {
     console.warn('[ECDYSIS] Automatic reload not available:', error.message);
   }
   
   if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
     console.error('Invalid PORT value');
     process.exit(1);
   }
   server.listen(port, host);
   