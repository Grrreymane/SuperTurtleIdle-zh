#!/usr/bin/env node
// Check the published game inside the real AIWANNA player, as a guest (no account can be scripted).
// Read-only on the platform: a fresh guest has a Mastery of 0, so no score is sent and nothing reaches the cloud.
//   node tools/online_live.cjs
const fs = require('fs'), path = require('path');
const { launch } = require('./i18n/browser.cjs');
const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'i18n', '_work', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PAGE = 'https://www.aiwanna.games/games/game-59113b06fffd7876', GAME_ORIGIN = 'https://grrreymane.github.io';
(async () => {
  const p = await launch({ root: ROOT, width: 1600, height: 900, args: ['--disable-site-isolation-trials', '--disable-features=IsolateOrigins,site-per-process'] });
  let failed = 0;
  const check = (name, ok, info) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : ''}`); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const inGame = expr => p.evalIn(GAME_ORIGIN, expr);
  const requests = [];
  p.on('Network.requestWillBeSent', e => requests.push(`${e.request.method} ${e.request.url}`));
  try {
    for (const lang of ['zh', 'en']) {
      p.errors.length = 0;
      await p.send('Network.setCookie', { name: '1gp-language', value: lang, domain: 'www.aiwanna.games', path: '/', secure: true });
      await p.goto(PAGE, 3500);
      const played = await p.eval(`(() => { const b = [...document.querySelectorAll('button, a')].filter(e => e.offsetParent).find(e => /^\\s*(Play|开始玩)\\s*$/.test(e.innerText)); if (!b) return null; b.click(); return b.innerText.trim(); })()`);
      let booted = false;
      const end = Date.now() + 45000;
      while (Date.now() < end && !booted) {
        try { booted = await inGame(`typeof rpgPlayer !== 'undefined' && !document.getElementById('onlineCover') && document.getElementById('botonLeaderboard').style.display !== 'none'`); } catch (e) { /* frame loading */ }
        if (!booted) await sleep(500);
      }
      check(`${lang}: pressed "${played}", game boots in the real player`, booted);
      if (!booted) { await p.shot(path.join(SHOTS, `live-fail-${lang}.png`)); console.log('   status', await inGame(`window.AIWanna && AIWanna.saves && JSON.stringify(AIWanna.saves.getStatus())`).catch(e => e.message)); continue; }
      const state = await inGame(`({ active: STI_ONLINE.active, lang: GameI18n.locale, tab: document.getElementById('rpgTab').innerText.trim(), status: AIWanna.saves.getStatus().status, button: document.getElementById('botonLeaderboard').innerText.trim(), coins: rpgPlayer.coins })`);
      check(`${lang}: language and SDK`, state.active && state.lang === lang && ['local', 'synced'].includes(state.status), state);
      await inGame(`document.getElementById('botonLeaderboard').click(); 1`);
      await sleep(3500);
      const panel = await inGame(`({ open: document.getElementById('leaderboard').style.display, title: document.querySelector('#leaderboard h1').innerText, list: document.getElementById('boardList').innerText.trim().slice(0, 120), me: document.getElementById('boardMe').innerText.trim().slice(0, 120) })`);
      check(`${lang}: leaderboard opens and reads from the real API`, panel.open === 'flex' && panel.list.length > 0 && !/Couldn't|加载失败/.test(panel.list), panel);
      await p.shot(path.join(SHOTS, `live-board-${lang}.png`));
      const writes = requests.filter(r => /^(POST|PUT) /.test(r) && /\/api\/v1\/(runs|leaderboards\/.*\/runs|games\/.*\/saves)/.test(r));
      check(`${lang}: a fresh guest sent no score and no save`, writes.length === 0, writes);
      const errs = [...new Set(p.errors)].filter(e => !/S2\.png/.test(e));
      check(`${lang}: no errors`, errs.length === 0, errs.slice(0, 5).map(e => String(e).split('\n')[0].slice(0, 160)));
    }
  } finally { await p.close(); }
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
