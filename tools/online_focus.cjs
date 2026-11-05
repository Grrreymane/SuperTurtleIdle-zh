#!/usr/bin/env node
// The turtle's attack animation only plays when document.hasFocus() is true. Inside the AIWANNA player that's about the
// iframe, not the browser window. This walks the real player, as a guest, through where the focus can be and counts the
// animations in each case. Read-only on the platform: a fresh guest sends no score and no cloud save.
//   node tools/online_focus.cjs
const fs = require('fs'), path = require('path');
const { launch } = require('./i18n/browser.cjs');
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'i18n', '_work', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PAGE = 'https://www.aiwanna.games/games/game-59113b06fffd7876', GAME_ORIGIN = 'https://grrreymane.github.io';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WATCH = 9000;

(async () => {
  const p = await launch({ root: ROOT, width: 1600, height: 900, args: ['--disable-site-isolation-trials', '--disable-features=IsolateOrigins,site-per-process'] });
  let failed = 0;
  const check = (name, ok, info) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(info)}`); };
  try {
    await p.send('Emulation.setFocusEmulationEnabled', { enabled: true });   // the browser window has the focus, as for a real player
    await p.send('Network.setCookie', { name: '1gp-language', value: 'zh', domain: 'www.aiwanna.games', path: '/', secure: true });
    await p.goto(PAGE, 3500);
    const inGame = expr => p.evalIn(GAME_ORIGIN, expr);
    const box = await p.eval(`(() => { const b = [...document.querySelectorAll('button, a')].filter(e => e.offsetParent).find(e => /^\\s*(Play|开始玩)\\s*$/.test(e.innerText)); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    const click = async (x, y) => {
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    };
    await click(box.x, box.y);                                                // a real click on the site's Play button
    const end = Date.now() + 45000;
    for (let ok = false; !ok && Date.now() < end; await sleep(400)) { try { ok = await inGame(`typeof rpgPlayer !== 'undefined' && !document.getElementById('onlineCover') && document.getElementById('botonLeaderboard').style.display !== 'none'`); } catch (e) { /* loading */ } }
    await inGame(`closePanels(); window.__starts = 0; document.addEventListener('animationstart', e => { if (e.target.id === 'playerAnimation') window.__starts++; }, true); 1`);
    const frame = await p.eval(`(() => { const f = [...document.querySelectorAll('iframe')].find(x => /github\\.io/.test(x.src)); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);

    const watch = async () => {
      await inGame(`window.__starts = 0; 1`);
      await sleep(WATCH);
      return inGame(`({ animations: window.__starts, hasFocus: document.hasFocus(), kills: stats.totalKills, enemyHp: Math.round(currentHP) })`);
    };
    const a = await watch();
    console.log('Just pressed Play, focus on the site page:', JSON.stringify(a));
    await p.shot(path.join(SHOTS, 'focus-after-play.png'));
    // A neutral spot inside the game: the sky above the fight.
    await click(frame.x + frame.w * 0.35, frame.y + 60);
    const b = await watch();
    console.log('Clicked inside the game:                 ', JSON.stringify(b));
    // The site's own bar above the game.
    await click(frame.x + frame.w / 2, 25);
    const c = await watch();
    console.log('Clicked the site\'s bar above the game:   ', JSON.stringify(c));
    check('Turtle moves right after pressing Play', a.animations >= 2, a);
    check('Turtle moves after clicking in the game', b.animations >= 2, b);
    check('Turtle keeps moving after clicking the site around it', c.animations >= 2, c);
  } finally { await p.close(); }
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
