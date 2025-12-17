#!/usr/bin/env node
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');

function findFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen({ host, port: 0 }, () => {
      const address = srv.address();
      srv.close(() => resolve(address.port));
    });
  });
}

function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', (err) => {
        if (Date.now() - start > timeoutMs) {
          reject(err);
        } else {
          setTimeout(attempt, 250);
        }
      });
      req.setTimeout(2000, () => {
        req.destroy(new Error('Timed out waiting for server'));
      });
    };
    attempt();
  });
}

async function startServer() {
  const host = '127.0.0.1';
  const port = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : await findFreePort(host);
  const docroot = path.join(__dirname, '..', 'public');
  const args = ['-S', `${host}:${port}`, '-t', docroot];

  const php = spawn('php', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  php.stdout.on('data', (chunk) => process.stdout.write(chunk));
  php.stderr.on('data', (chunk) => process.stderr.write(chunk));

  const baseURL = `http://${host}:${port}`;
  const readyUrl = `${baseURL}/index.php?page=builder`;
  await waitForServer(readyUrl);

  const stop = () => {
    php.kill();
  };

  php.on('exit', (code) => {
    if (code && code !== 0) {
      console.warn(`php -S exited with code ${code}`);
    }
  });

  return { baseURL, host, port, stop, process: php };
}

if (require.main === module) {
  startServer()
    .then(({ baseURL, process: php }) => {
      console.log(`E2E server ready at ${baseURL}`);
      const shutdown = () => {
        php.kill();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { startServer };
