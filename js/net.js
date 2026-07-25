// Multiplayer transport selector.
//
// Local Node dev keeps the WebSocket presence hub (server/presence.js): the
// handshake presents the HMAC session credential minted at link time
// (Identity.session()). The static Supabase deploy swaps in SupabaseNet
// (js/supabaseNet.js), which speaks Realtime + Edge Functions but exposes the
// identical interface, so no consumer changes. Guests never connect either way;
// they play exactly today's solo-local game.
import { isSupabase } from './backend.js';
import { SupabaseNet } from './supabaseNet.js';

// Multiplayer transport: one WebSocket to the presence hub (server/presence.js).
//
// Reconnects with exponential backoff and queues outgoing frames while the
// socket is down (the room join is re-sent first on reconnect, so a blip
// never strands you invisible).
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];

export class Net {
  // identity: { name, figure, session } snapshot at connect time.
  constructor() {
    this.ws = null;
    this.handlers = new Map(); // msg type -> Set<fn>
    this.queue = []; // frames waiting for an open socket
    this.room = null; // current joined room id (re-joined on reconnect)
    this.identity = null;
    this.attempts = 0;
    this.closedByUs = false;
    this.reconnectTimer = null;
  }

  get active() {
    return !!this.identity;
  }

  get connected() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  emit(type, msg) {
    for (const fn of this.handlers.get(type) || []) fn(msg);
  }

  // Start (or restart) the connection for a verified identity. No-op without
  // a session credential.
  connect(identity) {
    if (!identity || !identity.session) return false;
    this.identity = identity;
    this.closedByUs = false;
    this.open();
    return true;
  }

  open() {
    if (!this.identity || this.connected) return;
    clearTimeout(this.reconnectTimer);
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams();
    params.set('auth', this.identity.session);
    params.set('figure', this.identity.figure || '');
    let ws;
    try {
      ws = new WebSocket(`${proto}//${location.host}/ws?${params}`);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.attempts = 0;
      // room first, then whatever queued while we were dark
      if (this.room) ws.send(JSON.stringify({ t: 'join', room: this.room }));
      for (const frame of this.queue.splice(0)) ws.send(frame);
      this.emit('open', {});
    });
    ws.addEventListener('message', (e) => {
      let msg = null;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg && typeof msg.t === 'string') this.emit(msg.t, msg);
    });
    ws.addEventListener('close', (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.emit('close', {});
      // 4000 = replaced by a newer tab for the same name: stay dead, a
      // reconnect loop here would fight the other tab forever
      if (!this.closedByUs && e.code !== 4000) this.scheduleReconnect();
    });
    ws.addEventListener('error', () => {
      /* close fires right after; backoff happens there */
    });
  }

  scheduleReconnect() {
    if (this.closedByUs || !this.identity) return;
    const delay = BACKOFF_MS[Math.min(this.attempts, BACKOFF_MS.length - 1)];
    this.attempts++;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  send(msg) {
    if (!this.active) return;
    const frame = JSON.stringify(msg);
    if (this.connected) this.ws.send(frame);
    else this.queue.push(frame);
  }

  join(roomId) {
    this.room = roomId;
    if (this.connected) this.ws.send(JSON.stringify({ t: 'join', room: roomId }));
    // not connected: open() re-joins this.room on the next successful connect
  }

  move(x, y) {
    if (this.room) this.send({ t: 'move', x, y });
  }

  chat(text, mode = 'say') {
    if (this.room) this.send({ t: 'chat', text, mode });
  }

  leaveRoom() {
    if (this.room && this.connected) this.ws.send(JSON.stringify({ t: 'leave' }));
    this.room = null;
  }

  disconnect() {
    this.closedByUs = true;
    this.room = null;
    this.queue = [];
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.identity = null;
  }
}

// One shared connection for the whole client session — Realtime on the static
// Supabase deploy, WebSocket in local Node dev.
export const net = isSupabase() ? new SupabaseNet() : new Net();

// Should this identity open a multiplayer connection? Supabase mode needs only a
// linked Habbo (the JWT is the credential, checked inside connect); local dev
// needs the HMAC session token from /api/link/verify.
export function shouldConnectNet(identity) {
  if (!identity || !identity.name) return false;
  return isSupabase() ? true : !!identity.session;
}
