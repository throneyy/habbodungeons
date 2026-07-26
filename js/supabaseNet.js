// SupabaseNet — a drop-in replacement for the WebSocket Net (js/net.js) that
// speaks Supabase Realtime + Edge Functions instead of the presence hub. It
// exposes the SAME interface (on/emit/send/connect/join/move/chat/leaveRoom/
// disconnect + active/connected), so every consumer — remotePlayers, party,
// tradeWindow, coopBattle — is untouched.
//
// Transport split (see the migration plan):
//   • room:<id>   Realtime channel — Presence for the roster (enter/left) and
//                 broadcast for movement + chat. Movement is CLIENT-TRUSTED
//                 (path A): the room model stays advisory on each client; there
//                 is no per-step server validation (that guarantee is downgraded
//                 vs. the ws hub, by design, for smooth walking).
//   • user:<id>   private mailbox — edge functions broadcast prompts + state
//                 here (invited/declined/party/trade-*).
//   • party:<id>  private co-op relay — descend/descend-ack/relay ride broadcast
//                 directly between members (leader-relay, path B).
//   • room_layouts postgres_changes — the "refetch layout vN" admin push.
//
// Multiplayer requires a Supabase auth session AND a linked Habbo; guests fall
// through to solo-local exactly as before (connect() no-ops without a session).
import { getSupabase } from './supabase.js';
import { invokeFn } from './backend.js';

export class SupabaseNet {
  constructor() {
    this.handlers = new Map();
    this.identity = null;
    this.sb = null;
    this.userId = null;
    this.name = null;
    this.figure = '';
    this.room = null; // current room id (re-joined after connect)
    this.pos = { x: 0, y: 0, dir: 4 };
    this.roomChannel = null;
    this.userChannel = null;
    this.partyChannel = null;
    this.partyId = null;
    this.layoutChannel = null;
    this._connected = false;
    this._rosterSent = false;
    this._heartbeat = null;
    this.classId = 'fighter'; // the calling this session is playing — see connect()
  }

  get active() {
    return !!this.identity;
  }
  get connected() {
    return this._connected;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }
  emit(type, msg) {
    for (const fn of this.handlers.get(type) || []) fn(msg);
  }

  // Begin the session for a linked identity. Returns false (solo-local) when
  // Supabase is unreachable or the browser isn't signed in.
  connect(identity) {
    if (!identity || !identity.name) return false;
    this.identity = identity;
    this.name = identity.name;
    this.figure = identity.figure || '';
    // Carried over presence so every OTHER client's RemotePlayers.spawn() can
    // render this player's real weapon (js/classWeapons.js) instead of the
    // fighter/sword default — confirmed missing from the wire entirely before
    // this fix (see js/remotePlayers.js and tests/e2e/classIdFlicker.e2e.mjs).
    this.classId = identity.classId || 'fighter';
    this._open().catch(() => {});
    return true;
  }

  async _open() {
    const sb = await getSupabase();
    if (!sb) {
      this.identity = null;
      return;
    }
    this.sb = sb;
    const { data: { user } = { user: null } } = await sb.auth.getUser();
    let currentUser = user;
    if (!currentUser) {
      // No email account required: mint an anonymous Supabase session so this
      // browser has a JWT for Realtime. The Habbo motto link remains the
      // identity; the anon user is just the transport credential.
      try {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        currentUser = data?.user || null;
      } catch (e) {
        console.warn('[habbo-dungeons] anonymous sign-in failed — multiplayer off:', e?.message || e);
      }
      if (!currentUser) {
        this.identity = null;
        return;
      }
    }
    this.userId = currentUser.id;
    // Private Realtime channels enforce RLS on realtime.messages via the JWT.
    // Push the current access token so anon sessions can subscribe/broadcast.
    try {
      const { data: { session } = { session: null } } = await sb.auth.getSession();
      if (session?.access_token && sb.realtime?.setAuth) sb.realtime.setAuth(session.access_token);
      sb.auth.onAuthStateChange((_e, s) => {
        if (s?.access_token && sb.realtime?.setAuth) sb.realtime.setAuth(s.access_token);
      });
    } catch { /* ignore */ }
    await this._openUserChannel();
    this._openLayoutChannel();
    this._connected = true;
    this.emit('open', {});
    if (this.room) this.join(this.room);
  }

