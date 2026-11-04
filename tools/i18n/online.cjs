#!/usr/bin/env node
// Which language does the game open in?
//   node tools/i18n/online.cjs           the live game, then the AIWANNA page in all its site languages
//   node tools/i18n/online.cjs --local   this working copy only
const path = require('path'), fs = require('fs');
const { launch } = require('./browser.cjs');
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'i18n', '_work', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const LIVE = 'https://grrreymane.github.io/SuperTurtleIdle-zh/';
const PAGE = 'https://www.aiwanna.games/games/game-59113b06fffd7876';
const local = process.argv.includes('--local');

// browser language, saved choice, ?lang=, expected game language
const CASES = [
  ['en-US', null, 'zh', 'zh'],    // Chinese site, English browser
  ['zh-CN', null, 'en', 'en'],    // English site, Chinese browser
  ['zh-CN', null, 'ja', 'en'],    // other site languages open English, even in a Chinese browser
  ['zh-CN', null, 'ko', 'en'],
  ['zh-CN', null, 'es', 'en'],
  ['en-US', null, 'zh-Hant', 'zh'],
  ['zh-CN', 'zh', 'en', 'en'],    // the site wins over a choice saved earlier
  ['en-US', 'en', 'zh', 'zh'],
  ['en-US', 'zh', 'ja', 'en'],
  ['zh-CN', null, null, 'zh'],    // opened directly, without the site
  ['en-US', null, null, 'en'],
  ['ja-JP', null, null, 'en'],
  ['en-US', 'zh', null, 'zh'],    // opened directly, the saved choice applies
];

async function matrix(p, base) {
  let failed = 0;
  for (const [browser, saved, lang, want] of CASES) {
    await p.send('Network.setUserAgentOverride', { userAgent: await p.eval('navigator.userAgent'), acceptLanguage: browser });
    await p.goto(base, 300);
    await p.eval(`(() => { localStorage.clear(); ${saved ? `localStorage.setItem('1gp.game-language.super-turtle-idle', '${saved}');` : ''} return 1; })()`);
    await p.goto(`${base}${lang ? `?lang=${lang}` : ''}`, 1800);
    const got = await p.eval(`({ locale: GameI18n.locale, url: location.search, nav: navigator.language, tab: (document.getElementById('rpgTab') || {}).innerText, requests: performance.getEntriesByType('resource').map(r => r.name).filter(n => /\\/i18n\\/game-/.test(n)).length })`);
    const ok = got.locale === want && got.requests === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  browser ${browser.padEnd(5)}  saved ${String(saved).padEnd(4)}  ?lang=${String(lang).padEnd(7)}  -> ${got.locale} (want ${want})  "${String(got.tab).trim()}"  site requests ${got.requests}`);
  }
  return failed;
}

(async () => {
  const p = await launch({ root: ROOT, width: 1600, height: 900 });
  let failed = 0;
  try {
    failed += await matrix(p, local ? p.base + 'index.html' : LIVE);
    const errs = [...new Set(p.errors)].filter(e => !/S2\.png/.test(e));
    if (errs.length) { failed++; console.log('page errors:', errs.map(e => String(e).split('\n')[0].slice(0, 140)).slice(0, 6)); }
    if (!local) {
      // The site keeps its language in a cookie and opens games with ?lang=<site language>.
      for (const lang of ['zh', 'en', 'ja', 'ko', 'es']) {
        p.errors.length = 0;
        await p.send('Network.setCookie', { name: '1gp-language', value: lang, domain: 'www.aiwanna.games', path: '/', secure: true });
        await p.goto(PAGE, 3500);
        const h1 = await p.eval(`document.querySelector('h1') && document.querySelector('h1').innerText`);
        const played = await p.eval(`(() => { const b = [...document.querySelectorAll('button, a')].filter(e => e.offsetParent).find(e => /^\\s*(Play|开始玩|プレイ|플레이|Jugar|再生|遊ぶ|プレイする|시작|게임 시작)\\s*$/.test(e.innerText)); if (!b) return null; b.click(); return b.innerText.trim(); })()`);
        await p.sleep(9000);
        const frame = await p.eval(`[...document.querySelectorAll('iframe')].map(f => f.src).filter(s => /github\\.io/.test(s))[0] || null`);
        console.log(`site ${lang}: page "${h1}", pressed "${played}", frame ${frame}`);
        await p.shot(path.join(SHOTS, `play-${lang}.png`));
      }
    }
  } finally { await p.close(); }
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
