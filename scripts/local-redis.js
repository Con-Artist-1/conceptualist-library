import fs from 'fs';
import net from 'net';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const REDIS_DATA_DIR = path.join(PROJECT_ROOT, '.data', 'redis');

function isTcpPortOpen(host = '127.0.0.1', port = 6379, timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function findRedisServerBinary() {
  if (process.env.REDIS_SERVER_BIN && fs.existsSync(process.env.REDIS_SERVER_BIN)) {
    return process.env.REDIS_SERVER_BIN;
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    if (localAppData) {
      const wingetLink = path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'redis-server.exe');
      if (fs.existsSync(wingetLink)) return wingetLink;

      const packagesDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
      if (fs.existsSync(packagesDir)) {
        try {
          for (const entry of fs.readdirSync(packagesDir)) {
            if (entry.toLowerCase().includes('redis')) {
              const candidate = path.join(packagesDir, entry, 'redis-server.exe');
              if (fs.existsSync(candidate)) return candidate;
            }
          }
        } catch {
          // Ignore package directory scan errors
        }
      }
    }
    return 'redis-server.exe';
  }

  return 'redis-server';
}

/**
 * Ensures a local Redis instance is listening on 127.0.0.1:6379 for dev/preview mode.
 * Returns true if local Redis is reachable, false otherwise (never throws).
 */
export async function ensureLocalRedisRunning({ host = '127.0.0.1', port = 6379 } = {}) {
  if (process.env.VERCEL || process.env.REDIS_URL || process.env.KV_URL) {
    return false;
  }

  if (await isTcpPortOpen(host, port)) {
    return true;
  }

  const bin = findRedisServerBinary();
  try {
    fs.mkdirSync(REDIS_DATA_DIR, { recursive: true });
    const child = spawn(
      bin,
      [
        '--bind', host,
        '--port', String(port),
        '--dir', REDIS_DATA_DIR,
        '--save', '60', '1',
        '--appendonly', 'no'
      ],
      {
        cwd: REDIS_DATA_DIR,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }
    );
    child.on('error', () => {
      // Binary unavailable on PATH or failed to start
    });
    child.unref();

    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      if (await isTcpPortOpen(host, port, 250)) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch {
    // Graceful fallback if local Redis binary cannot be spawned
  }

  return isTcpPortOpen(host, port);
}

const isDirectCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === __filename;

if (isDirectCli) {
  ensureLocalRedisRunning().then((ok) => {
    if (ok) {
      console.log('Local Redis is running on 127.0.0.1:6379 (data dir: .data/redis)');
      process.exit(0);
    } else {
      console.error('Could not start local Redis server on 127.0.0.1:6379.');
      process.exit(1);
    }
  });
}

