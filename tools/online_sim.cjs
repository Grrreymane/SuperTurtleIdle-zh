#!/usr/bin/env node
// End-to-end test of platform/online.js against a pretend AIWANNA. Real accounts can't be scripted, so DevTools
// interception serves a fake player page and API on the real addresses, and this working copy on the real game address.
// The cloud save SDK itself is the real, live one.
//   node tools/online_sim.cjs
const fs = require('fs'), path = require('path');
const { launch } = require('./i18n/browser.cjs');
const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'i18n', '_work', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const GAME_ORIGIN = 'https://grrreymane.github.io', GAME = GAME_ORIGIN + '/SuperTurtleIdle-zh/', HOME = 'https://www.aiwanna.games';
const GAME_ID = 'f5f38654-665a-4e1b-b2cf-a85036d9309f';
const DEV_SAVE = fs.readFileSync(path.join(ROOT, 'dev', 'A4C - pre boss.json'), 'utf8');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

// ------------------------------------------------------------ the pretend platform
const db = { saves: {}, puts: [], runs: 0, scores: [], blockSdk: false };
const seen = [];
const cors = [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: '*' }, { name: 'Access-Control-Expose-Headers', value: '*' }];
const playerPage = q => `<!doctype html><meta charset="utf-8"><title>player</title><style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0;display:block}</style>
<iframe id="g" src="${GAME}?lang=${q.get('lang') || 'zh'}"></iframe>
<script>
const user = ${JSON.stringify(q.get('user') || 'u1')}, delay = ${Number(q.get('delay') || 0)};
window.statuses = [];
window.addEventListener('message', e => {
  const d = e.data; if (!d || d.source !== 'aimadegames') return;
  if (d.type === 'cloud-save-status') window.statuses.push(d.status);
  const guest = user === 'guest', token = 'tok-' + user, expiresAt = new Date(Date.now() + 3600000).toISOString();
  if (d.type === 'cloud-save-session') setTimeout(() => e.source.postMessage({ source: 'aimadegames-platform', type: 'cloud-save-session', requestId: d.requestId, apiOrigin: location.origin,
    session: { signedIn: !guest, identity: guest ? 'guest-1' : user, gameId: ${JSON.stringify(GAME_ID)}, token: guest ? undefined : token, expiresAt: guest ? undefined : expiresAt, config: { enabled: true, schemaVersion: 1, maxBytes: 262144, historyLimit: 3 } } }, e.origin), delay);
  if (d.type === 'leaderboard-session') e.source.postMessage({ source: 'aimadegames-platform', type: 'leaderboard-session', requestId: d.requestId, apiOrigin: location.origin,
    session: { token, expiresAt, player: { displayName: user, isGuest: guest } } }, e.origin);
});
window.command = action => document.getElementById('g').contentWindow.postMessage({ source: 'aimadegames-platform', type: 'cloud-save-command', action, requestId: 'c' + Date.now() }, ${JSON.stringify(GAME_ORIGIN)});
</script>`;

