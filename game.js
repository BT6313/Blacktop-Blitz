/* ============================================================
   BLACKTOP BLITZ — game.js
   Full self-contained game: engine + logic + audio + UI
   ============================================================ */

'use strict';

// ─── CONSTANTS ──────────────────────────────────────────────
const C = {
  LANES: 4,
  ROAD_WIDTH_RATIO: 0.88,   // canvas width fraction used for road (capped)
  ROAD_MAX_W: 440,
  BASE_SPEED: 320,           // px/sec
  SPEED_INC: 18,             // px/sec per 5 seconds
  MAX_SPEED: 900,
  CAR_W: 52, CAR_H: 88,
  ENEMY_W: 48, ENEMY_H: 82,
  SEMI_W: 72,  SEMI_H: 148,  // semi truck dimensions (wider + taller)
  MONSTER_W: 68, MONSTER_H: 100, // monster truck
  PLOW_W: 78,  PLOW_H: 160,  // snowplow semi
  COIN_R: 14,
  NITRO_DRAIN: 0.55,         // per second
  NITRO_REGEN: 0.18,
  NITRO_BOOST: 2.0,
  COMBO_TARGET: 5,
  SPAWN_BASE_INTERVAL: 1.1,  // seconds
  SPAWN_MIN_INTERVAL: 0.38,
  LANE_MARK_H: 52,
  LANE_MARK_GAP: 38,
};

// ─── CARS (unlockable) ──────────────────────────────────────
// ability: null = normal car (dies on everything)
//          'crush_cars'  = monster truck (crushes regular cars, dies on semis)
//          'crush_all'   = snowplow semi (crushes cars + semis, dies only on head-on semi)
const CARS = [
  { id: 'red',      name: 'SPEEDSTER',   emoji: '🚗',  cost: 0,     color: '#ff4466', accent: '#ff8099', ability: null },
  { id: 'blue',     name: 'CRUISER',     emoji: '🚙',  cost: 80,    color: '#4488ff', accent: '#88bbff', ability: null },
  { id: 'yellow',   name: 'CLASSIC',     emoji: '🚕',  cost: 150,   color: '#ffcc00', accent: '#ffe066', ability: null },
  { id: 'green',    name: 'ECO',         emoji: '🚘',  cost: 220,   color: '#33dd88', accent: '#88ffcc', ability: null },
  { id: 'police',   name: 'PURSUIT',     emoji: '🚔',  cost: 500,   color: '#6688ff', accent: '#aabbff', ability: null },
  { id: 'fire',     name: 'FIRETRUCK',   emoji: '🚒',  cost: 1000,  color: '#ff3300', accent: '#ff7766', ability: null },
  { id: 'sport',    name: 'RACER',       emoji: '🏎️', cost: 2000,  color: '#cc44ff', accent: '#ee88ff', ability: null },
  { id: 'truck',    name: 'PHANTOM',     emoji: '🚛',  cost: 3500,  color: '#888899', accent: '#aabbcc', ability: null },
  { id: 'taxi',     name: 'TAXI PRO',    emoji: '🛻',  cost: 5000,  color: '#ffaa00', accent: '#ffcc55', ability: null },
  { id: 'monster',  name: 'MONSTER',     emoji: '🚙',  cost: 8000,  color: '#cc6600', accent: '#ff9933', ability: 'crush_cars',
    desc: 'Crushes cars! Dies on semis.' },
  { id: 'snowplow', name: 'SNOWPLOW',    emoji: '🚛',  cost: 10000, color: '#1f7fd6', accent: '#8fe0ff', ability: 'crush_all',
    desc: 'Crushes everything! Head-on semis = death.' },
];

const ENEMY_EMOJIS = ['🚙','🚐','🚑','🚓','🚚','🚌','🚎','🏎️','🚜'];

// ─── PERSISTENT STATE ────────────────────────────────────────
// ─── CRAZYGAMES PORTAL BRIDGE ────────────────────────────────
// Everything here degrades to a no-op when the SDK is absent or the game is
// running off-platform (GitHub Pages, itch.io, a local file). The SDK throws
// on every call when environment is "disabled", so nothing may be called
// without checking `available` first.
const Portal = {
  sdk: null,
  env: 'unknown',          // 'local' | 'crazygames' | 'disabled' | 'unknown'
  _lastAdEndedAt: 0,
  AD_COOLDOWN_MS: 3 * 60 * 1000,   // CrazyGames guidance: ~3 min between midgame ads

  async init() {
    const sdk = window.CrazyGames && window.CrazyGames.SDK;
    if (!sdk) return;              // script blocked, offline, or standalone build
    try {
      // Don't let a hung SDK stop the game from booting.
      await Promise.race([
        sdk.init(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('sdk init timeout')), 5000)),
      ]);
      this.env = sdk.environment || 'disabled';
      if (this.env === 'disabled') return;
      this.sdk = sdk;
    } catch (e) {
      this.sdk = null;
    }
  },

  get available() { return this.sdk !== null; },

  // — Cross-device save storage. Preferred over localStorage on-platform
  //   because CrazyGames syncs it across a signed-in player's devices.
  getItem(key) {
    if (!this.available) return null;
    try { return this.sdk.data.getItem(key); } catch (e) { return null; }
  },
  setItem(key, value) {
    if (!this.available) return false;
    try { this.sdk.data.setItem(key, value); return true; } catch (e) { return false; }
  },

  // — Gameplay signals. CrazyGames measures load time up to gameplayStart,
  //   so it must fire at real gameplay, not on the loading screen.
  gameplayStart() {
    if (!this.available) return;
    try { this.sdk.game.gameplayStart(); } catch (e) {}
  },
  gameplayStop() {
    if (!this.available) return;
    try { this.sdk.game.gameplayStop(); } catch (e) {}
  },

  // CrazyGames' own mute switch. Full implementation requires honouring it,
  // and it must override any in-game audio preference.
  getSettings() {
    if (!this.available) return null;
    try { return this.sdk.game.settings || null; } catch (e) { return null; }
  },
  onSettingsChange(fn) {
    if (!this.available) return;
    try { this.sdk.game.addSettingsChangeListener(fn); } catch (e) {}
  },
  // Signals the site uses to celebrate and to measure time-to-playable.
  happytime() {
    if (!this.available) return;
    try { this.sdk.game.happytime(); } catch (e) {}
  },
  loadingStart() {
    if (!this.available) return;
    try { this.sdk.game.loadingStart(); } catch (e) {}
  },
  loadingStop() {
    if (!this.available) return;
    try { this.sdk.game.loadingStop(); } catch (e) {}
  },

  canRequestAd() {
    if (!this.available) return false;
    return (Date.now() - this._lastAdEndedAt) >= this.AD_COOLDOWN_MS;
  },

  requestAd(type, callbacks) {
    if (!this.available) { callbacks.adError && callbacks.adError('unavailable'); return; }
    const done = (fn) => (arg) => { this._lastAdEndedAt = Date.now(); fn && fn(arg); };
    try {
      this.sdk.ad.requestAd(type, {
        adStarted:  callbacks.adStarted,
        adFinished: done(callbacks.adFinished),
        adError:    done(callbacks.adError),
      });
    } catch (e) {
      callbacks.adError && callbacks.adError(e);
    }
  },
};
window.Portal = Portal;

const SAVE_KEY = 'blacktopBlitz.save.v1';

// Storage shim: localStorage when it works, in-memory when it doesn't
// (private browsing, embedded portal iframes with cookies blocked, etc.)
const Store = {
  _mem: null,
  _ok: null,
  available() {
    if (this._ok !== null) return this._ok;
    try {
      const k = '__bb_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      this._ok = true;
    } catch (e) {
      this._ok = false;
    }
    return this._ok;
  },
  // Read order: CrazyGames (syncs across the player's devices) -> localStorage -> memory
  get() {
    const portal = Portal.getItem(SAVE_KEY);
    if (portal !== null && portal !== undefined) return portal;
    if (this.available()) {
      try {
        const local = window.localStorage.getItem(SAVE_KEY);
        if (local !== null) return local;
      } catch (e) {}
    }
    return this._mem;
  },
  // Write everywhere available: CrazyGames is authoritative on-platform, but a
  // local copy keeps progress if the SDK is unreachable on a later visit.
  set(str) {
    this._mem = str;
    Portal.setItem(SAVE_KEY, str);
    if (this.available()) {
      try { window.localStorage.setItem(SAVE_KEY, str); } catch (e) {}
    }
  },
  // Wipe every tier. Clearing only one leaves the others to resurrect the
  // save on the next read, since get() falls through them in order.
  clear() {
    this._mem = null;
    Portal.setItem(SAVE_KEY, '');
    if (this.available()) {
      try { window.localStorage.removeItem(SAVE_KEY); } catch (e) {}
    }
  },
};

const Save = {
  data: {},
  load() {
    const raw = Store.get();
    try { if (raw) this.data = JSON.parse(raw) || {}; } catch(e) { this.data = {}; }
    if (typeof this.data !== 'object' || this.data === null) this.data = {};
    // Type-check everything: a persisted save that got corrupted would
    // otherwise brick the game on every load instead of clearing on refresh.
    const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0) ? Math.floor(v) : 0;
    const d = this.data;
    d.coins      = num(d.coins);
    d.totalCoins = num(d.totalCoins);
    d.deathCount = num(d.deathCount);
    d.highScores = Array.isArray(d.highScores)
      ? d.highScores.filter(n => typeof n === 'number' && isFinite(n)).slice(0, 10) : [];
    d.ownedCars = Array.isArray(d.ownedCars)
      ? d.ownedCars.filter(id => CARS.some(c => c.id === id)) : [];
    // Starter cars are always owned
    for (const id of ['red','blue','yellow']) {
      if (!d.ownedCars.includes(id)) d.ownedCars.push(id);
    }
    d.triedCars = Array.isArray(d.triedCars)
      ? d.triedCars.filter(id => CARS.some(c => c.id === id)) : [];
    // Never leave activeCar pointing at a car the player doesn't own
    if (!d.ownedCars.includes(d.activeCar)) d.activeCar = 'red';
  },
  save() {
    try { Store.set(JSON.stringify(this.data)); } catch(e) {}
  },
  addScore(score) {
    this.data.highScores.push(score);
    this.data.highScores.sort((a,b) => b - a);
    if (this.data.highScores.length > 10) this.data.highScores.length = 10;
    this.save();
  },
  addCoins(n) {
    this.data.coins += n;
    this.data.totalCoins += n;
    this.save();
  },
  buyCar(carId) {
    const car = CARS.find(c => c.id === carId);
    if (!car || this.data.coins < car.cost) return false;
    this.data.coins -= car.cost;
    this.data.ownedCars.push(carId);
    this.save();
    return true;
  },
  selectCar(carId) {
    this.data.activeCar = carId;
    this.save();
  },
  getBest() { return this.data.highScores[0] || 0; },
};

