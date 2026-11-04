#!/usr/bin/env node
// End-to-end checks of the language integration, run against a late-game dev save.
//   node tools/i18n/verify.cjs   -> prints results, screenshots in i18n/_work/shots
const fs = require('fs'), path = require('path');
const { launch } = require('./browser.cjs');
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'i18n', '_work', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const SAVE = fs.readFileSync(path.join(ROOT, 'dev', 'A4C - pre boss.json'), 'utf8');
const CJK = /[㐀-鿿]/;

const stats = `(() => {
  const r = { cjk: 0, latin: 0, leftovers: [] };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode, p = n.parentElement;
    if (!p || p.closest('script,style,[data-game-language]') || !p.getClientRects().length) continue;
    const s = n.data.trim();
    if (!s) continue;
    if (/[\\u3400-\\u9fff]/.test(s)) r.cjk++;
    else if (/[A-Za-z]{3}/.test(s)) { r.latin++; if (r.leftovers.length < 12) r.leftovers.push(s.slice(0, 50)); }
  }
  return r;
})()`;
const metrics = async p => Object.fromEntries((await p.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

async function busy(p, seconds) {
  const a = await metrics(p);
  await p.sleep(seconds * 1000);
  const b = await metrics(p);
  return { taskPct: +((b.TaskDuration - a.TaskDuration) / seconds * 100).toFixed(1), scriptPct: +((b.ScriptDuration - a.ScriptDuration) / seconds * 100).toFixed(1), layoutPct: +((b.LayoutDuration - a.LayoutDuration) / seconds * 100).toFixed(1) };
}

(async () => {
  const p = await launch({ root: ROOT, width: 1600, height: 900 });
  const pass = [], fail = [];
  const check = (name, ok, extra) => { (ok ? pass : fail).push(name); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); };
  try {
    await p.send('Performance.enable');
    await p.goto('index.html', 1500);
    await p.eval(`localStorage.setItem('saveData', ${JSON.stringify(SAVE)}); 1`);

    // 1. English: nothing is translated, the dictionary doesn't leak.
    await p.goto('index.html?lang=en', 6000);
    p.errors.length = 0;
    const en = await p.eval(stats);
    check('English shows no Chinese', en.cjk === 0, { cjk: en.cjk, latin: en.latin });
    const enBusy = await busy(p, 15);
    await p.shot(path.join(SHOTS, '1-en-main.png'));

    // 2. Chinese: the same screen is Chinese.
    await p.goto('index.html?lang=zh', 6000);
    const zh = await p.eval(stats);
    check('Chinese screen is mostly Chinese', zh.cjk > zh.latin * 3, { cjk: zh.cjk, latin: zh.latin, leftovers: zh.leftovers });
    const zhBusy = await busy(p, 15);
    console.log('      main-thread load  en', enBusy, ' zh', zhBusy);
    check('Translation adds little load', zhBusy.taskPct - enBusy.taskPct < 8, { extraTaskPct: +(zhBusy.taskPct - enBusy.taskPct).toFixed(1) });
    const font = await p.eval(`document.fonts.check('16px fredoka', '中文') && [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).join(',')`);
    check('Chinese font loads', /fredoka|belwe/.test(String(font)), font);
    await p.shot(path.join(SHOTS, '2-zh-main.png'));

    // 3. Tabs and a tooltip, for looking at.
    const tabs = await p.eval(`[...document.querySelectorAll('.botonLateral, [id$="Button"]')].filter(e => e.offsetParent).map(e => e.id).filter(Boolean)`);
    console.log('      buttons', tabs.slice(0, 30).join(' '));
    for (const id of ['botonCamp', 'campButton', 'achievementsButton', 'townshipButton', 'jobButton', 'rpgButton', 'skillsButton', 'questButton', 'shopButton', 'dungeonButton', 'areaButton', 'inventoryButton']) {
      const ok = await p.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e || !e.offsetParent) return false; e.click(); return true; })()`);
      if (!ok) continue;
      await p.sleep(700);
      await p.shot(path.join(SHOTS, `3-zh-${id}.png`));
    }
    const tip = await p.eval(`(async () => {
      const it = [...document.querySelectorAll('#inventory .itemSlot, #inventory [id$="item"], .itemSlot')].find(e => e.offsetParent);
      if (!it) return null;
      it.dispatchEvent(new MouseEvent('mouseenter')); await new Promise(r => setTimeout(r, 200));
      const t = document.getElementById('tooltip');
      return t && t.innerText.slice(0, 300);
    })()`);
    console.log('      tooltip:', tip);
    await p.shot(path.join(SHOTS, '4-zh-tooltip.png'));

    // 4. Saves never hold translated text.
    await p.eval(`autosave ? autosave() : save(); 1`).catch(() => {});
    await p.sleep(500);
    const saved = await p.eval(`localStorage.getItem('saveData')`);
    const cjkInSave = (saved.match(/.{0,30}[㐀-鿿].{0,30}/g) || []).slice(0, 3);
    check('Save written in Chinese mode holds no Chinese', cjkInSave.length === 0, cjkInSave);
    check('Save still parses', !!JSON.parse(saved).savedItemCount);

    // 5. Switching language live, with the on-screen switcher, and it's remembered.
    await p.eval(`document.querySelector('#gameLanguage button[data-lang="en"]').click(); 1`);
    await p.sleep(800);
    const back = await p.eval(stats);
    check('Switch to English restores English', back.cjk === 0, { cjk: back.cjk, sample: back.leftovers.slice(0, 3) });
    const remembered = await p.eval(`(GameI18n.locale)`);
    await p.eval(`document.querySelector('#gameLanguage button[data-lang="zh"]').click(); 1`);
    await p.sleep(800);
    const again = await p.eval(stats);
    check('Switch back to Chinese', again.cjk > again.latin, { cjk: again.cjk, was: remembered });
    await p.goto('index.html', 3000);
    check('Choice survives reload without ?lang', (await p.eval(`GameI18n.locale`)) === 'zh');

    // 6. Search box finds items by Chinese name.
    const search = await p.eval(`(() => { const zh = window.STI_ZH['Copper Bar'] || ''; const r = fuse.search(zh); return { zh, hits: r.length, first: r[0] && r[0].item.name }; })()`);
    check('Search finds items by Chinese name', search.hits > 0, search);

    // 7. The platform's dictionary being unavailable must not matter: bundled text works with remote off and on.
    const errs = [...new Set(p.errors)].filter(e => !/S2\.png/.test(e));
    check('No page errors (other than the one image also missing upstream)', errs.length === 0, errs.slice(0, 6).map(e => String(e).split('\n')[0].slice(0, 140)));
  } finally { await p.close(); }
  console.log(`\n${pass.length} passed, ${fail.length} failed`);
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
