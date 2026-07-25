// Room music: a hidden looping YouTube player streams each room's ambience
// track, with a Habbo-style volume control docked at the right end of the
// chat toolbar. Press the speaker to reveal the slider (smooth pop-over);
// default volume is 10% and the user's slider position persists.
const LS_VOL = 'habbo-dungeons-music-vol';
const DEFAULT_VOL = 10; // percent

// per-room ambience (YouTube video ids) — each room has its own track and
// switching rooms hard-swaps the audio (no tavern music bleeding into the
// village). Rooms not listed fall back to 'default' — EXCEPT battle rooms
// (setRoom's authoredOnly), which stay silent until a track is authored here.
// Battle room ids: antechamber, nave, rampart, throne (The Dungeon) and
// glade, ruin, meadhall, hollow (Trials of the Realms).
const ROOM_TRACKS = {
  tavern: 'RUn1dJY6syc', // medieval tavern ambience
  square: 'q9yaKpYS9qc', // medieval village ambience
  mirkwood: 'EUer-Tto1ZA', // dark forest ambience — the gloomy wood
  // The Dungeon's INDOOR battle rooms (walled DUNGEON_KIT interiors) share one
  // dark-dungeon soundscape. Outdoor rooms — rampart (Gatehouse Yard) and the
  // Trials of the Realms sets (glade/ruin/meadhall/hollow) — stay unauthored.
  antechamber: 'bxoRRobHtGM', // dark dungeon ambience
  nave: 'bxoRRobHtGM',
  throne: 'bxoRRobHtGM',
  default: 'q9yaKpYS9qc',
};

export class RoomMusic {
  constructor() {
    this.player = null;
    this.playerReady = false;
    this.pendingTrack = null;
    this.track = null;
    this.ui = null;
    this.volume = this.loadVolume();
    // browsers may still block cross-origin iframe audio until a gesture on
    // the page: retry the paused player on the next pointer press
    this.onGesture = () => {
      if (this.playerReady && this.track) {
        const st = this.player.getPlayerState();
        if (st !== 1) this.player.playVideo(); // 1 = playing
      }
    };
    document.addEventListener('pointerdown', this.onGesture);
  }

  loadVolume() {
    const v = Number(localStorage.getItem(LS_VOL));
    return Number.isFinite(v) && localStorage.getItem(LS_VOL) != null
      ? Math.max(0, Math.min(100, v))
      : DEFAULT_VOL;
  }

  // ---------------------------------------------------------------- player

  ensureApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (!this.apiPromise) {
      this.apiPromise = new Promise((resolve) => {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (prev) prev();
          resolve();
        };
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      });
    }
    return this.apiPromise;
  }

  async ensurePlayer() {
    if (this.player) return;
    await this.ensureApi();
    if (this.player) return;
    const host = document.createElement('div');
    host.id = 'musicPlayer';
    host.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;bottom:-10px;opacity:0;pointer-events:none';
    document.body.appendChild(host);
    this.player = new window.YT.Player('musicPlayer', {
      width: 1,
      height: 1,
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1 },
      events: {
        onReady: () => {
          this.playerReady = true;
          this.applyVolume();
          if (this.pendingTrack) this.cue(this.pendingTrack);
        },
        onStateChange: (e) => {
          if (e.data === 0 && this.track) this.player.playVideo(); // ended -> loop
        },
      },
    });
  }

  cue(videoId) {
    this.track = videoId;
    if (!this.playerReady) {
      this.pendingTrack = videoId;
      return;
    }
    this.pendingTrack = null;
    this.applyVolume();
    this.player.loadVideoById(videoId);
  }

  applyVolume() {
    if (!this.playerReady) return;
    this.player.setVolume(this.volume);
    if (this.volume === 0) this.player.mute();
    else this.player.unMute();
  }

  // ---------------------------------------------------------------- control

  // start (or keep) the room's track; called on every explore room switch.
  // authoredOnly (battle rooms): only rooms with an explicit ROOM_TRACKS
  // entry play — no village-default bleeding into the dungeon; unlisted
  // rooms fall silent until their ambience is authored.
  setRoom(roomId, { authoredOnly = false } = {}) {
    if (authoredOnly && !ROOM_TRACKS[roomId]) {
      if (this.track) this.stop();
      return;
    }
    const id = ROOM_TRACKS[roomId] || ROOM_TRACKS.default;
    this.ensurePlayer().then(() => {
      if (this.track !== id) this.cue(id);
      else if (this.playerReady && this.player.getPlayerState() !== 1) this.player.playVideo();
    });
  }

  stop() {
    this.track = null;
    this.pendingTrack = null;
    if (this.playerReady) this.player.stopVideo();
    this.closeSlider();
  }

  setVolume(pct) {
    this.volume = Math.max(0, Math.min(100, Math.round(pct)));
    localStorage.setItem(LS_VOL, String(this.volume));
    this.applyVolume();
    this.syncUi();
  }

  // ---------------------------------------------------------------- UI

  // Dock the speaker button (+ slide-out volume panel) at the right end of
  // the chat toolbar. Call whenever the toolbar is (re)created.
  attach(toolbar) {
    if (!toolbar || (this.ui && toolbar.contains(this.ui.wrap))) return;
    const wrap = document.createElement('div');
    wrap.className = 'music-ctl';
    wrap.innerHTML = `
      <div class="music-pop">
        <input type="range" min="0" max="100" step="1" aria-label="Music volume" />
        <span class="music-val"></span>
      </div>
      <button type="button" class="music-btn" title="Room music volume"></button>`;
    toolbar.appendChild(wrap);
    const slider = wrap.querySelector('input');
    const btn = wrap.querySelector('.music-btn');
    this.ui = { wrap, slider, btn, val: wrap.querySelector('.music-val') };
    this.syncUi();
    btn.addEventListener('click', () => wrap.classList.toggle('open'));
    slider.addEventListener('input', () => this.setVolume(Number(slider.value)));
    // clicking anywhere else folds the slider away
    document.addEventListener('pointerdown', (e) => {
      if (this.ui && !this.ui.wrap.contains(e.target)) this.closeSlider();
    });
  }

  closeSlider() {
    if (this.ui) this.ui.wrap.classList.remove('open');
  }

  syncUi() {
    if (!this.ui) return;
    this.ui.slider.value = String(this.volume);
    this.ui.val.textContent = `${this.volume}%`;
    // speaker glyph states: muted / quiet / loud (pixel-drawn via CSS)
    this.ui.btn.classList.toggle('muted', this.volume === 0);
    this.ui.btn.classList.toggle('loud', this.volume > 50);
  }
}