// ─── ADS ─────────────────────────────────────────────────────
// Midgame ads are served by CrazyGames. Off-platform this is a no-op and the
// callback fires immediately, so the game plays identically standalone.
const AdSystem = {
  _resumePlay: false,

  show(onClose) {
    const finish = () => {
      Audio.setAdMute(false);   // portal mute, if set, survives this
      if (this._resumePlay) { Game.state = 'playing'; this._resumePlay = false; }
      onClose && onClose();
    };
    // canRequestAd() covers both "no SDK" and the ~3 min cooldown; requesting
    // inside the cooldown just earns an adCooldown error.
    if (!Portal.canRequestAd()) { finish(); return; }
    Portal.requestAd('midgame', {
      // CrazyGames requires the game to be muted and paused for the ad's duration.
      adStarted: () => {
        Audio.setAdMute(true);
        // The game must also be paused for the ad's duration. Halt the
        // simulation directly rather than via Game.pause(), which would put
        // the pause menu on screen underneath the ad. dt is clamped in
        // _loop(), so resuming can't produce a time spike.
        this._resumePlay = (Game.state === 'playing');
        if (this._resumePlay) Game.state = 'paused';
      },
      adFinished: finish,
      // adblock / unfilled / adCooldown / ads-off-during-Basic-Launch all land
      // here. None of them should cost the player their game-over screen.
      adError: finish,
    });
  },
};
window.AdSystem = AdSystem;

// ─── AUDIO ENGINE ────────────────────────────────────────────
const Audio = {
  ctx: null,
  bgm: null,
  // `muted` is derived, never set directly: the portal's mute switch must
  // take priority over anything the game itself does (e.g. muting for an ad),
  // so both sources are tracked separately and combined.
  muted: false,
  _adMuted: false,
  _portalMuted: false,
  _applyMute() {
    this.muted = this._portalMuted || this._adMuted;
    if (this.muted) this.stopBGM();
  },
  setAdMute(on)     { this._adMuted = on;     this._applyMute(); },
  setPortalMute(on) { this._portalMuted = on; this._applyMute(); },
  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) {}
  },
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    this.startBGM();
  },
  tone(freq, dur = 0.08, type = 'square', vol = 0.18, delay = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t = this.ctx.currentTime + delay;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch(e) {}
  },
  playCoin() {
    this.tone(880, 0.06, 'sine', 0.2);
    this.tone(1320, 0.06, 'sine', 0.2, 0.07);
  },
  playCombo() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.09, 'sine', 0.22, i * 0.07));
  },
  playCrash() {
    if (!this.ctx || this.muted) return;
    try {
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.3, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.3));
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
      src.connect(gain).connect(this.ctx.destination);
      src.start();
    } catch(e) {}
  },
  playNitro() {
    this.tone(180, 0.15, 'sawtooth', 0.12);
    this.tone(240, 0.15, 'sawtooth', 0.1, 0.05);
  },
  // — per-vehicle engine tick (called once on lane switch / periodic ping)
  playEngineBlip(carId) {
    if (!this.ctx || this.muted) return;
    const profiles = {
      // Normal small cars — light, high-pitched beep
      red:     { freq: 320, dur: 0.06, type: 'square',   vol: 0.10 },
      blue:    { freq: 300, dur: 0.06, type: 'square',   vol: 0.10 },
      yellow:  { freq: 310, dur: 0.06, type: 'square',   vol: 0.10 },
      green:   { freq: 340, dur: 0.06, type: 'sine',     vol: 0.10 },
      // Patrol / fire — slightly lower, authoritative
      police:  { freq: 200, dur: 0.08, type: 'sawtooth', vol: 0.12 },
      fire:    { freq: 180, dur: 0.10, type: 'sawtooth', vol: 0.14 },
      // Racer — high-rev whine
      sport:   { freq: 520, dur: 0.07, type: 'sawtooth', vol: 0.11 },
      // Semi — low diesel rumble
      truck:   { freq:  90, dur: 0.14, type: 'sawtooth', vol: 0.18 },
      taxi:    { freq: 290, dur: 0.06, type: 'square',   vol: 0.10 },
      // Monster truck — beefy low growl
      monster: { freq:  70, dur: 0.18, type: 'sawtooth', vol: 0.22 },
      // Snowplow — heavy diesel + mechanical clank feel
      snowplow:{ freq:  60, dur: 0.20, type: 'sawtooth', vol: 0.24 },
    };
    const p = profiles[carId] || profiles.red;
    this.tone(p.freq, p.dur, p.type, p.vol);
    // Harmonics for heavier vehicles
    if (carId === 'monster' || carId === 'snowplow' || carId === 'truck') {
      this.tone(p.freq * 1.5, p.dur * 0.6, p.type, p.vol * 0.4, 0.03);
    }
  },
  // — Monster Truck crushes a regular car: satisfying crunch
  playCrunch() {
    if (!this.ctx || this.muted) return;
    try {
      const sr = this.ctx.sampleRate;
      // Short burst of noise filtered to low-mid crunch
      const buf = this.ctx.createBuffer(1, sr * 0.25, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.4));
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 280;
      filt.Q.value = 0.8;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
      src.connect(filt).connect(gain).connect(this.ctx.destination);
      src.start();
      // Low thud underneath
      this.tone(55, 0.18, 'sine', 0.35);
    } catch(e) {}
  },
  // — Snowplow hits a semi: heavy metal-on-metal crash
  playSemiCrash() {
    if (!this.ctx || this.muted) return;
    try {
      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, sr * 0.4, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        // Two-stage decay: sharp impact then metal ring
        const impact = Math.exp(-i / (sr * 0.04));
        const ring   = Math.exp(-i / (sr * 0.3)) * Math.sin(2 * Math.PI * 180 * i / sr);
        d[i] = (Math.random() * 2 - 1) * impact * 0.9 + ring * 0.4;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 1800;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.65, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
      src.connect(filt).connect(gain).connect(this.ctx.destination);
      src.start();
      // Deep bass thud
      this.tone(45, 0.22, 'sine', 0.4);
      this.tone(90, 0.12, 'sawtooth', 0.2, 0.05);
    } catch(e) {}
  },
  startBGM() {
    if (!this.ctx || this.bgm || this.muted) return;
    // Procedural drum + bass loop
    this._scheduleBGM();
  },
  _bgmLoop: null,
  _bgmStep: 0,
  _bgmPattern: [1,0,0,1,0,1,0,0,  1,0,0,1,0,1,1,0],
  _scheduleBGM() {
    if (this.muted || !this.ctx) return;
    const bpm = 128;
    const step = 60 / bpm / 2;
    const pat = this._bgmPattern;
    let t = this.ctx.currentTime;
    for (let i = 0; i < pat.length; i++) {
      if (pat[i]) this._scheduleKick(t + i * step);
      if (i % 4 === 2) this._scheduleHat(t + i * step);
      this._scheduleBass(t + i * step, i);
    }
    const totalDur = pat.length * step;
    this._bgmLoop = setTimeout(() => this._scheduleBGM(), (totalDur - 0.3) * 1000);
    this.bgm = true;
  },
  _scheduleKick(t) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.2);
    } catch(e) {}
  },
  _scheduleHat(t) {
    if (!this.ctx) return;
    try {
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'highpass'; filt.frequency.value = 7000;
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(filt).connect(g).connect(this.ctx.destination);
      src.start(t); src.stop(t + 0.06);
    } catch(e) {}
  },
  _bassNotes: [55, 55, 82, 55, 65, 55, 73, 55],
  _bassIdx: 0,
  _scheduleBass(t, i) {
    if (!this.ctx) return;
    if (i % 2 !== 0) return;
    try {
      const freq = this._bassNotes[(this._bassIdx++) % this._bassNotes.length];
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 400;
      g.gain.setValueAtTime(0.13, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(filt).connect(g).connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.25);
    } catch(e) {}
  },
  stopBGM() {
    if (this._bgmLoop) clearTimeout(this._bgmLoop);
    this.bgm = null;
    this._bgmLoop = null;
  },
};

// ─── CANVAS SETUP ────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let W = 0, H = 0;    // canvas logical size
let DPR = 1;
let roadLeft = 0, roadW = 0, laneW = 0;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  roadW    = Math.min(W * C.ROAD_WIDTH_RATIO, C.ROAD_MAX_W);
  roadLeft = (W - roadW) / 2;
  laneW    = roadW / C.LANES;
}
window.addEventListener('resize', resize);
resize();