// Like the real API, a repeated Idempotency-Key gets the original answer. The SDK relies on this: an upload the page
// didn't see the end of (it was closing) is sent again, unchanged, at the next launch.
const answered = new Map();
function api(method, url, headers, body) {
  const key = headers['Idempotency-Key'] || headers['idempotency-key'];
  if (key && answered.has(key)) return answered.get(key);
  const reply = apiOnce(method, url, headers, body);
  if (key && reply[0] < 300) answered.set(key, reply);
  return reply;
}
function apiOnce(method, url, headers, body) {
  const user = (headers.Authorization || headers.authorization || '').replace('Bearer tok-', '');
  const p = url.pathname.replace('/api/v1/', '');
  if (/saves\/main$/.test(p)) {
    const s = db.saves[user] = db.saves[user] || { revision: 0, save: null };
    if (method === 'GET') return [200, { revision: s.revision, save: s.save ? { ...s.save, revision: s.revision, updatedAt: new Date().toISOString() } : null }];
    const b = JSON.parse(body);
    if (b.baseRevision !== s.revision) return [409, { error: { code: 'SAVE_CONFLICT', message: 'conflict' } }];
    const { baseRevision, ...save } = b;
    s.revision++; s.save = save;
    db.puts.push({ user, bytes: Buffer.byteLength(body), z: b.data.z, note: b.summary });
    return [200, { revision: s.revision, save: { revision: s.revision, updatedAt: new Date().toISOString(), summary: b.summary } }];
  }
  if (/\/runs$/.test(p) && method === 'POST') { db.runs++; return [201, { runId: 'run-' + db.runs, startedAt: new Date().toISOString(), submitBefore: new Date(Date.now() + 7200000).toISOString() }]; }
  if (/^runs\/.*\/score$/.test(p) && method === 'POST') { const score = JSON.parse(body).score; db.scores.push({ user, score }); return [200, { accepted: true, submittedScore: score, personalBest: score, isPersonalBest: true, rank: 2, participants: 3 }]; }
  if (/entries/.test(p)) {
    const best = db.scores.filter(s => s.user === 'u1').map(s => s.score).sort((a, b) => b - a)[0];
    const entries = [{ entryId: 'a', score: 3000, rank: 1, isMe: false, player: { displayName: 'TopTurtle', isGuest: false } }, { entryId: 'x', score: 2000, rank: 2, isMe: false, player: { displayName: '<img src=x onerror="window.pwned=1">', isGuest: false } }];
    if (best) entries.push({ entryId: 'me', score: best, rank: 3, isMe: true, player: { displayName: user, isGuest: false } });
    return [200, { entries, nextCursor: null }];
  }
  if (/\/me/.test(p)) return [200, { entry: null, neighbors: [] }];
  return [404, { error: { code: 'NOT_FOUND', message: p } }];
}

