// Ad-hoc diagnostic (not part of the regular suite): drives TWO real Supabase
// clients into the same Free Roam room, then does NOTHING for ~40s — no
// movement, no chat — while capturing the literal Realtime WebSocket frames
// via CDP (Network.webSocket*) on both pages, plus timestamped presence
// sync/join/leave events and every net.join() call. This is the requested
// wire-level flicker investigation: report what actually fires, don't guess.
//
// CDP is attached BEFORE navigation (a page's WebSocket connects during the
// initial supabase-net _open()/join(), so attaching after page.goto() would
// silently miss the socket's whole lifecycle — this bit us on the first pass).
//
// Run: node tests/e2e/wsFrameCapture.e2e.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { findChromium, startServer } from './lib.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 8637;
const IDLE_MS = 40000;
mkdirSync(join(ROOT, '.gg', 'screenshots'), { recursive: true });

const exe = findChromium();
if (!exe) {
  console.error('SKIP: no local Chromium build found');
  process.exit(0);
}

const stamp = Date.now();
const t0 = Date.now();
const frameLog = { A: [], B: [] };

function describeFrame(tag, dir, payloadData) {
  const t = Date.now() - t0;
  let short = payloadData;
  try {
    const parsed = JSON.parse(payloadData);
    if (Array.isArray(parsed)) {
      const [joinRef, ref, topic, event, payload] = parsed;
      short = `topic=${topic} event=${event} ref=${ref} joinRef=${joinRef}` +
        (payload && payload.status ? ` status=${payload.status}` : '') +
        (event === 'phx_error' || event === 'phx_close' ? ` payload=${JSON.stringify(payload).slice(0, 300)}` : '');
    }
  } catch {
    short = payloadData.length > 150 ? payloadData.slice(0, 150) + '…' : payloadData;
  }
  const line = `t+${t}ms ${tag} ${dir} ${short}`;
  frameLog[tag.replace(/[[\]]/g, '')].push(line);
  return line;
}

async function openInstrumentedPlayer(browser, port, name, tag) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 750 } });
  const identity = {
    name,
    figure: 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62',
    uniqueId: `e2e-${name.toLowerCase()}-${stamp}`,
    verifiedAt: new Date().toISOString(),
    classId: 'fighter',
  };
  await context.addInitScript((id) => {
    localStorage.setItem('habbo-dungeons-identity', JSON.stringify(id));
    localStorage.setItem('habbo-dungeons-char', JSON.stringify({ name: id.name, figure: id.figure }));
  }, identity);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`  ${tag} pageerror:`, e.message));

  // Attach CDP + Network domain BEFORE navigating, so the socket's entire
  // lifecycle (creation through every frame) is captured from t=0.
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  const wsUrlById = new Map();

  client.on('Network.webSocketCreated', (e) => {
    wsUrlById.set(e.requestId, e.url);
    const t = Date.now() - t0;
    const line = `t+${t}ms ${tag} WS CREATED ${e.url}`;
    frameLog[tag.replace(/[[\]]/g, '')].push(line);
    console.log(`  ${line}`);
  });
  client.on('Network.webSocketClosed', (e) => {
    const t = Date.now() - t0;
    const url = wsUrlById.get(e.requestId) || '(unknown)';
    const line = `t+${t}ms ${tag} *** WS CLOSED *** ${url}`;
    frameLog[tag.replace(/[[\]]/g, '')].push(line);
    console.log(`  ${line}`);
  });
  client.on('Network.webSocketFrameError', (e) => {
    const t = Date.now() - t0;
    const line = `t+${t}ms ${tag} *** WS FRAME ERROR *** ${e.errorMessage}`;
    frameLog[tag.replace(/[[\]]/g, '')].push(line);
    console.log(`  ${line}`);
  });
  client.on('Network.webSocketFrameSent', (e) => {
    const line = describeFrame(tag, 'SEND', e.response.payloadData);
    if (/phx_join|phx_leave|phx_close|phx_error/.test(line)) console.log(`  ${line}`);
  });
  client.on('Network.webSocketFrameReceived', (e) => {
    const line = describeFrame(tag, 'RECV', e.response.payloadData);
    if (/phx_join|phx_leave|phx_close|phx_error|presence_diff|presence_state/.test(line)) console.log(`  ${line}`);
  });

  await page.goto(`http://localhost:${port}/?backend=supabase`, { waitUntil: 'domcontentloaded' });
  return { context, page, tag };
}