// ─── INPUT ───────────────────────────────────────────────────
const Input = {
  left: false, right: false, nitro: false,
  leftDown: false, rightDown: false,
  _touchLeft: false, _touchRight: false,
  init() {
    document.addEventListener('keydown', e => {
      // e.code is physical-position based, so arrows and A/D land in the same
      // place on AZERTY as on QWERTY.
      if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { this.leftDown = true;  this.left = true; }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.rightDown = true; this.right = true; }
      if (e.code === 'Space') { e.preventDefault(); this.nitro = true; }
      // P is the documented pause key: Escape also exits fullscreen on the
      // portals, so it can't be the only way to pause. Escape still pauses,
      // since dropping out of fullscreen is a reasonable moment to stop.
      if ((e.code === 'KeyP' || e.code === 'Escape') && Game.state === 'playing') Game.pause();
    });
    document.addEventListener('keyup', e => {
      if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { this.leftDown = false; this.left = false; }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.rightDown = false; this.right = false; }
      if (e.code === 'Space') this.nitro = false;
    });
    // Touch zones
    const tl = document.getElementById('touch-left');
    const tr = document.getElementById('touch-right');
    const setTouches = () => {
      this._touchLeft  = false;
      this._touchRight = false;
      // Count active touches on each side
      for (const t of Array.from(window._activeTouches || [])) {
        if (t.clientX < W / 2) this._touchLeft = true;
        else this._touchRight = true;
      }
      this.left  = this._touchLeft  && !this._touchRight;
      this.right = this._touchRight && !this._touchLeft;
      this.nitro = this._touchLeft  &&  this._touchRight;
    };
    window._activeTouches = new Set();
    // Only swallow touch defaults during actual gameplay. Calling
    // preventDefault() on the first touchmove tells the browser not to
    // synthesise the compatibility click event, so doing it unconditionally
    // killed every menu button on touch devices (any tap with the slightest
    // finger movement produced no click) and blocked scrolling in the garage.
    const inPlay = () => Game.state === 'playing';
    const addTouch = e => {
      if (inPlay()) e.preventDefault();
      for (const t of e.changedTouches) window._activeTouches.add(t.identifier + '|' + t.clientX);
      // Re-map by identifier
      window._activeTouches = new Set(Array.from(e.touches).map(t => ({ clientX: t.clientX })));
      setTouches();
    };
    const removeTouch = e => {
      if (inPlay()) e.preventDefault();
      window._activeTouches = new Set(Array.from(e.touches).map(t => ({ clientX: t.clientX })));
      setTouches();
    };
    tl.addEventListener('touchstart', addTouch, { passive: false });
    tr.addEventListener('touchstart', addTouch, { passive: false });
    window.addEventListener('touchmove', addTouch, { passive: false });
    window.addEventListener('touchend', removeTouch, { passive: false });
    window.addEventListener('touchcancel', removeTouch, { passive: false });
  },
  enableTouchZones(on) {
    const s = on ? 'auto' : 'none';
    document.getElementById('touch-left').style.pointerEvents  = s;
    document.getElementById('touch-right').style.pointerEvents = s;
  },
  reset() {
    this.left = this.right = this.nitro = false;
    window._activeTouches = new Set();
  },
};

// ─── UTILITIES ───────────────────────────────────────────────
const rnd = (min, max) => Math.random() * (max - min) + min;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

function getLaneCenterX(lane) {
  // lane: 0..3
  return roadLeft + laneW * lane + laneW / 2;
}

// ─── PARTICLES ───────────────────────────────────────────────
const Particles = {
  pool: [],
  MAX: 120,
  init() { this.pool = Array.from({length: this.MAX}, () => ({ active: false })); },
  emit(x, y, count, cfg) {
    let n = 0;
    for (const p of this.pool) {
      if (!p.active && n < count) {
        Object.assign(p, {
          active: true, x, y,
          vx: (Math.random() - 0.5) * cfg.spread,
          vy: -Math.random() * cfg.speed - 30,
          life: cfg.life + Math.random() * (cfg.lifeVar || 0.1),
          maxLife: cfg.life,
          color: cfg.color,
          size: cfg.size + Math.random() * (cfg.sizeVar || 4),
        });
        n++;
      }
    }
  },
  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }
  },
  draw() {
    for (const p of this.pool) {
      if (!p.active) continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = p.size * a;
      ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
    }
    ctx.globalAlpha = 1;
  },
};