(async () => {
  const p = await launch({ root: ROOT, width: 1600, height: 900, args: ['--disable-site-isolation-trials', '--disable-features=IsolateOrigins,site-per-process'] });
  const results = [];
  const check = (name, ok, info) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    p.on('Fetch.requestPaused', async ev => {
      const { requestId, request } = ev;
      const url = new URL(request.url);
      seen.push(request.url);
      const fulfill = (status, type, body, extra = []) => p.send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: type }, ...cors, ...extra], body: Buffer.from(body).toString('base64') }).catch(() => {});
      try {
        if (url.origin === HOME && url.pathname === '/__player') return await fulfill(200, 'text/html; charset=utf-8', playerPage(url.searchParams));
        if (url.origin === HOME && url.pathname.startsWith('/api/v1/')) {
          if (request.method === 'OPTIONS') return await fulfill(204, 'text/plain', '');
          const [status, data] = api(request.method, url, request.headers, request.postData);
          return await fulfill(status, 'application/json', JSON.stringify(data));
        }
        if (url.origin === HOME && url.pathname === '/sdk/cloud-saves-v1.js' && db.blockSdk) return await p.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
        if (url.origin === GAME_ORIGIN) {
          if (request.method === 'OPTIONS') return await fulfill(204, 'text/plain', '');
          const rel = decodeURIComponent(url.pathname.replace('/SuperTurtleIdle-zh/', '')) || 'index.html';
          const file = path.join(ROOT, rel);
          if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return await fulfill(404, 'text/plain', 'not found');
          return await fulfill(200, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', fs.readFileSync(file));
        }
        await p.send('Fetch.continueRequest', { requestId }).catch(() => {});
      } catch (e) { await p.send('Fetch.continueRequest', { requestId }).catch(() => {}); }
    });
    await p.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });

    const inGame = expr => p.evalIn(GAME_ORIGIN, expr);
    const waitIn = async (expr, ms = 30000) => {
      const end = Date.now() + ms;
      for (;;) {
        try { if (await inGame(expr)) return true; } catch (e) { /* frame still loading */ }
        if (Date.now() > end) return false;
        await sleep(200);
      }
    };
    const booted = `typeof rpgPlayer !== 'undefined' && !document.getElementById('onlineCover') && document.getElementById('rpgTab') && document.getElementById('rpgTab').innerText.trim().length > 0 && document.getElementById('botonLeaderboard').style.display !== 'none'`;
    const open = async (user, extra = '') => { await p.goto(`${HOME}/__player?user=${user}${extra}`, 200); return waitIn(booted, 40000); };
    const bump = ms => inGame(`(() => { const real = window.__realNow || (window.__realNow = Date.now.bind(Date)); const shift = (window.__shift = (window.__shift || 0) + ${ms}); Date.now = () => real() + shift; return 1; })()`);
    const pushes = () => db.puts.length;
    const waitPut = async (n, ms = 20000) => { const end = Date.now() + ms; while (db.puts.length < n && Date.now() < end) await sleep(150); return db.puts.length >= n; };

    // MOTION=1: does a returning player's turtle still fight, die and come back?
    if (process.env.MOTION) {
      // The browser window has the focus and the page around the game holds it, as right after pressing Play.
      await p.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      const track = `(() => { window.__anims = 0; document.addEventListener('animationstart', e => { if (e.target.id === 'playerAnimation' && /playerAttack|gelatine/.test(e.animationName)) window.__anims++; }, true); return 1; })()`;
      const look = `({ anims: window.__anims, alive: rpgPlayer.alive, hp: Math.round(rpgPlayer.hp), max: Math.round(playerMaxHp), enemyHp: Math.round(currentHP), kills: stats.totalKills, src: document.getElementById('rpgPlayerImg').getAttribute('src').split('/').pop(), transform: document.getElementById('playerAnimation').style.transform })`;
      await open('u1');
      await inGame(`closePanels(); rpgPlayer.coins = 54321; 1`);
      await sleep(6000);
      await bump(120000);
      await inGame(`STI_ONLINE.saveNow(); 1`);
      await sleep(1500);
      check('Back from the cloud', (await open('u1')) && (await inGame(`rpgPlayer.coins`)) >= 54321);
      await inGame(`closePanels(); 1`); await inGame(track);
      await sleep(12000);
      const fighting = await inGame(look);
      check('A returning player\'s turtle attacks while the focus is outside the game', fighting.anims >= 3 && fighting.alive, fighting);
      const realFocus = await inGame(`Document.prototype.hasFocus.call(document)`);
      check('...which really is the case in this test', realFocus === false, { realFocus });
      await inGame(`rpgPlayer.hp = 0; playerUpdate && 0; enemyAttackCheck ? 0 : 0; rpgPlayer.alive = false; hpRegen(); window.__anims = 0; 1`);
      await sleep(12000);
      const dead = await inGame(look);
      console.log('      dead for 12 s:', JSON.stringify(dead));
      check('Dead: stays dead on its own, no attacks', !dead.alive && dead.anims === 0 && dead.src === 'dead.png', dead);
      await p.shot(path.join(SHOTS, 'dead-turtle.png'));
      await bump(120000);
      await inGame(`STI_ONLINE.saveNow(); 1`);
      await sleep(1500);
      await open('u1');
      await inGame(`closePanels(); 1`); await inGame(track);
      await sleep(2500);
      const reopened = await inGame(look);
      check('Saved while dead: still dead after reopening', !reopened.alive && reopened.src === 'dead.png', reopened);
      const clicks = await inGame(`(async () => { let n = 0; const img = document.getElementById('rpgPlayerImg'); while (!rpgPlayer.alive && n < 40) { img.click(); n++; await new Promise(r => setTimeout(r, 60)); } return n; })()`);
      await sleep(9000);
      const revived = await inGame(look);
      check('Clicking the turtle brings it back, and it fights again', revived.alive && revived.anims >= 2 && revived.src !== 'dead.png' && !revived.transform, { clicks, ...revived });
      const errs = [...new Set(p.errors)].filter(e => !/S2\.png|http 404|http 409|net::ERR_FAILED|Failed to load resource|network: /.test(e));
      check('No page errors', errs.length === 0, errs.slice(0, 6).map(e => String(e).split('\n').slice(0, 2).join(' ').slice(0, 200)));
      await p.close();
      const o = await launch({ root: path.resolve(ROOT, '..', '_reference', 'SuperTurtleIdle'), width: 1600, height: 900 });
      try {
        await o.goto('index.html', 4500);
        await o.eval(`closePanels(); ${track}`);
        await o.eval(`rpgPlayer.hp = 0; rpgPlayer.alive = false; hpRegen(); window.__anims = 0; 1`);
        await sleep(12000);
        const orig = await o.eval(look);
        check('The original game does the same: stays dead until clicked', !orig.alive && orig.anims === 0, orig);
      } finally { await o.close(); }
      const failedM = results.filter(r => !r).length;
      console.log(`\n${results.length - failedM} passed, ${failedM} failed`);
      process.exit(failedM ? 1 : 0);
    }

    // 0. Somebody else's progress is in this browser, in the plain game.
    await p.goto(GAME + '?lang=en', 300);
    await p.eval(`localStorage.setItem('saveData', ${JSON.stringify(DEV_SAVE)}); 1`);
    await p.goto(GAME + '?lang=en', 4500);
    const plain = await p.eval(`({ active: STI_ONLINE.active, coins: rpgPlayer.coins, cover: !!document.getElementById('onlineCover'), button: document.getElementById('botonLeaderboard').style.display, sdk: performance.getEntriesByType('resource').some(r => /cloud-saves/.test(r.name)) })`);
    check('Opened on its own: original behaviour, local save, no SDK, no leaderboard button', !plain.active && plain.coins > 1e6 && !plain.cover && plain.button === 'none' && !plain.sdk, plain);

    // 1. A new account starts fresh, not with what the browser holds.
    check('New account boots in the player', await open('u1'));
    let g = await inGame(`({ coins: rpgPlayer.coins, name: stats.turtleName, lang: GameI18n.locale, tab: document.getElementById('rpgTab').innerText.trim(), mem: localStorage.getItem('saveData') && JSON.parse(localStorage.getItem('saveData')).savedTotalSeconds })`);
    check('New account does not get the browser\'s other progress', g.coins < 1000, g);
    check('Language follows ?lang=', g.lang === 'zh', g.tab);

    // 2. Progress reaches the cloud, compressed, and comes back.
    await inGame(`rpgPlayer.coins = 54321; 1`);
    await bump(120000);
    let before = pushes();
    await inGame(`STI_ONLINE.saveNow(); 1`);
    check('Manual save uploads', await waitPut(before + 1));
    let last = db.puts[db.puts.length - 1];
    check('Upload is compressed and small', last && last.z === 1 && last.bytes < 30000, last);
    check('Summary is written for the platform', !!(last && /精通|Mastery/.test(last.note)), last && last.note);
    await open('u1');
    g = await inGame(`rpgPlayer.coins`);
    check('Reopening restores the cloud save', g >= 54321 && g < 60000, g);

    // 3. Upload frequency: the state changes every second, uploads must not.
    before = pushes();
    await sleep(65000);
    check('No uploads in the first minute of play, though the SDK checked twice', pushes() === before, { uploads: pushes() - before, sdkChecks: 2 });
    await bump(6 * 60000);
    check('A snapshot goes up once five minutes have passed', await waitPut(before + 1, 36000), { uploads: pushes() - before });
    const afterFive = pushes();
    await sleep(33000);
    check('...and only one', pushes() === afterFive, { uploads: pushes() - afterFive });

    // 4. Numbers the SDK would refuse as JSON values.
    await inGame(`rpgPlayer.coins = 1e30; 1`);
    await bump(120000);
    before = pushes();
    await inGame(`STI_ONLINE.saveNow(); 1`);
    check('Huge numbers save', await waitPut(before + 1));
    await open('u1');
    check('Huge numbers come back', (await inGame(`rpgPlayer.coins`)) >= 1e30);

    // 5. Closing the page keeps the last moment.
    await inGame(`rpgPlayer.coins = 4242; 1`);
    await sleep(300);
    await p.goto('about:blank', 400);
    await open('u1');
    g = await inGame(`rpgPlayer.coins`);
    check('Closing the page right after progress keeps it', g >= 4242 && g < 5000, g);

    // 6. Other accounts.
    check('Second account boots', await open('u2'));
    g = await inGame(`rpgPlayer.coins`);
    check('Second account does not get the first one\'s progress', g < 1000, g);
    await open('u1');
    g = await inGame(`rpgPlayer.coins`);
    check('First account still has its own', g >= 4242 && g < 5000, g);

    // 7. Importing a file: game path, then reload.
    before = pushes();
    await inGame(`localStorage.setItem('saveData', ${JSON.stringify(DEV_SAVE)}); STI_ONLINE.reload(); 1`);
    await sleep(1500);
    await waitIn(booted, 40000);
    g = await inGame(`({ coins: rpgPlayer.coins, debug: rpgPlayer.debug })`);
    check('Imported save survives its reload', g.coins > 1e6 && pushes() > before, { coins: g.coins, uploads: pushes() - before });

    // 8. Leaderboard. The dev save is flagged as a developer's, which must not reach the board.
    await inGame(`STI_ONLINE.openBoard(); 1`);
    await sleep(1500);
    check('A developer save sends no score', db.scores.length === 0, db.scores);
    await inGame(`rpgPlayer.debug = false; 1`);
    await sleep(1500);
    const score = await inGame(`Math.floor(window.stiMasteryScore)`);
    await inGame(`document.getElementById('botonLeaderboard').click(); 1`);
    await sleep(2000);
    check('Opening the board sends the score', db.scores.length === 1 && db.scores[0].score === score, { sent: db.scores, mastery: score });
    const panel = await inGame(`({ open: document.getElementById('leaderboard').style.display, rows: [...document.querySelectorAll('#boardList .boardRow')].map(r => r.innerText.replace(/\\s+/g, ' ')), pwned: !!window.pwned, img: !!document.querySelector('.boardName img'), title: document.querySelector('#leaderboard h1').innerText, button: document.getElementById('botonLeaderboard').innerText.trim() })`);
    check('Panel opens, translated, with the rows', panel.open === 'flex' && panel.rows.length === 3 && panel.title === '排行榜' && panel.button === '排行榜', panel);
    check('A player name holding markup stays text', !panel.pwned && !panel.img && panel.rows[1].includes('<img'));
    await p.shot(path.join(SHOTS, 'board-zh.png'));
    await inGame(`closePanels(); 1`);
    await inGame(`STI_ONLINE.openBoard(); 1`);
    await sleep(1200);
    check('Same score isn\'t sent twice', db.scores.length === 1, db.scores.length);
    await inGame(`closePanels(); stats.questsCompleted += 3; 1`);
    await sleep(2500);
    await inGame(`STI_ONLINE.openBoard(); 1`);
    await sleep(1500);
    check('A higher score is sent', db.scores.length === 2 && db.scores[1].score === score + 30, db.scores);
    await inGame(`closePanels(); 1`);

    // 9. Someone else wrote a newer save: the platform asks, and the player picks the cloud one.
    const other = JSON.parse(DEV_SAVE);
    other.savedPlayerData.coins = 777;
    db.saves.u1.save = { protocolVersion: 1, schemaVersion: 1, gameVersion: '1.1.0', summary: 'other device', data: { z: 0, save: JSON.stringify(other), last: null, note: 'other device' } };
    db.saves.u1.revision += 5;
    await bump(120000);
    await inGame(`rpgPlayer.coins = 11; STI_ONLINE.saveNow(); 1`);
    await sleep(1500);
    const statuses = await p.eval(`window.statuses.slice(-3)`);
    check('A conflict goes to the platform to decide', statuses.includes('conflict'), statuses);
    await p.eval(`window.command('use-cloud'); 1`);
    await sleep(1500);
    await waitIn(booted, 40000);
    g = await inGame(`rpgPlayer.coins`);
    check('Choosing the cloud copy replaces the running game', g >= 777 && g < 1000, g);

    // 10. Wiping progress must stick.
    before = pushes();
    await inGame(`deleteSave(); 1`);
    await sleep(1500);
    await waitIn(booted, 40000);
    g = await inGame(`rpgPlayer.coins`);
    check('Wiping progress sticks after its reload', g < 1000 && pushes() > before, { coins: g, uploads: pushes() - before });
    await open('u1');
    g = await inGame(`rpgPlayer.coins`);
    check('...and after reopening', g < 1000, g);

    // 11. A slow platform: nothing runs until it answers.
    await p.goto(`${HOME}/__player?user=u3&delay=9000`, 200);
    const covered = await waitIn(`!!document.getElementById('onlineCover')`, 6000);
    const coverText = covered ? await inGame(`document.getElementById('onlineCover').innerText`) : '';
    await sleep(3000);
    const held = await inGame(`({ seconds: stats.totalSeconds, cover: !!document.getElementById('onlineCover') })`);
    check('While waiting: cover up, in Chinese, game clock stopped', covered && /读取存档/.test(coverText) && held.cover && held.seconds === 0, { coverText, held });
    await p.shot(path.join(SHOTS, 'cover-zh.png'));
    check('Boots once the platform answers', await waitIn(booted, 30000));

    // 12. The SDK can't be reached: play on the browser's own save rather than get stuck.
    await p.send('Network.setCacheDisabled', { cacheDisabled: true });
    db.blockSdk = true;
    check('No SDK: still boots', await open('u1'));
    // Browsers keep an iframe's storage apart from the same site opened directly, so step 0's save isn't visible in here.
    // Without the SDK the game uses real storage, which is how to put another player's progress in this partition.
    await inGame(`localStorage.setItem('saveData', ${JSON.stringify(DEV_SAVE)}); 1`);
    await open('u1');
    g = await inGame(`rpgPlayer.coins`);
    check('No SDK: uses this browser\'s save', g > 1e6, g);
    db.blockSdk = false;
    check('Back online, an account that has never played boots', await open('u5'));
    g = await inGame(`({ coins: rpgPlayer.coins, real: Storage.prototype.getItem.call(localStorage, 'nothing'), stored: Object.keys(localStorage).includes('saveData') })`);
    check('...without the progress this browser holds for somebody else', g.coins < 1000 && g.stored, g);
    const u1Coins = (await open('u1'), await inGame(`rpgPlayer.coins`));
    check('...and an existing account gets its own save, not the browser\'s', u1Coins < 1000, u1Coins);

    // 13. Guests keep progress on this device, without uploads.
    await open('u1');
    await p.goto('about:blank', 500);
    const guestUploads = () => db.puts.filter(x => x.user === 'guest' || !x.user || x.user === 'undefined').length;
    check('Guest boots', await open('guest'));
    await inGame(`rpgPlayer.coins = 2222; 1`);
    await bump(120000);
    await inGame(`STI_ONLINE.saveNow(); 1`);
    await sleep(1200);
    await open('guest');
    g = await inGame(`rpgPlayer.coins`);
    check('Guest progress stays on the device', g >= 2222 && g < 3000 && guestUploads() === 0, { coins: g, uploads: guestUploads() });

    // 14. Logging in after playing as a guest: never imported silently, the platform asks.
    await p.goto(`${HOME}/__player?user=u4`, 200);
    await sleep(4000);
    const asked = await p.eval(`window.statuses.slice(-2)`);
    const waiting = await inGame(`!!document.getElementById('onlineCover')`);
    check('Guest progress isn\'t merged into an account silently: the platform asks, the game waits', asked.includes('conflict') && waiting, { asked, waiting });
    await p.eval(`window.command('use-local'); 1`);
    await sleep(1000);
    check('Choosing to bring it along boots with that progress', await waitIn(booted, 30000));
    g = await inGame(`rpgPlayer.coins`);
    check('...on the account', g >= 2222 && g < 3000 && db.saves.u4 && db.saves.u4.revision > 0, { coins: g, revision: db.saves.u4 && db.saves.u4.revision });

    const errs = [...new Set(p.errors)].filter(e => !/S2\.png|http 404|http 409|net::ERR_FAILED|Failed to load resource|network: /.test(e));
    check('No page errors', errs.length === 0, errs.slice(0, 8).map(e => String(e).split('\n').slice(0, 2).join(' ').slice(0, 200)));
  } finally { await p.close(); }
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