// In-page: timestamp every presence-shaped event net.js emits, plus every
// net.join() call, once window.__debug exists.
async function hookNetEvents(page, tag) {
  const fnName = `__log_${tag.replace(/\W/g, '')}`;
  await page.exposeFunction(fnName, (line) => {
    const t = Date.now() - t0;
    const full = `t+${t}ms ${tag} ${line}`;
    frameLog[tag.replace(/[[\]]/g, '')].push(full);
    console.log(`  ${full}`);
  });
  await page.evaluate((fnName) => {
    const net = window.__debug.net;
    const log = window[fnName];
    for (const type of ['roster', 'enter', 'left', 'open', 'close']) {
      net.on(type, (m) => log(`net event '${type}' ${JSON.stringify(m).slice(0, 150)}`));
    }
    const origJoin = net.join.bind(net);
    net.join = (roomId) => {
      log(`net.join('${roomId}') CALLED — currently on room='${net.room}' connected=${net.connected}`);
      return origJoin(roomId);
    };
  }, fnName);
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
  console.log('=== WebSocket frame capture: two real Supabase clients, idle soak ===');
  console.log('(CDP attached before navigation — full socket lifecycle captured from t=0)\n');

  const A = await openInstrumentedPlayer(browser, PORT, `Ann${stamp % 10000}`, '[A]');
  const B = await openInstrumentedPlayer(browser, PORT, `Bob${stamp % 10000}`, '[B]');

  await A.page.click('#btnPlay');
  await B.page.click('#btnPlay');
  await A.page.waitForSelector('.dr-dock', { timeout: 15000 });
  await B.page.waitForSelector('.dr-dock', { timeout: 15000 });

  await A.page.waitForFunction(() => window.game.room, { timeout: 10000 });
  await B.page.waitForFunction(() => window.game.room, { timeout: 10000 });

  const connectedA = await A.page.waitForFunction(() => window.__debug.net.connected === true, { timeout: 15000 })
    .then(() => true).catch(() => false);
  const connectedB = await B.page.waitForFunction(() => window.__debug.net.connected === true, { timeout: 15000 })
    .then(() => true).catch(() => false);
  console.log(`\nclient A connected: ${connectedA}, client B connected: ${connectedB}`);
  if (!connectedA || !connectedB) throw new Error('multiplayer never connected — cannot capture real frames');

  await hookNetEvents(A.page, '[A]');
  await hookNetEvents(B.page, '[B]');

  const nameA = await A.page.evaluate(() => window.__debug.net.name);
  const nameB = await B.page.evaluate(() => window.__debug.net.name);

  const seesBOnA = await A.page.waitForFunction(
    (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()),
    nameB, { timeout: 20000 }
  ).then(() => true).catch(() => false);
  const seesAOnB = await B.page.waitForFunction(
    (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()),
    nameA, { timeout: 20000 }
  ).then(() => true).catch(() => false);
  console.log(`A sees B: ${seesBOnA}, B sees A: ${seesAOnB}`);

  const idleStartT = Date.now() - t0;
  console.log(`\n>>> IDLE WINDOW START at t+${idleStartT}ms — sitting still for ${IDLE_MS / 1000}s, no input on either page <<<\n`);
  await new Promise((r) => setTimeout(r, IDLE_MS));
  const idleEndT = Date.now() - t0;
  console.log(`\n>>> IDLE WINDOW END at t+${idleEndT}ms <<<\n`);

  const finalSeesBOnA = await A.page.evaluate(
    (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()), nameB
  );
  const finalSeesAOnB = await B.page.evaluate(
    (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()), nameA
  );
  console.log(`A still sees B: ${finalSeesBOnA}`);
  console.log(`B still sees A: ${finalSeesAOnB}`);

  // Restrict the summary + full dump to frames that occurred DURING the idle
  // window (after idleStartT) — the join handshake before it is expected to
  // be busy and isn't the question being asked.
  const KINDS = [
    'phx_join', 'phx_leave', 'phx_close', 'phx_error', 'presence_diff', 'presence_state',
    'heartbeat', 'WS CREATED', 'WS CLOSED', 'FRAME ERROR', 'access_token',
    "net event 'roster'", "net event 'enter'", "net event 'left'", "net event 'open'", "net event 'close'",
    'net.join(',
  ];
  const tOf = (line) => Number(line.match(/^t\+(\d+)ms/)[1]);
  for (const tag of ['A', 'B']) {
    const idleLines = frameLog[tag].filter((l) => tOf(l) >= idleStartT);
    console.log(`\n=== [${tag}] full frame log DURING the idle window (t+${idleStartT}ms .. t+${idleEndT}ms), ${idleLines.length} lines ===`);
    if (idleLines.length === 0) {
      console.log('  (nothing at all — zero WS traffic of any kind while idle)');
    } else {
      for (const l of idleLines) console.log(`  ${l}`);
    }
    const counts = {};
    for (const line of idleLines) {
      for (const kind of KINDS) {
        if (line.includes(kind)) counts[kind] = (counts[kind] || 0) + 1;
      }
    }
    console.log(`\n[${tag}] idle-window frame/event counts:`);
    if (Object.keys(counts).length === 0) console.log('  (none)');
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  }

  await A.page.screenshot({ path: join(ROOT, '.gg', 'screenshots', 'ws-capture-A-end.png') });
  await B.page.screenshot({ path: join(ROOT, '.gg', 'screenshots', 'ws-capture-B-end.png') });
} catch (e) {
  console.error('ERROR:', e.stack || e.message);
} finally {
  await browser.close();
  server.kill();
}