// ─── FLOATING TEXTS ──────────────────────────────────────────
const FloatTexts = {
  pool: [],
  add(x, y, text, color = '#ffd700', size = 22) {
    this.pool.push({ x, y, text, color, size, life: 1.1, maxLife: 1.1, vy: -60 });
  },
  update(dt) {
    this.pool = this.pool.filter(t => { t.life -= dt; t.y += t.vy * dt; return t.life > 0; });
  },
  draw() {
    for (const t of this.pool) {
      const a = clamp(t.life / t.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `700 ${t.size}px "Azeret Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 12;
      ctx.fillText(t.text, t.x, t.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  },
};

// ─── ROAD SCROLL STATE ───────────────────────────────────────
let roadScrollY = 0;
let sideScrollY = 0;

// ─── PLAYER ──────────────────────────────────────────────────
const Player = {
  lane: 1,
  targetLane: 1,
  x: 0, y: 0,
  drawX: 0,
  nitroFuel: 1.0,
  isNitro: false,
  alive: true,
  coinStreak: 0,
  invincible: 0,  // seconds of invincibility after spawn
  engineTrail: [],
  laneCooldown: 0,     // time remaining before next lane switch allowed
  _prevLeft: false, _prevRight: false,
  init() {
    this.lane = 1;
    this.targetLane = 1;
    this.y = H * 0.72;
    this.x = getLaneCenterX(this.lane);
    this.drawX = this.x;
    this.nitroFuel = 1.0;
    this.isNitro = false;
    this.alive = true;
    this.coinStreak = 0;
    this.invincible = 1.5;
    this.engineTrail = [];
    this.laneCooldown = 0;
    this._prevLeft = false;
    this._prevRight = false;
  },
  update(dt, speed) {
    if (this.invincible > 0) this.invincible -= dt;
    if (this.laneCooldown > 0) this.laneCooldown -= dt;
    // Lane switch cooldown: starts at 0.30s (25% slower than keyboard's 0.0s)
    // and scales down toward 0.10s as speed goes from BASE to MAX
    const speedFrac = clamp((speed - C.BASE_SPEED) / (C.MAX_SPEED - C.BASE_SPEED), 0, 1);
    const swipeCooldown = lerp(0.30, 0.10, speedFrac);
    // Detect fresh press (edge-triggered) for keyboard — instant
    const leftPressed  = Input.left  && !this._prevLeft;
    const rightPressed = Input.right && !this._prevRight;
    // Touch input uses the cooldown; keyboard fires on fresh press only
    const touchLeft  = Input._touchLeft  && !Input._touchRight;
    const touchRight = Input._touchRight && !Input._touchLeft;
    const canSwitch = this.laneCooldown <= 0;
    if (leftPressed && this.targetLane > 0) {
      this.targetLane = Math.max(0, this.targetLane - 1);
      if (Input._touchLeft) this.laneCooldown = swipeCooldown;
      Audio.playEngineBlip(Game.activeCar ? Game.activeCar.id : 'red');
    } else if (rightPressed && this.targetLane < C.LANES - 1) {
      this.targetLane = Math.min(C.LANES - 1, this.targetLane + 1);
      if (Input._touchRight) this.laneCooldown = swipeCooldown;
      Audio.playEngineBlip(Game.activeCar ? Game.activeCar.id : 'red');
    } else if (canSwitch) {
      // Touch hold: repeat switch while held, gated by cooldown
      if (touchLeft && !leftPressed && this.targetLane > 0) {
        this.targetLane = Math.max(0, this.targetLane - 1);
        this.laneCooldown = swipeCooldown;
        Audio.playEngineBlip(Game.activeCar ? Game.activeCar.id : 'red');
      } else if (touchRight && !rightPressed && this.targetLane < C.LANES - 1) {
        this.targetLane = Math.min(C.LANES - 1, this.targetLane + 1);
        this.laneCooldown = swipeCooldown;
        Audio.playEngineBlip(Game.activeCar ? Game.activeCar.id : 'red');
      }
    }
    this._prevLeft  = Input.left;
    this._prevRight = Input.right;
    // Instant lane target with smooth visual interpolation
    this.lane = this.targetLane;
    this.x = getLaneCenterX(this.lane);
    this.drawX = lerp(this.drawX, this.x, 12 * dt);
    // Nitro
    if (Input.nitro && this.nitroFuel > 0) {
      this.isNitro = true;
      this.nitroFuel = clamp(this.nitroFuel - C.NITRO_DRAIN * dt, 0, 1);
    } else {
      this.isNitro = false;
      this.nitroFuel = clamp(this.nitroFuel + C.NITRO_REGEN * dt, 0, 1);
    }
    // Engine trail
    const _trailH = Game.activeCar ? (Game.activeCar.id === 'monster' ? C.MONSTER_H : Game.activeCar.id === 'snowplow' ? C.PLOW_H : C.CAR_H) : C.CAR_H;
    this.engineTrail.unshift({ x: this.drawX, y: this.y + _trailH * 0.45, life: 1 });
    if (this.engineTrail.length > 12) this.engineTrail.pop();
    for (const p of this.engineTrail) p.life -= dt * 5;
    this.engineTrail = this.engineTrail.filter(p => p.life > 0);
  },
  // Returns hitbox in world coords, scaled to the active vehicle
  // Coin pickup uses the vehicle's full visual footprint, not getHitbox().
  // getHitbox is deliberately shrunk so a near miss doesn't kill you - that
  // forgiveness is right for collisions and wrong for pickups, where the coin
  // should register anywhere it visibly touches the vehicle.
  getPickupBox(carData) {
    const id = carData ? carData.id : 'red';
    let vw, vh;
    if (id === 'monster')       { vw = C.MONSTER_W; vh = C.MONSTER_H; }
    else if (id === 'snowplow') { vw = C.PLOW_W;    vh = C.PLOW_H; }
    else                        { vw = C.CAR_W;     vh = C.CAR_H; }
    return { x: this.drawX - vw/2, y: this.y - vh/2, w: vw, h: vh };
  },

  getHitbox(carData) {
    const id = carData ? carData.id : 'red';
    let vw, vh, px, py;
    if (id === 'monster') {
      vw = C.MONSTER_W; vh = C.MONSTER_H;
      px = vw * 0.08; py = vh * 0.10;
    } else if (id === 'snowplow') {
      vw = C.PLOW_W; vh = C.PLOW_H;
      px = vw * 0.06; py = vh * 0.06;
    } else {
      vw = C.CAR_W; vh = C.CAR_H;
      px = vw * 0.38; py = vh * 0.20;
    }
    return { x: this.drawX - vw/2 + px, y: this.y - vh/2 + py,
             w: vw - px*2, h: vh - py*2 };
  },
  draw(carData) {
    const id = carData ? carData.id : 'red';
    const cx = this.drawX, cy = this.y;
    // Pick dims for trail origin
    const trailH = id === 'snowplow' ? C.PLOW_H : id === 'monster' ? C.MONSTER_H : C.CAR_H;
    // Engine trail
    for (let i = 0; i < this.engineTrail.length; i++) {
      const p = this.engineTrail[i];
      ctx.globalAlpha = p.life * 0.6;
      const sz = (6 + i * 3) * p.life;
      ctx.beginPath();
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz);
      if (this.isNitro) {
        g.addColorStop(0, '#fff');
        g.addColorStop(0.4, id === 'snowplow' ? '#88ddff' : '#00ffc8');
        g.addColorStop(1, 'transparent');
      } else {
        g.addColorStop(0, '#ffaa22');
        g.addColorStop(1, 'transparent');
      }
      ctx.fillStyle = g;
      ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const blink = this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.4;

    // Dispatch to correct draw function
    if (id === 'monster') {
      drawMonsterTruck(ctx, cx, cy, carData.color, carData.accent);
    } else if (id === 'snowplow') {
      // Snow spray when moving
      if (Math.random() < 0.4) {
        Particles.emit(cx - C.PLOW_W*0.6, cy + C.PLOW_H*0.48, 2,
          { spread: 60, speed: 40, life: 0.4, lifeVar: 0.2, color: '#cceeff', size: 5, sizeVar: 4 });
        Particles.emit(cx + C.PLOW_W*0.6, cy + C.PLOW_H*0.48, 2,
          { spread: 60, speed: 40, life: 0.4, lifeVar: 0.2, color: '#cceeff', size: 5, sizeVar: 4 });
      }
      drawSnowplowSemi(ctx, cx, cy, carData.color, carData.accent);
    } else {
      const w = C.CAR_W, h = C.CAR_H;
      ctx.globalAlpha = blink ? 0.1 : 0.3;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(cx, cy + h*0.42, w*0.4, h*0.12, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = blink ? 0.4 : 1;
      drawPixelCar(ctx, cx, cy, w, h, carData.color, carData.accent);
    }
    ctx.globalAlpha = 1;
  },
};

// ─── DRAW PIXEL CAR ──────────────────────────────────────────
function drawPixelCar(ctx, cx, cy, w, h, color, accent) {
  const x = cx - w/2, y = cy - h/2;
  ctx.save();
  // Main body
  const bodyGrad = ctx.createLinearGradient(x, y, x+w, y+h);
  bodyGrad.addColorStop(0, lighten(color, 40));
  bodyGrad.addColorStop(0.5, color);
  bodyGrad.addColorStop(1, darken(color, 30));
  roundRect(ctx, x + w*0.1, y + h*0.15, w*0.8, h*0.7, 10);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  // Roof
  roundRect(ctx, x + w*0.18, y + h*0.22, w*0.64, h*0.35, 8);
  ctx.fillStyle = darken(color, 15);
  ctx.fill();
  // Windshield
  roundRect(ctx, x + w*0.22, y + h*0.25, w*0.56, h*0.2, 5);
  ctx.fillStyle = 'rgba(160,220,255,0.55)';
  ctx.fill();
  // Windshield glare
  ctx.beginPath();
  ctx.moveTo(x + w*0.26, y + h*0.27);
  ctx.lineTo(x + w*0.42, y + h*0.27);
  ctx.lineTo(x + w*0.32, y + h*0.38);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();
  // Hood
  roundRect(ctx, x + w*0.12, y + h*0.55, w*0.76, h*0.25, 6);
  ctx.fillStyle = lighten(color, 10);
  ctx.fill();
  // Headlights
  for (const lx of [x + w*0.16, x + w*0.62]) {
    roundRect(ctx, lx, y + h*0.77, w*0.22, h*0.07, 4);
    ctx.fillStyle = '#fff8cc';
    ctx.fill();
    ctx.shadowColor = '#ffee88';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  // Tail lights
  for (const lx of [x + w*0.13, x + w*0.63]) {
    roundRect(ctx, lx, y + h*0.14, w*0.24, h*0.06, 4);
    ctx.fillStyle = '#ff3344';
    ctx.fill();
    ctx.shadowColor = '#ff3344';
    ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0;
  }
  // Wheels
  for (const [wx, wy] of [
    [x + w*0.04, y + h*0.25],
    [x + w*0.76, y + h*0.25],
    [x + w*0.04, y + h*0.62],
    [x + w*0.76, y + h*0.62],
  ]) {
    roundRect(ctx, wx, wy, w*0.2, h*0.15, 4);
    ctx.fillStyle = '#222';
    ctx.fill();
    // Hubcap
    ctx.beginPath();
    ctx.arc(wx + w*0.1, wy + h*0.075, w*0.06, 0, Math.PI*2);
    ctx.fillStyle = accent;
    ctx.fill();
  }
  // Stripe accent
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.35;
  roundRect(ctx, x + w*0.15, y + h*0.52, w*0.7, h*0.04, 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── DRAW ENEMY CAR ──────────────────────────────────────────
function drawEnemyCar(ctx, cx, cy, color, accent) {
  const w = C.ENEMY_W, h = C.ENEMY_H;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, -1);
  ctx.translate(-cx, -cy);
  drawPixelCar(ctx, cx, cy, w, h, color, accent);
  ctx.restore();
}

// ─── DRAW SEMI TRUCK ─────────────────────────────────────────
function drawSemiTruck(ctx, cx, cy, color, accent) {
  const tw = C.SEMI_W, th = C.SEMI_H;
  const x = cx - tw / 2, y = cy - th / 2;
  ctx.save();
  // Shadow
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, cy + th * 0.45, tw * 0.42, th * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Trailer body (bottom portion — cab faces up since it's coming at player)
  const trailerTop = y + th * 0.28;
  const trailerH   = th * 0.62;
  const trailerGrad = ctx.createLinearGradient(x, trailerTop, x + tw, trailerTop);
  trailerGrad.addColorStop(0, darken(color, 20));
  trailerGrad.addColorStop(0.5, color);
  trailerGrad.addColorStop(1, darken(color, 20));
  roundRect(ctx, x + tw * 0.06, trailerTop, tw * 0.88, trailerH, 5);
  ctx.fillStyle = trailerGrad;
  ctx.fill();
  // Trailer panel lines
  ctx.strokeStyle = darken(color, 35);
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    const lx = x + tw * 0.06 + (tw * 0.88 / 4) * i;
    ctx.beginPath();
    ctx.moveTo(lx, trailerTop + 4);
    ctx.lineTo(lx, trailerTop + trailerH - 4);
    ctx.stroke();
  }
  // Trailer horizontal stripe
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.45;
  roundRect(ctx, x + tw * 0.06, trailerTop + trailerH * 0.42, tw * 0.88, th * 0.06, 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Cab (top portion)
  const cabH = th * 0.30;
  const cabGrad = ctx.createLinearGradient(x, y, x + tw, y + cabH);
  cabGrad.addColorStop(0, lighten(color, 30));
  cabGrad.addColorStop(1, color);
  roundRect(ctx, x + tw * 0.08, y, tw * 0.84, cabH, 7);
  ctx.fillStyle = cabGrad;
  ctx.fill();
  // Windshield
  roundRect(ctx, x + tw * 0.18, y + cabH * 0.15, tw * 0.64, cabH * 0.48, 5);
  ctx.fillStyle = 'rgba(140, 210, 255, 0.55)';
  ctx.fill();
  // Windshield glare
  ctx.beginPath();
  ctx.moveTo(x + tw * 0.22, y + cabH * 0.18);
  ctx.lineTo(x + tw * 0.40, y + cabH * 0.18);
  ctx.lineTo(x + tw * 0.30, y + cabH * 0.52);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();
  // Headlights (top of cab, facing player)
  for (const lx of [x + tw * 0.12, x + tw * 0.65]) {
    roundRect(ctx, lx, y + cabH * 0.72, tw * 0.22, cabH * 0.2, 3);
    ctx.fillStyle = '#fff8cc';
    ctx.fill();
    ctx.shadowColor = '#ffee88'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
  }
  // Exhaust pipes
  for (const ex of [x + tw * 0.04, x + tw * 0.88]) {
    ctx.fillStyle = '#555';
    ctx.fillRect(ex, y + th * 0.04, tw * 0.06, th * 0.22);
    // Smoke puff
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#aaa';
    ctx.beginPath();
    ctx.arc(ex + tw * 0.03, y, tw * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Big wheels
  const wheelW = tw * 0.18, wheelH = th * 0.12;
  for (const [wx, wy] of [
    [x, y + cabH * 0.4],
    [x + tw - wheelW, y + cabH * 0.4],
    [x, trailerTop + trailerH * 0.28],
    [x + tw - wheelW, trailerTop + trailerH * 0.28],
    [x, trailerTop + trailerH * 0.68],
    [x + tw - wheelW, trailerTop + trailerH * 0.68],
  ]) {
    roundRect(ctx, wx, wy, wheelW, wheelH, 3);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(wx + wheelW / 2, wy + wheelH / 2, wheelW * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  }
  ctx.restore();
}

// ─── DRAW MONSTER TRUCK ───────────────────────────────────────
// Used for the player car when 'monster' is selected
function drawMonsterTruck(ctx, cx, cy, color, accent) {
  const w = C.MONSTER_W, h = C.MONSTER_H;
  const x = cx - w/2, y = cy - h/2;
  ctx.save();
  // Shadow
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, cy + h*0.45, w*0.46, h*0.09, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Massive wheels (oversized, protruding)
  const ww = w*0.26, wh = h*0.22;
  const wheelPositions = [
    [x - ww*0.35, y + h*0.10],  // front-left
    [x + w - ww*0.65, y + h*0.10], // front-right
    [x - ww*0.35, y + h*0.62],  // rear-left
    [x + w - ww*0.65, y + h*0.62], // rear-right
  ];
  for (const [wx, wy] of wheelPositions) {
    // Tire
    roundRect(ctx, wx, wy, ww, wh, 6);
    ctx.fillStyle = '#111';
    ctx.fill();
    // Tread lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    for (let ti = 1; ti < 4; ti++) {
      ctx.beginPath();
      ctx.moveTo(wx + (ww/4)*ti, wy + 2);
      ctx.lineTo(wx + (ww/4)*ti, wy + wh - 2);
      ctx.stroke();
    }
    // Hubcap
    ctx.beginPath();
    ctx.arc(wx + ww/2, wy + wh/2, ww*0.28, 0, Math.PI*2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(wx + ww/2, wy + wh/2, ww*0.12, 0, Math.PI*2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  // Body (tall, boxy, sits high)
  const bodyGrad = ctx.createLinearGradient(x, y, x+w, y+h);
  bodyGrad.addColorStop(0, lighten(color, 40));
  bodyGrad.addColorStop(0.5, color);
  bodyGrad.addColorStop(1, darken(color, 25));
  roundRect(ctx, x + w*0.04, y + h*0.08, w*0.92, h*0.78, 10);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  // Cab roof
  roundRect(ctx, x + w*0.12, y + h*0.10, w*0.76, h*0.38, 8);
  ctx.fillStyle = darken(color, 12);
  ctx.fill();
  // Windshield
  roundRect(ctx, x + w*0.18, y + h*0.13, w*0.64, h*0.22, 5);
  ctx.fillStyle = 'rgba(150,220,255,0.55)';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.moveTo(x + w*0.22, y + h*0.15);
  ctx.lineTo(x + w*0.38, y + h*0.15);
  ctx.lineTo(x + w*0.28, y + h*0.30);
  ctx.closePath();
  ctx.fill();
  // Headlights (big round)
  for (const lx of [x + w*0.13, x + w*0.63]) {
    ctx.beginPath();
    ctx.arc(lx + w*0.1, y + h*0.80, w*0.10, 0, Math.PI*2);
    ctx.fillStyle = '#fff8cc';
    ctx.fill();
    ctx.shadowColor = '#ffee44'; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
  }
  // Grille
  ctx.strokeStyle = darken(color, 40);
  ctx.lineWidth = 2;
  for (let gi = 0; gi < 4; gi++) {
    ctx.beginPath();
    ctx.moveTo(x + w*0.22, y + h*0.72 + gi*5);
    ctx.lineTo(x + w*0.78, y + h*0.72 + gi*5);
    ctx.stroke();
  }
  // Exhaust smoke stack
  ctx.fillStyle = '#444';
  ctx.fillRect(x + w*0.72, y + h*0.12, w*0.07, h*0.30);
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#aaa';
  ctx.beginPath();
  ctx.arc(x + w*0.755, y + h*0.08, w*0.08, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Roll bar
  ctx.strokeStyle = darken(color, 30);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + w*0.15, y + h*0.12);
  ctx.lineTo(x + w*0.15, y + h*0.50);
  ctx.lineTo(x + w*0.85, y + h*0.50);
  ctx.lineTo(x + w*0.85, y + h*0.12);
  ctx.stroke();
  ctx.restore();
}

// ─── DRAW SNOWPLOW SEMI ─────────────────────────────────────
// Used for the player car when 'snowplow' is selected.
// The blade is at the TOP (forward-facing — enemies approach from above)
function drawSnowplowSemi(ctx, cx, cy, color, accent) {
  const w = C.PLOW_W, h = C.PLOW_H;
  const x = cx - w/2, y = cy - h/2;
  ctx.save();
  // Shadow
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, cy + h*0.44, w*0.42, h*0.07, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Trailer
  const trailerTop = y + h*0.30;
  const trailerH   = h*0.58;
  const tGrad = ctx.createLinearGradient(x, trailerTop, x+w, trailerTop);
  tGrad.addColorStop(0, darken(color, 22));
  tGrad.addColorStop(0.5, color);
  tGrad.addColorStop(1, darken(color, 22));
  roundRect(ctx, x + w*0.06, trailerTop, w*0.88, trailerH, 5);
  ctx.fillStyle = tGrad;
  ctx.fill();
  // Trailer panel lines
  ctx.strokeStyle = darken(color, 38);
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    const lx = x + w*0.06 + (w*0.88/4)*i;
    ctx.beginPath(); ctx.moveTo(lx, trailerTop+4); ctx.lineTo(lx, trailerTop+trailerH-4); ctx.stroke();
  }
  // Blue/white hazard stripe on trailer
  ctx.globalAlpha = 0.55;
  const stripeH = h*0.05;
  for (let si = 0; si < 5; si++) {
    ctx.fillStyle = si % 2 === 0 ? '#fff' : accent;
    ctx.fillRect(x + w*0.06 + (w*0.88/5)*si, trailerTop + trailerH*0.44,
                 w*0.88/5, stripeH);
  }
  ctx.globalAlpha = 1;
  // Cab
  const cabH = h*0.28;
  const cGrad = ctx.createLinearGradient(x, y, x+w, y+cabH);
  cGrad.addColorStop(0, lighten(color, 32));
  cGrad.addColorStop(1, color);
  roundRect(ctx, x + w*0.08, y, w*0.84, cabH, 7);
  ctx.fillStyle = cGrad;
  ctx.fill();
  // Windshield
  roundRect(ctx, x + w*0.18, y + cabH*0.14, w*0.64, cabH*0.48, 5);
  ctx.fillStyle = 'rgba(140,210,255,0.55)';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(x + w*0.22, y + cabH*0.17);
  ctx.lineTo(x + w*0.40, y + cabH*0.17);
  ctx.lineTo(x + w*0.30, y + cabH*0.52);
  ctx.closePath(); ctx.fill();
  // Headlights
  for (const lx of [x + w*0.12, x + w*0.65]) {
    roundRect(ctx, lx, y + cabH*0.70, w*0.22, cabH*0.22, 3);
    ctx.fillStyle = '#fff8cc'; ctx.fill();
    ctx.shadowColor = '#ffee88'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
  }
  // Exhaust
  for (const ex of [x + w*0.04, x + w*0.88]) {
    ctx.fillStyle = '#555';
    ctx.fillRect(ex, y + h*0.04, w*0.06, h*0.20);
  }
  // Wheels
  const ww2 = w*0.17, wh2 = h*0.11;
  for (const [wx, wy] of [
    [x, y + cabH*0.38], [x + w - ww2, y + cabH*0.38],
    [x, trailerTop + trailerH*0.26], [x + w - ww2, trailerTop + trailerH*0.26],
    [x, trailerTop + trailerH*0.65], [x + w - ww2, trailerTop + trailerH*0.65],
  ]) {
    roundRect(ctx, wx, wy, ww2, wh2, 3);
    ctx.fillStyle = '#1a1a1a'; ctx.fill();
    ctx.beginPath();
    ctx.arc(wx + ww2/2, wy + wh2/2, ww2*0.28, 0, Math.PI*2);
    ctx.fillStyle = accent; ctx.fill();
  }
  // ❄️ SNOWPLOW BLADE (at top — leading edge faces enemies coming from above)
  const bladeH = h*0.10;
  const bladeY = y - bladeH;   // sits above the cab
  // Blade main body — wedge pointing upward (tip at top-center)
  ctx.fillStyle = '#aaccdd';
  ctx.beginPath();
  ctx.moveTo(x - w*0.08, bladeY + bladeH);         // left bottom
  ctx.lineTo(x + w/2,   bladeY);                    // center tip (top)
  ctx.lineTo(x + w*1.08, bladeY + bladeH);          // right bottom
  ctx.closePath();
  ctx.fill();
  // Blade highlight
  ctx.strokeStyle = '#ddeeff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - w*0.08, bladeY + bladeH);
  ctx.lineTo(x + w/2, bladeY);
  ctx.lineTo(x + w*1.08, bladeY + bladeH);
  ctx.stroke();
  // Blade mounting arms (connect blade bottom to cab top)
  ctx.fillStyle = '#556677';
  ctx.fillRect(cx - w*0.22, bladeY + bladeH, w*0.10, h*0.04);
  ctx.fillRect(cx + w*0.12, bladeY + bladeH, w*0.10, h*0.04);
  // Snow spray particles effect drawn per-frame in particle system (triggered externally)
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}

function lighten(hex, amt) { return adjustColor(hex, amt); }
function darken(hex, amt)  { return adjustColor(hex, -amt); }
function adjustColor(hex, amt) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = clamp(((n>>16)&0xff)+amt, 0, 255);
  const g = clamp(((n>>8)&0xff)+amt, 0, 255);
  const b = clamp((n&0xff)+amt, 0, 255);
  return '#' + ((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1);
}

// ─── ENEMIES ─────────────────────────────────────────────────
const Enemies = {
  list: [],
  spawnTimer: 0,
  spawnInterval: C.SPAWN_BASE_INTERVAL,
  colors: [
    { color: '#3366ff', accent: '#88aaff' },
    { color: '#888899', accent: '#aabbcc' },
    { color: '#226622', accent: '#44aa44' },
    { color: '#992222', accent: '#cc5555' },
    { color: '#664499', accent: '#9966cc' },
    { color: '#dd7722', accent: '#ffaa44' },
  ],
  reset() { this.list = []; this.spawnTimer = 0; this.spawnInterval = C.SPAWN_BASE_INTERVAL; },
  update(dt, speed) {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnInterval = Math.max(C.SPAWN_MIN_INTERVAL, this.spawnInterval - 0.008);
      this._spawn(speed);
    }
    for (const e of this.list) e.y += speed * dt;
    this.list = this.list.filter(e => e.y < H + (e.isSemi ? C.SEMI_H + 20 : C.ENEMY_H + 20));
  },
  // Semi truck colors
  semiColors: [
    { color: '#cc2200', accent: '#ff6644' },  // red hauler
    { color: '#334455', accent: '#6688aa' },  // steel blue
    { color: '#445522', accent: '#88aa44' },  // army green
    { color: '#554422', accent: '#aa8844' },  // desert tan
    { color: '#222244', accent: '#4455aa' },  // midnight navy
  ],
  _spawn(speed) {
    // ~20% chance of a semi truck (increases slightly at higher speeds)
    const speedFrac = clamp((speed - C.BASE_SPEED) / (C.MAX_SPEED - C.BASE_SPEED), 0, 1);
    const semiChance = lerp(0.18, 0.30, speedFrac);
    const isSemi = Math.random() < semiChance;
    const lane = Math.floor(Math.random() * C.LANES);
    const cx = getLaneCenterX(lane);
    if (isSemi) {
      const col = this.semiColors[Math.floor(Math.random() * this.semiColors.length)];
      this.list.push({ lane, x: cx, y: -C.SEMI_H, ...col, speed, isSemi: true });
    } else {
      const col = this.colors[Math.floor(Math.random() * this.colors.length)];
      this.list.push({ lane, x: cx, y: -C.ENEMY_H, ...col, speed, isSemi: false });
    }
  },
  draw() {
    for (const e of this.list) {
      if (e.isSemi) {
        drawSemiTruck(ctx, e.x, e.y, e.color, e.accent);
      } else {
        // Shadow
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + C.ENEMY_H*0.42, C.ENEMY_W*0.4, C.ENEMY_H*0.1, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
        drawEnemyCar(ctx, e.x, e.y, e.color, e.accent);
      }
    }
  },
  // Returns true = player dies, false = player crushes (enemy removed from list)
  // 'crushed' enemies are spliced out and particles emitted by caller
  checkCollision(carData) {
    const ability = carData ? carData.id : null;
    const ph = Player.getHitbox(carData);
    const toRemove = [];
    let playerDies = false;

    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      // Build enemy hitbox
      let eh;
      if (e.isSemi) {
        const px2 = C.SEMI_W * 0.1, py2 = C.SEMI_H * 0.08;
        eh = { x: e.x - C.SEMI_W/2 + px2, y: e.y - C.SEMI_H/2 + py2,
               w: C.SEMI_W - px2*2, h: C.SEMI_H - py2*2 };
      } else {
        const px2 = C.ENEMY_W * 0.38, py2 = C.ENEMY_H * 0.2;
        eh = { x: e.x - C.ENEMY_W/2 + px2, y: e.y - C.ENEMY_H/2 + py2,
               w: C.ENEMY_W - px2*2, h: C.ENEMY_H - py2*2 };
      }
      // AABB check
      const hit = ph.x < eh.x+eh.w && ph.x+ph.w > eh.x &&
                  ph.y < eh.y+eh.h && ph.y+ph.h > eh.y;
      if (!hit) continue;

      // --- resolve by ability ---
      if (ability === 'monster') {
        // Monster truck: crushes regular cars, dies on semis
        if (e.isSemi) { playerDies = true; break; }
        else { toRemove.push(i); } // crush the car

      } else if (ability === 'snowplow') {
        // Snowplow semi: crushes cars AND semis, but head-on semi = death
        // Head-on = horizontal overlap is central (enemy centre near player centre)
        // and enemy is in same lane (x centres close)
        if (e.isSemi) {
          const dx = Math.abs(e.x - Player.drawX);
          const headOn = dx < C.SEMI_W * 0.5; // within half a lane
          if (headOn) { playerDies = true; break; }
          else { toRemove.push(i); } // glancing blow — plow wins
        } else {
          toRemove.push(i); // crush car
        }

      } else {
        // Normal car: dies on anything
        playerDies = true; break;
      }
    }

    // Remove crushed enemies (reverse order to keep indices stable)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const e = this.list[toRemove[i]];
      // Explosion particles for crushed vehicle
      Particles.emit(e.x, e.y, 14, {
        spread: 200, speed: 160, life: 0.6, lifeVar: 0.3,
        color: e.isSemi ? '#ff9933' : '#ff4466', size: 7, sizeVar: 6,
      });
      FloatTexts.add(e.x, e.y - 30, 'CRUSHED!', '#ff9933', 22);
      // Per-vehicle crush SFX
      if (ability === 'monster') {
        Audio.playCrunch();          // chunky crunch for monster truck on cars
      } else if (ability === 'snowplow') {
        if (e.isSemi) Audio.playSemiCrash(); // metal-on-metal for plow vs semi
        else          Audio.playCrunch();     // crunch for plow vs car
      }
      this.list.splice(toRemove[i], 1);
    }

    return playerDies;
  },
};

// ─── COINS ───────────────────────────────────────────────────
const Coins = {
  list: [],
  spawnTimer: 0,
  INTERVAL: 1.6,
  reset() { this.list = []; this.spawnTimer = 0; },
  update(dt, speed) {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.INTERVAL) {
      this.spawnTimer = 0;
      const lane = Math.floor(Math.random() * C.LANES);
      this.list.push({ lane, x: getLaneCenterX(lane), y: -20, angle: 0 });
    }
    for (const c of this.list) {
      c.y += speed * dt * 0.75; // coins move slightly slower
      c.angle += dt * 3;
    }
    this.list = this.list.filter(c => c.y < H + 30);
  },
  checkCollect() {
    // Pick up against the active vehicle's real hitbox, not a fixed radius
    // sized for the starter car. The snowplow is 160px tall, so a centre-
    // distance test meant coins slid a long way under the plow before they
    // counted - it read as the truck driving straight over them.
    const hb = Player.getPickupBox(Game.activeCar);
    const r = C.COIN_R;
    const collected = [];
    this.list = this.list.filter(c => {
      // circle vs axis-aligned box: distance to the box's nearest point
      const nx = clamp(c.x, hb.x, hb.x + hb.w);
      const ny = clamp(c.y, hb.y, hb.y + hb.h);
      const dx = c.x - nx, dy = c.y - ny;
      if (dx*dx + dy*dy <= r*r) { collected.push(c); return false; }
      return true;
    });
    return collected;
  },
  draw() {
    for (const c of this.list) {
      const pulse = 1 + Math.sin(c.angle * 2) * 0.12;
      const r = C.COIN_R * pulse;
      // Glow
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 2.5);
      g.addColorStop(0, 'rgba(255,215,0,0.5)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Coin
      const cg = ctx.createRadialGradient(c.x - r*0.3, c.y - r*0.3, 0, c.x, c.y, r);
      cg.addColorStop(0, '#fff5aa');
      cg.addColorStop(0.4, '#ffd700');
      cg.addColorStop(1, '#cc9900');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
      // Shine
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(c.x - r*0.28, c.y - r*0.28, r*0.32, 0, Math.PI*2);
      ctx.fill();
      // Icon
      ctx.font = `bold ${r * 1.0}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#aa7700';
      ctx.fillText('$', c.x, c.y + 1);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.textAlign = 'left';
  },
};

// ─── BACKGROUND SCENERY ──────────────────────────────────────
const Scenery = {
  trees: [],
  buildings: [],
  init() {
    this.trees = [];
    this.buildings = [];
    // Pre-populate trees and buildings
    for (let i = 0; i < 12; i++) {
      this.trees.push(this._mkTree(Math.random() * H));
      this.buildings.push(this._mkBuilding(Math.random() * H));
    }
  },
  _mkTree(y) {
    const side = Math.random() < 0.5 ? 'left' : 'right';
    const x = side === 'left'
      ? rnd(8, roadLeft - 12)
      : rnd(roadLeft + roadW + 12, W - 8);
    return { x, y, side, type: Math.floor(Math.random() * 3), s: rnd(0.7, 1.2) };
  },
  _mkBuilding(y) {
    const side = Math.random() < 0.5 ? 'left' : 'right';
    const x = side === 'left'
      ? rnd(0, roadLeft - 30)
      : rnd(roadLeft + roadW + 10, W - 20);
    const w = rnd(25, 50), h = rnd(40, 110);
    const hue = Math.floor(Math.random() * 360);
    return { x, y, side, w, h, color: `hsl(${hue},20%,22%)`, accent: `hsl(${hue},35%,38%)` };
  },
  update(dt, speed) {
    const s = speed * 0.45 * dt;
    for (const t of this.trees) {
      t.y += s;
      if (t.y > H + 120) Object.assign(t, this._mkTree(-120));
    }
    for (const b of this.buildings) {
      b.y += s * 0.6;
      if (b.y > H + 120) Object.assign(b, this._mkBuilding(-120));
    }
  },
  draw() {
    // Buildings (behind everything)
    for (const b of this.buildings) {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y - b.h, b.w, b.h);
      // Windows
      ctx.fillStyle = b.accent;
      for (let row = 1; row < Math.floor(b.h/14); row++) {
        for (let col = 0; col < Math.floor(b.w/10); col++) {
          if (Math.random() > 0.35) {
            ctx.fillRect(b.x + 3 + col*10, b.y - b.h + row*14, 6, 8);
          }
        }
      }
    }
    // Trees
    for (const t of this.trees) {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.s, t.s);
      this._drawTree(ctx, t.type);
      ctx.restore();
    }
  },
  _drawTree(ctx, type) {
    if (type === 0) { // Pine
      ctx.fillStyle = '#2a4a1a';
      ctx.beginPath();
      ctx.moveTo(0, -38); ctx.lineTo(-16, 0); ctx.lineTo(16, 0);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -52); ctx.lineTo(-12, -22); ctx.lineTo(12, -22);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a2a10';
      ctx.fillRect(-4, 0, 8, 14);
    } else if (type === 1) { // Round tree
      ctx.fillStyle = '#1a3a10';
      ctx.beginPath();
      ctx.arc(0, -20, 18, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#2a5a1a';
      ctx.beginPath();
      ctx.arc(-6, -26, 12, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#1a2a10';
      ctx.fillRect(-3, 0, 6, 12);
    } else { // Cactus
      ctx.fillStyle = '#2a6a2a';
      ctx.fillRect(-5, -40, 10, 44);
      ctx.fillRect(-16, -28, 12, 8);
      ctx.fillRect(4, -22, 12, 8);
    }
  },
};

// ─── ROAD DRAWING ────────────────────────────────────────────
function drawRoad() {
  // Shoulders
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, W, H);

  // Side grass / dirt
  const gGrad = ctx.createLinearGradient(0, 0, roadLeft, 0);
  gGrad.addColorStop(0, '#1a2a10');
  gGrad.addColorStop(0.6, '#1e2e14');
  gGrad.addColorStop(1, '#2a3a1a');
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, 0, roadLeft, H);
  const gGrad2 = ctx.createLinearGradient(roadLeft + roadW, 0, W, 0);
  gGrad2.addColorStop(0, '#2a3a1a');
  gGrad2.addColorStop(0.4, '#1e2e14');
  gGrad2.addColorStop(1, '#1a2a10');
  ctx.fillStyle = gGrad2;
  ctx.fillRect(roadLeft + roadW, 0, W - roadLeft - roadW, H);

  // Road surface
  const rGrad = ctx.createLinearGradient(roadLeft, 0, roadLeft + roadW, 0);
  rGrad.addColorStop(0, '#2a2a2a');
  rGrad.addColorStop(0.5, '#303030');
  rGrad.addColorStop(1, '#2a2a2a');
  ctx.fillStyle = rGrad;
  ctx.fillRect(roadLeft, 0, roadW, H);

  // Road edge lines
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(roadLeft + 2, 0); ctx.lineTo(roadLeft + 2, H);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(roadLeft + roadW - 2, 0); ctx.lineTo(roadLeft + roadW - 2, H);
  ctx.stroke();

  // Lane dashes
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([C.LANE_MARK_H, C.LANE_MARK_GAP]);
  for (let lane = 1; lane < C.LANES; lane++) {
    const x = roadLeft + laneW * lane;
    ctx.lineDashOffset = -roadScrollY;
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ─── UI HELPERS ──────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  if (id) document.getElementById(id)?.classList.add('active');
}
function showHUD(on) {
  document.getElementById('hud').classList.toggle('active', on);
}
function updateHUD(score, coins, nitro, comboCount) {
  document.getElementById('score-display').textContent = score.toLocaleString();
  document.getElementById('coin-display').textContent = '🪙 ' + coins;
  document.getElementById('nitro-bar').style.width = (nitro * 100).toFixed(1) + '%';
  const comboEl = document.getElementById('combo-display');
  if (comboCount >= 2) {
    comboEl.textContent = `🔥 COMBO x${comboCount}!`;
    comboEl.classList.add('show');
  } else {
    comboEl.classList.remove('show');
  }
}
function showToast(msg, dur = 2000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), dur);
}
function flashScreen() {
  const el = document.getElementById('flash');
  el.style.opacity = '0.6';
  setTimeout(() => el.style.opacity = '0', 80);
}
function buildLeaderboard() {
  const el = document.getElementById('lb-list');
  const scores = Save.data.highScores;
  if (!scores.length) { el.innerHTML = '<div style="color:rgba(224,224,240,0.5);font-size:0.9rem;padding:16px 0">No scores yet — play your first game!</div>'; return; }
  el.innerHTML = scores.slice(0, 10).map((s, i) =>
    `<div class="lb-row${i===0?' gold':''}">
      <span class="lb-rank">#${i+1}</span>
      <span class="lb-name">You</span>
      <span class="lb-score">${s.toLocaleString()}</span>
    </div>`
  ).join('');
}
// ─── CAR ICONS ───────────────────────────────────────────────
// The garage used emoji, but there is no monster-truck emoji, so MONSTER
// reused the CRUISER glyph and SNOWPLOW reused SEMI's - the two vehicles
// that most need to look distinct wore another car's badge. Render each
// car with its real in-game sprite instead, so a card previews what you
// actually drive.
const CAR_ICON_BOX = 46;
const _carIcons = {};
function carIconURL(car) {
  if (_carIcons[car.id]) return _carIcons[car.id];
  // Several sprites draw outside their nominal w*h box - the snowplow's blade
  // sits above the cab and overhangs both sides, the semi vents smoke upward,
  // the monster truck's wheels protrude. Fit to the *drawn* extent, not the
  // vehicle box, or the blade gets clipped off and a snowplow looks like a semi.
  let w, h, paint, bw, bh, dy;
  if (car.id === 'monster') {
    w = C.MONSTER_W; h = C.MONSTER_H;
    bw = w * 1.16; bh = h * 1.08; dy = 0;
    paint = c => drawMonsterTruck(c, 0, 0, car.color, car.accent);
  } else if (car.id === 'snowplow') {
    w = C.PLOW_W; h = C.PLOW_H;
    bw = w * 1.20; bh = h * 1.18; dy = h * 0.07;   // room above for the blade
    paint = c => drawSnowplowSemi(c, 0, 0, car.color, car.accent);
  } else {
    // Every other car - SEMI included - is drawn with drawPixelCar in play,
    // so the icon must be that too rather than promising a vehicle you
    // don't actually get.
    w = C.CAR_W; h = C.CAR_H;
    bw = w * 1.08; bh = h * 1.08; dy = 0;
    paint = c => drawPixelCar(c, 0, 0, C.CAR_W, C.CAR_H, car.color, car.accent);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const pad = 3;
  const scale = Math.min((CAR_ICON_BOX - pad * 2) / bw, (CAR_ICON_BOX - pad * 2) / bh);
  const cv = document.createElement('canvas');
  cv.width = CAR_ICON_BOX * dpr;
  cv.height = CAR_ICON_BOX * dpr;
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);
  c.translate(CAR_ICON_BOX / 2, CAR_ICON_BOX / 2);
  c.scale(scale, scale);
  c.translate(0, dy);
  paint(c);
  _carIcons[car.id] = cv.toDataURL('image/png');
  return _carIcons[car.id];
}