  // ---- private mailbox: prompts + party/trade state from edge functions ----
  async _openUserChannel() {
    const ch = this.sb.channel(`user:${this.userId}`, { config: { private: true } });
    const relay = (event) => ch.on('broadcast', { event }, ({ payload }) => this._onUserEvent(event, payload));
    for (const e of [
      'invited', 'declined', 'party',
      'trade-asked', 'trade-state', 'trade-done', 'trade-cancelled', 'trade-error',
    ]) relay(e);
    await new Promise((res) => ch.subscribe((status) => status === 'SUBSCRIBED' && res()));
    this.userChannel = ch;
  }

  _onUserEvent(event, payload) {
    if (event === 'party') {
      // Track the party id so the co-op relay channel follows membership.
      this._syncPartyChannel(payload && payload.partyId);
      this.emit('party', { leader: payload.leader, members: payload.members || [] });
      return;
    }
    this.emit(event, payload || {});
  }

  // ---- admin layout push -------------------------------------------------
  _openLayoutChannel() {
    this.layoutChannel = this.sb
      .channel('room_layouts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_layouts' }, (p) => {
        const version = (p.new && p.new.version) || 0;
        this.emit('layout', { version });
      })
      .subscribe();
  }

  // ---- co-op relay channel (follows party membership) --------------------
  async _syncPartyChannel(partyId) {
    if (partyId === this.partyId) return;
    if (this.partyChannel) {
      try { await this.sb.removeChannel(this.partyChannel); } catch { /* ignore */ }
      this.partyChannel = null;
    }
    this.partyId = partyId || null;
    if (!this.partyId) return;
    const ch = this.sb.channel(`party:${this.partyId}`, { config: { private: true, broadcast: { self: false } } });
    for (const e of ['descend', 'descend-ack', 'relay']) {
      ch.on('broadcast', { event: e }, ({ payload }) => this._onPartyEvent(e, payload));
    }
    ch.subscribe();
    this.partyChannel = ch;
  }

  _onPartyEvent(event, payload) {
    if (!payload) return;
    if (payload.from && payload.from === this.name) return; // never echo to self
    if (payload.to && payload.to !== this.name) return; // targeted at someone else
    this.emit(event, payload);
  }

  // ---- room presence + movement + chat -----------------------------------
  join(roomId) {
    this.room = roomId;
    if (!this._connected || !this.sb) return; // _open() re-joins after connect
    this._leaveRoomChannel();
    this._rosterSent = false;
    const ch = this.sb.channel(`room:${roomId}`, {
      config: {
        private: true, // enforces realtime.messages RLS (room:% policy)
        broadcast: { self: false, ack: false },
        presence: { key: this.userId },
      },
    });
    ch.on('presence', { event: 'sync' }, () => this._onPresenceSync(ch, roomId));
    ch.on('presence', { event: 'join' }, ({ newPresences }) => this._onPresenceJoin(newPresences));
    ch.on('presence', { event: 'leave' }, ({ leftPresences }) => this._onPresenceLeave(leftPresences));
    ch.on('broadcast', { event: 'moved' }, ({ payload }) => this.emit('moved', payload));
    ch.on('broadcast', { event: 'chatted' }, ({ payload }) => this.emit('chatted', payload));
    ch.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      await ch.track({ name: this.name, figure: this.figure, classId: this.classId, ...this.pos });
      this._upsertPresence();
      this._startHeartbeat();
    });
    this.roomChannel = ch;
  }

  _member(meta) {
    return {
      name: meta.name,
      figure: meta.figure || '',
      classId: meta.classId || 'fighter',
      x: meta.x | 0,
      y: meta.y | 0,
      dir: meta.dir ?? 4,
    };
  }

  _onPresenceSync(ch, roomId) {
    if (this._rosterSent) return; // enter/left carry subsequent changes
    const state = ch.presenceState();
    const members = [];
    for (const [key, metas] of Object.entries(state)) {
      if (key === this.userId) continue;
      if (metas && metas[0]) members.push(this._member(metas[0]));
    }
    this._rosterSent = true;
    this.emit('roster', { room: roomId, members });
  }

  _onPresenceJoin(newPresences) {
    for (const meta of newPresences || []) {
      if (meta.name && meta.name !== this.name) this.emit('enter', { member: this._member(meta) });
    }
  }
  _onPresenceLeave(leftPresences) {
    for (const meta of leftPresences || []) {
      if (meta.name) this.emit('left', { name: meta.name });
    }
  }

  move(x, y) {
    // Update this.pos BEFORE the room check (only the network broadcast below
    // needs an active room). Without this, a caller that sets the local
    // player's true spawn position (RemotePlayers.bindLocalUnit, called right
    // after game.addUnit but not guaranteed to run after join() sets
    // this.room — see main.js's room-switch handler, which calls
    // game.setRoom() BEFORE net.join()) would have its update silently
    // dropped, leaving this.pos stuck at the constructor default
    // { x: 0, y: 0 }. The next join()'s subscribe callback spreads this.pos
    // into the channel's presence payload, so it then broadcasts world tile
    // (0,0) to every other client as this player's position — which, in a
    // room where (0,0) sits behind scene geometry
    // (a building, wall, etc.), depth-occludes the avatar on the canvas
    // while the player's DOM name tag (js/remotePlayers.js, never
    // depth-tested against props) still renders fully visible: a floating
    // tag with no visible body. Confirmed live via
    // tests/e2e/depthOcclusionConfirm.e2e.mjs. Every room-join now always
    // broadcasts the caller's REAL position immediately (see
    // RemotePlayers.bindLocalUnit), so nobody is ever represented at the
    // stale (0,0) default once they actually have a spawn tile.
    this.pos = { x, y, dir: this.pos.dir };
    if (!this.room) return;
    if (this.roomChannel) {
      this.roomChannel.send({ type: 'broadcast', event: 'moved', payload: { name: this.name, x, y } });
    }
    this._upsertPresence();
  }

  chat(text, mode = 'say') {
    if (!this.room || !this.roomChannel) return;
    this.roomChannel.send({
      type: 'broadcast',
      event: 'chatted',
      payload: { name: this.name, text, mode },
    });
  }

  // Durable presence row (queryable + reaped by presence-reap). Best-effort.
  _upsertPresence() {
    if (!this.sb || !this.userId || !this.room) return;
    this.sb.from('room_presence').upsert({
      user_id: this.userId,
      room_id: this.room,
      name: this.name,
      figure: this.figure,
      x: this.pos.x,
      y: this.pos.y,
      dir: this.pos.dir,
      last_seen: new Date().toISOString(),
    }, { onConflict: 'user_id' }).then(() => {}, () => {});
  }

  _startHeartbeat() {
    clearInterval(this._heartbeat);
    this._heartbeat = setInterval(() => this._upsertPresence(), 20000);
  }

  _leaveRoomChannel() {
    clearInterval(this._heartbeat);
    this._heartbeat = null;
    if (this.roomChannel) {
      try { this.sb.removeChannel(this.roomChannel); } catch { /* ignore */ }
      this.roomChannel = null;
    }
  }

  leaveRoom() {
    if (this.room && this.sb && this.userId) {
      this.sb.from('room_presence').delete().eq('user_id', this.userId).then(() => {}, () => {});
    }
    this._leaveRoomChannel();
    this.room = null;
  }

  // ---- generic sender: party / trade / co-op relay -----------------------
  send(msg) {
    if (!this.active || !msg || typeof msg.t !== 'string') return;
    const t = msg.t;
    // Co-op relay rides the party broadcast channel directly (leader-relay).
    if (t === 'descend' || t === 'descend-ack' || t === 'relay') {
      if (!this.partyChannel) return;
      this.partyChannel.send({
        type: 'broadcast',
        event: t,
        payload: { ...msg, t, from: this.name },
      });
      return;
    }
    // Everything else is an authoritative mutation → an edge function.
    const fn = SEND_FN[t];
    if (!fn) return;
    invokeFn(fn.name, fn.body(msg)).catch(() => {});
  }

  disconnect() {
    this.leaveRoom();
    for (const ch of [this.userChannel, this.partyChannel, this.layoutChannel]) {
      if (ch && this.sb) {
        try { this.sb.removeChannel(ch); } catch { /* ignore */ }
      }
    }
    this.userChannel = this.partyChannel = this.layoutChannel = null;
    this.partyId = null;
    this._connected = false;
    this.identity = null;
    this.emit('close', {});
  }
}

// Map the ws frame types onto their edge functions + request bodies.
const SEND_FN = {
  invite: { name: 'party-invite', body: (m) => ({ name: m.name }) },
  accept: { name: 'party-accept', body: (m) => ({ from: m.from }) },
  decline: { name: 'party-decline', body: (m) => ({ from: m.from }) },
  'party-leave': { name: 'party-leave', body: () => ({}) },
  disband: { name: 'party-disband', body: () => ({}) },
  'trade-open': { name: 'trade-open', body: (m) => ({ name: m.name }) },
  'trade-offer': { name: 'trade-offer', body: (m) => ({ item: m.item }) },
  'trade-retract': { name: 'trade-retract', body: (m) => ({ item: m.item }) },
  'trade-accept': { name: 'trade-accept', body: () => ({}) },
  'trade-confirm': { name: 'trade-confirm', body: () => ({}) },
  'trade-cancel': { name: 'trade-cancel', body: () => ({}) },
};
