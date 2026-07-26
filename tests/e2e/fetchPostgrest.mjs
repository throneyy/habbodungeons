// Fetch the PostgREST binary the duel e2e stack runs on (a single static
// executable — there is no npm package). Cached in .gg/bin, so this is a no-op
// after the first run. Run: node tests/e2e/fetchPostgrest.mjs
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BIN_DIR = join(ROOT, '.gg', 'bin');
const VERSION = 'v14.15';
const ASSET = {
  win32: 'windows-x86-64.zip',
  linux: 'linux-static-x86-64.tar.xz',
  darwin: 'macos-x86-64.tar.xz',
}[process.platform];

const exe = join(BIN_DIR, process.platform === 'win32' ? 'postgrest.exe' : 'postgrest');
if (existsSync(exe)) {
  console.log(`postgrest already present: ${exe}`);
  process.exit(0);
}
if (!ASSET) {
  console.error(`no PostgREST asset mapped for platform ${process.platform}`);
  process.exit(1);
}

const url = `https://github.com/PostgREST/postgrest/releases/download/${VERSION}/postgrest-${VERSION}-${ASSET}`;
console.log(`downloading ${url}`);
const res = await fetch(url, { redirect: 'follow' });
if (!res.ok) {
  console.error(`download failed: HTTP ${res.status}`);
  process.exit(1);
}
mkdirSync(BIN_DIR, { recursive: true });
const archive = join(BIN_DIR, `postgrest-${ASSET}`);
writeFileSync(archive, Buffer.from(await res.arrayBuffer()));

if (ASSET.endsWith('.zip')) {
  execFileSync('powershell', [
    '-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${BIN_DIR}' -Force`,
  ], { stdio: 'inherit' });
} else {
  execFileSync('tar', ['-xJf', archive, '-C', BIN_DIR], { stdio: 'inherit' });
  chmodSync(exe, 0o755);
}
console.log(`postgrest ready: ${exe}`);