function buildGarage() {
  document.getElementById('garage-coins').textContent = `🪙 ${Save.data.coins} coins`;
  const grid = document.getElementById('car-grid');
  grid.innerHTML = CARS.map(car => {
    const owned = Save.data.ownedCars.includes(car.id);
    const selected = Save.data.activeCar === car.id;
    const trialable = (car.id === 'monster' || car.id === 'snowplow') && !owned;
    const tried = trialable && (Save.data.triedCars || []).includes(car.id);
    let costLabel;
    if (owned) {
      costLabel = selected ? '✓ IN USE' : 'OWNED';
    } else if (trialable) {
      costLabel = `🪙 ${car.cost}`;
    } else {
      costLabel = '🪙 ' + car.cost;
    }
    const trialBadge = trialable && !tried
      ? `<div class="trial-badge">1 FREE TRY</div>`
      : (tried ? `<div class="trial-badge-used">✓ TRIED</div>` : '');
    // An unused free trial stays highlighted; once used the card goes back to
    // looking like any other locked car.
    const trialReady = trialable && !tried;
    return `<div class="car-card${selected?' selected':''}${!owned?' locked':''}${trialReady?' trial-ready':''}"
      onclick="Garage.tap('${car.id}')">
      <img class="car-icon" src="${carIconURL(car)}" alt="${car.name}" />
      <div class="car-name">${car.name}</div>
      <div class="car-cost">${costLabel}</div>
      ${trialBadge}
      ${car.desc ? `<div class="car-ability">${car.desc}</div>` : ''}
    </div>`;
  }).join('');
}
const Garage = {
  tap(id) {
    const car = CARS.find(c => c.id === id);
    if (!car) return;
    if (Save.data.ownedCars.includes(id)) {
      Save.selectCar(id);
      buildGarage();
    } else if (id === 'monster' || id === 'snowplow') {
      // Show the in-game trial modal
      TrialModal.open(id);
    } else {
      if (Save.buyCar(id)) {
        Save.selectCar(id);
        showToast(`${car.name} unlocked!`);
        buildGarage();
      } else {
        showToast(`${car.name}: need ${car.cost.toLocaleString()} · you have ${Save.data.coins.toLocaleString()}`);
      }
    }
  },
};

