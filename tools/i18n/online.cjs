#!/usr/bin/env node
// Check the live game: GitHub Pages directly, and the AIWANNA game page in both languages.
//   node tools/i18n/online.cjs [shotDir]
const path = require('path'), fs = require('fs');
const { launch } = require('./browser.cjs');
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.argv[2] || path.join(ROOT, 'i18n', '_work', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const LIVE = 'https://grrreymane.github.io/SuperTurtleIdle-zh/';
const PAGE = 'https://www.aiwanna.games/games/game-59113b06fffd7876';
(async () => {
  const p = await launch({ root: ROOT, width: 1600, height: 900 });
  try {
    for (const lang of ['zh', 'en']) {
      p.errors.length = 0;
      await p.goto(`${LIVE}?lang=${lang}`, 7000);
      const info = await p.eval(`(() => {
        const d = JSON.parse(GameI18n.getDictionaryJSON());
        const res = performance.getEntriesByType('resource').map(r => r.name);
        return { locale: GameI18n.locale, title: document.title, nav: document.getElementById('rpgTab') && document.getElementById('rpgTab').innerText.trim(),
          zhEntries: Object.keys(d.zh || {}).length, remote: res.filter(n => /\\/i18n\\/game-/.test(n)).map(n => n.split('/').pop()), sdk: res.some(n => /auto-i18n-v1/.test(n)), zhFont: res.some(n => /zh\\.woff2/.test(n)) };
      })()`);
      console.log(`live ?lang=${lang}`, JSON.stringify(info));
      console.log('   errors:', [...new Set(p.errors)].filter(e => !/S2\.png/.test(e)).map(e => String(e).split('\n')[0].slice(0, 140)));
      await p.shot(path.join(SHOTS, `online-${lang}.png`));
    }
    // The site keeps its language in a cookie and opens games with ?lang=<site language>.
    for (const lang of ['zh', 'en']) {
      p.errors.length = 0;
      await p.send('Network.setCookie', { name: '1gp-language', value: lang, domain: 'www.aiwanna.games', path: '/', secure: true });
      await p.goto(PAGE, 4000);
      const info = await p.eval(`({ title: document.title, h1: document.querySelector('h1') && document.querySelector('h1').innerText, text: document.body.innerText.replace(/\\s*\\n\\s*/g, ' / ').slice(0, 300) })`);
      console.log(`page ${lang}`, JSON.stringify(info));
      await p.shot(path.join(SHOTS, `page-${lang}.png`));
      // Press Play, and read the frame the site opened.
      const played = await p.eval(`(() => { const b = [...document.querySelectorAll('button, a')].find(e => /^\\s*(Play|开始游戏|开始玩|玩|开玩)\\s*$/.test(e.innerText) && e.offsetParent); if (!b) return false; b.click(); return b.innerText.trim(); })()`);
      await p.sleep(11000);
      const frame = await p.eval(`[...document.querySelectorAll('iframe')].map(f => f.src).filter(s => /github\\.io/.test(s))[0] || null`);
      console.log(`   play: ${played}, frame: ${frame}`);
      await p.shot(path.join(SHOTS, `play-${lang}.png`));
      console.log('   errors:', [...new Set(p.errors)].filter(e => !/S2\.png/.test(e)).map(e => String(e).split('\n')[0].slice(0, 140)).slice(0, 6));
    }
  } finally { await p.close(); }
})().catch(e => { console.error(e); process.exit(1); });
