// AIWANNA cloud saves and leaderboard. Only inside the AIWANNA player: opened on its own, the game plays exactly as the
// original does, with the browser's localStorage and no board.
//
// Cloud saves. The game reads its save synchronously at startup while the platform's SDK is asynchronous, so startup
// (DOMContentLoaded and load handlers, plus timers set while the scripts run) is held back until the SDK has answered.
// The game's two storage keys are redirected to memory while in the player: what the browser has stored belongs to
// whoever played here last, and must not end up in another account.
//
// Saves are sent as a gzipped string, not as JSON values. The SDK refuses integers above 2^53, and numbers in this game
// go far past that. It also uploads whenever the state changes, and this state changes every second, so a new snapshot
// is only taken every few minutes, when the page is hidden, on a manual save, or when the platform asks for one.
//
// Leaderboard: the score is the total Mastery of the whole save, sent when it has grown. The platform keeps each
// player's best. A score of a mastery the game can't reach is refused by the board.
window.STI_ONLINE = (function () {
  'use strict';
  const GAME_ID = 'f5f38654-665a-4e1b-b2cf-a85036d9309f', BOARD_ID = '69ab9b44-45a8-4e23-938e-a168c7454f1e';
  const SCHEMA = 1, GAME_VERSION = '1.1.1', HOME = 'https://www.aiwanna.games';
  const SDK = HOME + '/sdk/cloud-saves-v1.js';
  const ORIGINS = [HOME, 'https://aiwanna.games', 'https://www.ai-made.games', 'https://ai-made.games', 'https://1gp-game-platform.vercel.app'];
  const SNAPSHOT_EVERY = 5 * 60000, SNAPSHOT_EVERY_HIDDEN = 30 * 60000, HIDE_AT_MOST = 60000, MANUAL_AT_MOST = 30000;
  const SCORE_EVERY = 5 * 60000, MAX_SCORE = 10000;

  function inPlayer() {
    try {
      if (window.parent === window) return new URLSearchParams(location.search).has('cloud');   // the SDK's local mode, for testing
      let host = (location.ancestorOrigins && location.ancestorOrigins[0]) || '';
      if (host === 'null') host = '';                                                          // Firefox when the platform embeds with no referrer
      if (!host && document.referrer) host = new URL(document.referrer).origin;
      return !host || ORIGINS.includes(host);
    } catch (e) { return false; }
  }
  const active = inPlayer();
  const noop = () => {};
  if (!active) return { active: false, holdTimers: noop, reload: () => location.reload(), saveNow: noop, openBoard: noop };

  // The game skips attack animations, sound, damage numbers, particles and some spawns unless document.hasFocus().
  // In an iframe that's false whenever the focus is on the page around it: right after pressing Play, or after
  // clicking the site's bar or comments. An iframe can't tell if the browser window has the focus, so visible counts.
  document.hasFocus = () => !document.hidden;

  // ---------------------------------------------------------------- hold startup back
  let released = false, domReady = false, pageLoaded = false;
  const heldReady = [], heldLoad = [];
  const docAdd = document.addEventListener, winAdd = window.addEventListener;
  document.addEventListener = function (type, fn, options) {
    if (!released && type === 'DOMContentLoaded' && this === document) { heldReady.push(fn); return; }
    return docAdd.call(this, type, fn, options);
  };
  window.addEventListener = function (type, fn, options) {
    if (!released && type === 'load') { heldLoad.push(fn); return; }
    return winAdd.call(window, type, fn, options);
  };
  const runAll = (list, target, type) => {
    const event = new Event(type);
    for (const fn of list.splice(0)) {
      try { typeof fn === 'function' ? fn.call(target, event) : fn.handleEvent(event); }
      catch (e) { console.error(e); }   // one handler failing must not stop the others, same as real listeners
    }
  };
  function flushHeld() {
    if (!released) return;
    if (domReady) runAll(heldReady, document, 'DOMContentLoaded');
    if (domReady && pageLoaded) runAll(heldLoad, window, 'load');
  }
  docAdd.call(document, 'DOMContentLoaded', () => { domReady = true; showCover(); flushHeld(); });
  winAdd.call(window, 'load', () => { pageLoaded = true; flushHeld(); });

  // Called right after HackTimer has replaced the timer functions, before any game script runs.
  function holdTimers() {
    const setI = window.setInterval, setT = window.setTimeout;
    window.setInterval = function (fn, ms, ...args) {
      if (released || typeof fn !== 'function') return setI(fn, ms, ...args);
      return setI(function () { if (released) fn.apply(this, arguments); }, ms, ...args);
    };
    window.setTimeout = function (fn, ms, ...args) {
      if (released || typeof fn !== 'function') return setT(fn, ms, ...args);
      const run = function () { if (released) fn.apply(this, args); else setT(run, 200); };
      return setT(run, ms);
    };
  }

  // ---------------------------------------------------------------- loading cover
  let cover = null, coverText = 'Loading your save...';
  function showCover() {
    if (released || cover) return;
    cover = document.createElement('div');
    cover.id = 'onlineCover';
    cover.textContent = coverText;
    document.body.appendChild(cover);
  }
  function setCover(text) { coverText = text; if (cover) cover.textContent = text; }
  function hideCover() { if (cover) { cover.remove(); cover = null; } }

  // ---------------------------------------------------------------- the game's storage keys, in memory
  const mem = { saveData: null, lastVisitTime: null };
  let redirect = true, writable = false;
  const isMine = (store, key) => redirect && store === window.localStorage && Object.prototype.hasOwnProperty.call(mem, key);
  const proto = Storage.prototype, getItem = proto.getItem, setItem = proto.setItem, removeItem = proto.removeItem;
  proto.getItem = function (key) { return isMine(this, key) ? mem[key] : getItem.call(this, key); };
  proto.setItem = function (key, value) { if (!isMine(this, key)) return setItem.call(this, key, value); if (writable) mem[key] = String(value); };
  proto.removeItem = function (key) { if (!isMine(this, key)) return removeItem.call(this, key); if (writable) mem[key] = null; };

  // ---------------------------------------------------------------- snapshots
  async function gzip(text) {
    const buffer = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  async function gunzip(base64) {
    const binary = atob(base64), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  function progressLine() {
    try {
      const mastery = Math.floor(window.stiMasteryScore || 0), level = rpgClass[stats.currentClass].level;
      return window.GameI18n && GameI18n.locale === 'zh' ? `精通 ${mastery} · 等级 ${level}` : `Mastery ${mastery} · Level ${level}`;
    } catch (e) { return ''; }
  }
  async function pack() {
    const text = mem.saveData;
    const out = { z: 0, save: text, last: mem.lastVisitTime, note: progressLine() };
    if (text && typeof CompressionStream === 'function') {
      try { out.save = await gzip(text); out.z = 1; } catch (e) { out.save = text; out.z = 0; }
    }
    return out;
  }
  const blank = () => ({ z: 0, save: null, last: null, note: '' });
  let snapshot = blank(), snapshotAt = 0, wanted = false, frozen = false, leaving = false;

  async function exportState() {
    if (released && !frozen && (wanted || Date.now() - snapshotAt >= (document.hidden ? SNAPSHOT_EVERY_HIDDEN : SNAPSHOT_EVERY))) {
      wanted = false;
      snapshotAt = Date.now();
      window.save();                               // the game's own save, which writes to memory here
      // The page is going away: gzip is asynchronous and wouldn't finish. Without an await here the SDK can still
      // write the snapshot to this device before the page stops, and the next launch uploads it.
      if (leaving) snapshot = { z: 0, save: mem.saveData, last: mem.lastVisitTime, note: progressLine() };
      else snapshot = await pack();
    }
    return Object.assign({}, snapshot);
  }
  async function importState(data) {
    const text = data && data.save ? (data.z ? await gunzip(data.save) : data.save) : null;
    mem.saveData = text;
    mem.lastVisitTime = (data && data.last) || null;
    snapshot = Object.assign(blank(), data);
    snapshotAt = Date.now();
    // Mid-game this is the player choosing another save on the platform. The game can only load at startup.
    if (released) { writable = false; frozen = true; setTimeout(() => location.reload(), 600); }
  }

  // ---------------------------------------------------------------- start
  let saves = null;
  function loadSdk() {
    return new Promise(resolve => {
      const found = () => (window.AIWanna && window.AIWanna.saves) || null;
      if (found()) return resolve(found());
      const script = document.createElement('script');
      const timer = setTimeout(() => resolve(null), 12000);
      script.src = SDK;
      script.onload = () => { clearTimeout(timer); resolve(found()); };
      script.onerror = () => { clearTimeout(timer); resolve(null); };
      document.head.appendChild(script);
    });
  }
  function release() {
    released = true;
    writable = true;
    hideCover();
    flushHeld();
    startBoard();
  }
  async function start() {
    // First in line, so that a snapshot is ready when the SDK asks for one on the same events.
    const wantSnapshot = () => { wanted = true; };
    docAdd.call(document, 'visibilitychange', () => {
      if (!document.hidden) return;
      if (Date.now() - snapshotAt >= HIDE_AT_MOST) wantSnapshot();              // flipping between tabs shouldn't mean an upload each time
      settleScore(true);
    });
    winAdd.call(window, 'pagehide', () => { leaving = true; wantSnapshot(); });
    winAdd.call(window, 'pageshow', () => { leaving = false; });
    winAdd.call(window, 'message', event => { if (event.data && event.data.type === 'cloud-save-command') wantSnapshot(); });

    const sdk = await loadSdk();
    if (!sdk) {                                    // can't reach the platform's script: play on this browser's own save
      redirect = false;
      return release();
    }
    try {
      // This can wait for a long time while the platform shows the player a choice. That's expected: keep the cover up.
      await sdk.initialize({
        platformOrigin: HOME, gameId: GAME_ID, schemaVersion: SCHEMA, gameVersion: GAME_VERSION,
        exportState, importState, summary: data => String((data && data.note) || '').slice(0, 200),
      });
      saves = sdk;
      release();
    } catch (e) {
      console.error(e);
      setCover(e && e.code === 'INCOMPATIBLE_SAVE' ? 'This save needs a newer version of the game. Your save is safe.' : "Couldn't load your save. Your save is safe. Please reload the page.");
    }
  }

  // The manual save button and the S key. The timer's autosave doesn't come through here.
  function saveNow() {
    if (!saves || frozen) return;
    if (Date.now() - snapshotAt >= MANUAL_AT_MOST) wanted = true;
    saves.save().catch(noop);
  }
  // Wiping progress and importing a file change the save and reload. Upload first, or the reload brings the old one back.
  async function reloadAfterSave() {
    if (!saves) return location.reload();
    writable = false;
    frozen = true;
    snapshot = await pack();
    snapshotAt = Date.now();
    await Promise.race([saves.save().catch(noop), new Promise(resolve => setTimeout(resolve, 6000))]);
    location.reload();
  }

  // ---------------------------------------------------------------- leaderboard
  const board = { token: null, expires: 0, origin: null, player: null, pending: null, sent: -1, sentAt: 0, wait: 0, busy: false, rank: null };
  const uuid = () => crypto.randomUUID();

  function boardSession() {
    if (board.token && Date.now() < board.expires - 60000) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const requestId = uuid();
      const done = (fn, value) => { clearTimeout(timer); window.removeEventListener('message', receive); fn(value); };
      const receive = event => {
        const d = event.data;
        if (event.source !== window.parent || !ORIGINS.includes(event.origin) || !d || d.source !== 'aimadegames-platform' || d.type !== 'leaderboard-session' || d.requestId !== requestId) return;
        if (d.error || !d.session || !d.session.token || d.apiOrigin !== event.origin) return done(reject, new Error('no session'));
        board.token = d.session.token;
        board.expires = Date.parse(d.session.expiresAt) || Date.now() + 3000000;
        board.origin = event.origin;
        board.player = d.session.player || null;
        done(resolve);
      };
      const timer = setTimeout(() => done(reject, new Error('timeout')), 15000);
      window.addEventListener('message', receive);
      if (window.parent === window) return done(reject, new Error('standalone'));
      for (const target of ORIGINS) { try { window.parent.postMessage({ source: 'aimadegames', type: 'leaderboard-session', requestId }, target); } catch (e) { /* next */ } }
    });
  }
  async function boardCall(method, path, key, body) {
    const headers = { Authorization: 'Bearer ' + board.token };
    if (key) headers['Idempotency-Key'] = key;
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(board.origin + '/api/v1/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'omit', signal: AbortSignal.timeout(15000) });
    let data = null;
    try { data = await response.json(); } catch (e) { /* the status says enough */ }
    if (response.status === 401) board.token = null;
    return { ok: response.ok, status: response.status, data, after: Number(response.headers.get('Retry-After')) || 0 };
  }
  async function settleScore(force) {
    if (!released || board.busy || Date.now() < board.wait) return;
    if (typeof rpgPlayer !== 'undefined' && rpgPlayer.debug) return;           // the developer's test saves
    if (!board.pending) {
      const score = Math.floor(window.stiMasteryScore || 0);
      if (score <= 0 || score <= board.sent || score > MAX_SCORE) return;
      if (!force && Date.now() - board.sentAt < SCORE_EVERY) return;
      board.pending = { score, startKey: uuid(), scoreKey: uuid(), runId: null };
    }
    const p = board.pending;
    board.busy = true;
    const later = (seconds, reply) => { board.wait = Date.now() + 1000 * Math.max(seconds, (reply && reply.after) || 0); };
    const handle = reply => {
      if (reply.status === 401) return;                                         // token renewed next time, same run and score
      if (reply.status === 429 || reply.status >= 500) return later(reply.status === 429 ? 60 : 30, reply);
      board.pending = null; board.sent = p.score; board.sentAt = Date.now();    // refused for good: don't send this score again
    };
    try {
      await boardSession();
      if (!p.runId) {
        const run = await boardCall('POST', 'leaderboards/' + BOARD_ID + '/runs', p.startKey);
        if (!run.ok || !run.data || !run.data.runId) return handle(run);
        p.runId = run.data.runId;
      }
      const reply = await boardCall('POST', 'runs/' + encodeURIComponent(p.runId) + '/score', p.scoreKey, { score: p.score });
      if (!reply.ok) return handle(reply);
      board.pending = null; board.sent = p.score; board.sentAt = Date.now();
      if (reply.data && reply.data.rank) board.rank = reply.data.rank;
    } catch (e) {
      later(e && e.message === 'no session' ? 600 : 60);                        // signed out or offline: never bother the player
    } finally { board.busy = false; }
  }
  function startBoard() {
    const button = document.getElementById('botonLeaderboard');
    if (button) button.style.display = '';
    board.sentAt = Date.now();
    setInterval(() => settleScore(false), 60000);
  }

  // The panel. Player names go in as text, never as markup.
  function row(rank, name, score, mine) {
    const li = document.createElement('div');
    li.className = 'boardRow' + (mine ? ' boardMine' : '');
    li.setAttribute('data-no-translate', '');
    const r = document.createElement('span'); r.className = 'boardRank'; r.textContent = '#' + rank;
    const n = document.createElement('span'); n.className = 'boardName'; n.textContent = name;
    const s = document.createElement('span'); s.className = 'boardScore'; s.textContent = Number(score).toLocaleString('en-US');
    li.append(r, n, s);
    return li;
  }
  function boardMessage(list, text) {
    const p = document.createElement('p');
    p.className = 'boardNote';
    p.textContent = text;
    list.appendChild(p);
  }
  async function openBoard() {
    const list = document.getElementById('boardList'), me = document.getElementById('boardMe');
    if (!list || !me) return;
    list.textContent = ''; me.textContent = '';
    boardMessage(list, 'Loading...');
    await settleScore(true);                       // first, so the player's newest score is in what comes back
    try {
      await boardSession();
      const [top, mine] = await Promise.all([
        boardCall('GET', 'leaderboards/' + BOARD_ID + '/entries?limit=10'),
        boardCall('GET', 'leaderboards/' + BOARD_ID + '/me?around=0'),
      ]);
      list.textContent = '';
      if (!top.ok) return boardMessage(list, "Couldn't load the leaderboard. Please try again in a moment.");
      const entries = (top.data && top.data.entries) || [];
      if (!entries.length) boardMessage(list, 'No scores yet. Be the first!');
      for (const e of entries) list.appendChild(row(e.rank, (e.player && e.player.displayName) || '?', e.score, e.isMe));
      const entry = mine.ok && mine.data && mine.data.entry;
      if (entry && !entries.some(e => e.isMe)) me.appendChild(row(entry.rank, (entry.player && entry.player.displayName) || '?', entry.score, true));
      else if (!entry) boardMessage(me, 'Not ranked yet. Your Mastery is sent automatically as it grows.');
      if (board.player && board.player.isGuest) boardMessage(me, 'Playing as a guest. Log in on AIWANNA to keep your progress on any device.');
    } catch (e) {
      list.textContent = '';
      boardMessage(list, "Couldn't load the leaderboard. Please try again in a moment.");
    }
  }

  start();
  return { active: true, holdTimers, reload: reloadAfterSave, saveNow, openBoard };
})();