// ─── TRIAL MODAL ──────────────────────────────────────────────
const TrialModal = {
  _carId: null,
  open(id) {
    const car = CARS.find(c => c.id === id);
    if (!car) return;
    this._carId = id;
    const tried = (Save.data.triedCars || []).includes(id);
    document.getElementById('trial-emoji').innerHTML =
      `<img class="car-icon car-icon-lg" src="${carIconURL(car)}" alt="${car.name}" />`;
    document.getElementById('trial-name').textContent = car.name;
    document.getElementById('trial-cost').textContent =
      `🪙 ${car.cost.toLocaleString()} coins to unlock  ·  You have: ${Save.data.coins.toLocaleString()}`;
    // Hide TRY FREE button if already tried
    const tryBtn = document.getElementById('trial-btn-try');
    if (tried) {
      tryBtn.style.display = 'none';
    } else {
      tryBtn.style.display = '';
      tryBtn.textContent = '▶ TRY FREE';
    }
    const modal = document.getElementById('trial-modal');
    modal.style.display = 'flex';
  },
  close() {
    document.getElementById('trial-modal').style.display = 'none';
    this._carId = null;
  },
  buy() {
    const id = this._carId;
    this.close();
    const car = CARS.find(c => c.id === id);
    if (!car) return;
    if (Save.buyCar(id)) {
      Save.selectCar(id);
      showToast(`${car.name} unlocked!`);
      buildGarage();
    } else {
      showToast(`${car.name}: need ${car.cost.toLocaleString()} · you have ${Save.data.coins.toLocaleString()}`);
    }
  },
  tryFree() {
    const id = this._carId;
    this.close();
    showScreen(null);
    showHUD(true);
    Game.startTrial(id);
  },
};
window.TrialModal = TrialModal;
window.Garage = Garage;

// ─── DEV HOOKS ───────────────────────────────────────────────
// Test helpers for grinding-free QA. Gated by hostname so they are inert
// anywhere the game is actually published: on crazygames.com, on a
// GameDistribution CDN, or on any other host, isDevHost() is false and the
// query params below do nothing at all.
function isDevHost() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '' || h.endsWith('.github.io');
}

function applyDevParams() {
  if (!isDevHost()) return;
  const q = new URLSearchParams(location.search);
  if (![...q.keys()].some(k => ['coins', 'unlock', 'reset'].includes(k))) return;
  const msgs = [];

  if (q.has('reset')) {
    // Store.clear() first: Save.load() reads straight back out of storage,
    // so resetting the object alone just reloads the save being cleared.
    Store.clear();
    Save.data = {};
    Save.load();
    msgs.push('save reset');
  }
  if (q.has('coins')) {
    const n = parseInt(q.get('coins'), 10);
    if (isFinite(n) && n >= 0) {
      Save.data.coins = n;
      Save.data.totalCoins = Math.max(Save.data.totalCoins, n);
      msgs.push(n.toLocaleString() + ' coins');
    }
  }
  if (q.get('unlock') === 'all') {
    Save.data.ownedCars = CARS.map(c => c.id);
    msgs.push('all cars unlocked');
  }
  Save.save();

  // Drop the params so a refresh doesn't silently re-apply them.
  history.replaceState(null, '', location.pathname);
  if (msgs.length) setTimeout(() => showToast('DEV: ' + msgs.join(' · ')), 400);
}

// ─── GAME STATE MACHINE ──────────────────────────────────────
const Game = {
  state: 'title',  // title | playing | paused | dead
  score: 0,
  sessionCoins: 0,
  speed: C.BASE_SPEED,
  elapsed: 0,
  lastTime: 0,
  raf: null,
  comboCount: 0,
  activeCar: null,
  trialMode: false,   // true when playing a free trial of monster/snowplow

  init() {
    Save.load();
    applyDevParams();
    Audio.init();
    // Honour the site's mute switch from the first frame, and keep following it.
    const settings = Portal.getSettings();
    if (settings) Audio.setPortalMute(settings.muteAudio === true);
    Portal.onSettingsChange(s => Audio.setPortalMute(s && s.muteAudio === true));
    Input.init();
    Particles.init();
    Scenery.init();
    buildLeaderboard();
    buildGarage();
    this._loop(0);
  },

  startTrial(carId) {
    // Mark as tried so the badge updates
    if (!Save.data.triedCars.includes(carId)) {
      Save.data.triedCars.push(carId);
      Save.save();
    }
    this.trialMode = true;
    this._trialCarId = carId;
    this.start();
  },

  start() {
    Audio.resume();
    this.score = 0;
    this.sessionCoins = 0;
    this.speed = C.BASE_SPEED;
    this.elapsed = 0;
    this.comboCount = 0;
    roadScrollY = 0;
    const carId = this.trialMode ? this._trialCarId : Save.data.activeCar;
    this.activeCar = CARS.find(c => c.id === carId) || CARS[0];
    Player.init();
    Enemies.reset();
    Coins.reset();
    Scenery.init();
    FloatTexts.pool = [];
    Particles.pool.forEach(p => p.active = false);
    showScreen(null);
    showHUD(true);
    Input.enableTouchZones(true);
    Portal.gameplayStart();
    this.state = 'playing';
  },

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    Portal.gameplayStop();
    showScreen('screen-pause');
  },

  resume() {
    this.state = 'playing';
    Portal.gameplayStart();
    showScreen(null);
  },

  quit() {
    this.state = 'title';
    Portal.gameplayStop();
    showHUD(false);
    Input.enableTouchZones(false);
    Input.reset();
    showScreen('screen-title');
  },

  _die() {
    if (!Player.alive) return;
    Player.alive = false;
    this.state = 'dead';
    Portal.gameplayStop();
    Audio.stopBGM();
    Audio.playCrash();
    flashScreen();
    // Particle explosion
    Particles.emit(Player.drawX, Player.y, 28, {
      spread: 280, speed: 200, life: 0.9, lifeVar: 0.4,
      color: '#ff4466', size: 8, sizeVar: 8,
    });
    Particles.emit(Player.drawX, Player.y, 18, {
      spread: 180, speed: 150, life: 0.6, lifeVar: 0.2,
      color: '#ffaa22', size: 5, sizeVar: 6,
    });
    // Finalize
    const finalScore = this.score;
    const isNewBest = finalScore > 0 && finalScore > Save.getBest();
    const wasTrialMode = this.trialMode;
    const trialCarId = this._trialCarId;
    this.trialMode = false;
    this._trialCarId = null;
    if (isNewBest) Portal.happytime();   // site-side celebration for a new best
    Save.addScore(finalScore);
    Save.addCoins(this.sessionCoins);
    Save.data.deathCount = (Save.data.deathCount || 0) + 1;
    Save.save();
    const showAd = (Save.data.deathCount % 5 === 0);
    setTimeout(() => {
      showHUD(false);
      Input.enableTouchZones(false);
      Input.reset();
      buildLeaderboard();
      if (wasTrialMode) {
        // Trial run ended — show upsell toast and return to garage
        const trialCar = CARS.find(c => c.id === trialCarId);
        buildGarage();
        showScreen('screen-garage');
        if (trialCar) {
          showToast(`Buy ${trialCar.name} for ${trialCar.cost.toLocaleString()} coins to keep it!`);
        }
      } else {
        document.getElementById('go-score').textContent = finalScore.toLocaleString();
        document.getElementById('go-best').textContent = 'BEST: ' + Save.getBest().toLocaleString();
        document.getElementById('go-coins').textContent = `🪙 +${this.sessionCoins} coins collected`;
        this._maybeOfferTrial();
        if (showAd) {
          // Show interstitial; game-over screen appears after ad is dismissed
          AdSystem.show(() => showScreen('screen-gameover'));
        } else {
          showScreen('screen-gameover');
        }
      }
    }, 900);
  },

  // The crush vehicles are what make this game not-just-another-lane-dodger,
  // but the free trial for them is buried in the garage where most players
  // never look. Surface it on the game-over screen instead.
  _maybeOfferTrial() {
    const btn = document.getElementById('go-trial-btn');
    if (!btn) return;
    const candidate = CARS.find(c =>
      c.ability &&
      !Save.data.ownedCars.includes(c.id) &&
      !Save.data.triedCars.includes(c.id)
    );
    // Give them a couple of normal runs first so the contrast lands
    if (!candidate || Save.data.deathCount < 2) {
      btn.style.display = 'none';
      btn.onclick = null;
      return;
    }
    btn.innerHTML =
      `<img class="car-icon car-icon-sm" src="${carIconURL(candidate)}" alt="" />` +
      `<span>TRY ${candidate.name} — FREE</span>`;
    btn.style.display = '';
    btn.onclick = () => {
      btn.style.display = 'none';
      btn.onclick = null;
      Game.startTrial(candidate.id);
    };
  },

  _update(dt) {
    if (this.state !== 'playing') return;
    this.elapsed += dt;
    // Speed ramp
    this.speed = clamp(C.BASE_SPEED + this.elapsed * C.SPEED_INC, C.BASE_SPEED, C.MAX_SPEED);
    const effectiveSpeed = this.speed * (Player.isNitro ? C.NITRO_BOOST : 1);
    // Score
    this.score = Math.floor(this.elapsed * 12 + this.sessionCoins * 15);
    // Road scroll
    roadScrollY += effectiveSpeed * dt;
    // Update
    Player.update(dt, effectiveSpeed);
    Enemies.update(dt, effectiveSpeed);
    Coins.update(dt, effectiveSpeed);
    Scenery.update(dt, effectiveSpeed);
    Particles.update(dt);
    FloatTexts.update(dt);
    // Collision
    if (Player.invincible <= 0 && Enemies.checkCollision(this.activeCar)) {
      this._die();
      return;
    }
    // Coins
    const collected = Coins.checkCollect();
    if (collected.length) {
      Player.coinStreak += collected.length;
      this.sessionCoins += collected.length;
      Audio.playCoin();
      for (const c of collected) {
        FloatTexts.add(c.x, c.y - 20, '+1', '#ffd700', 20);
        Particles.emit(c.x, c.y, 6, { spread: 80, speed: 90, life: 0.5, lifeVar: 0.2, color: '#ffd700', size: 5, sizeVar: 4 });
      }
      if (Player.coinStreak >= C.COMBO_TARGET) {
        const mult = Math.floor(Player.coinStreak / C.COMBO_TARGET);
        this.comboCount = 1 + mult;
        this.sessionCoins += collected.length * mult; // bonus coins
        FloatTexts.add(Player.drawX, Player.y - 60, `COMBO x${this.comboCount}!`, '#ffaa22', 26);
        Audio.playCombo();
      }
    } else if (Player.coinStreak > 0 && collected.length === 0) {
      // Streak only resets if player passes a coin lane without getting it
      // (simplified: don't reset on miss, only caps combo visually)
    }
    if (Player.isNitro && !this._lastNitro) Audio.playNitro();
    this._lastNitro = Player.isNitro;
    // HUD
    this.comboCount = Player.coinStreak >= C.COMBO_TARGET ? 1 + Math.floor(Player.coinStreak / C.COMBO_TARGET) : 0;
    updateHUD(this.score, this.sessionCoins, Player.nitroFuel, this.comboCount);
  },

  _draw() {
    ctx.clearRect(0, 0, W, H);
    drawRoad();
    Scenery.draw();
    Coins.draw();
    Enemies.draw();
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'dead') {
      if (Player.alive) Player.draw(this.activeCar || CARS[0]);
    }
    Particles.draw();
    FloatTexts.draw();
    // Speed lines during nitro
    if (Player.isNitro && this.state === 'playing') {
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#00ffc8';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const sx = rnd(roadLeft, roadLeft + roadW);
        const sy = rnd(0, H * 0.7);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy + rnd(40, 120));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  },

  _loop(ts) {
    const dt = Math.min((ts - this.lastTime) / 1000, 0.05);
    this.lastTime = ts;
    this._update(dt);
    this._draw();
    this.raf = requestAnimationFrame(t => this._loop(t));
  },
};

window.Game = Game;
window.showScreen = showScreen;

// ─── BOOT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Must finish before Game.init() -> Save.load() reads stored progress.
  await Portal.init();
  Portal.loadingStart();
  Game.init();
  Portal.loadingStop();
  // Pause on mobile back button / visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && Game.state === 'playing') Game.pause();
  });
});
