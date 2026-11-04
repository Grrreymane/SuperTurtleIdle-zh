#!/usr/bin/env node
// Find English that is still on screen in Chinese mode.
//   node tools/i18n/harvest.cjs [dev/A4C - pre boss.json]   -> i18n/_work/misses.json
//
// Part 1 (data): every table's descriptions are actually evaluated, the way the game does it, and split into text nodes.
// Part 2 (play): loads a late-game dev save, opens every tab, hovers every element, and scans what got drawn.
const fs = require('fs'), path = require('path');
const { launch } = require('./browser.cjs');
const ROOT = path.join(__dirname, '..', '..');
const SAVE = process.argv[2] || 'dev/A4C - pre boss.json';

const TABLES = ['enemies', 'items', 'buffs', 'areas', 'quests', 'recipes', 'jobs', 'jobPanels', 'shopItems', 'logs', 'rpgClass', 'mail', 'aRank', 'talent',
  'buildings', 'research', 'showdown', 'skirmish', 'shopHonor', 'plants', 'fertiliser', 'gardenShop', 'gametip', 'itemsOfTheDay', 'titles', 'containers'];
const CODE_FIELDS = ['use', 'effect', 'logic', 'lockedLogic', 'stats', 'remove', 'harvest', 'sell', 'statUp', 'img', 'icon', 'image', 'color', 'hue', 'position', 'align', 'parent', 'cast', 'attackChance', 'item', 'drop', 'area', 'tag', 'series'];

const pageLib = `
window.__miss = window.__miss || new Map();
window.__note = function (raw, where) {
  const s = String(raw).trim();
  if (!s || !/[A-Za-z]{2}/.test(s) || /[\\u3400-\\u9fff]/.test(s)) return;
  const q = /^"([\\s\\S]*)"$/.exec(s);
  const t = GameI18n.translate(s);
  if (t !== s && !(q && t === '“' + q[1] + '”')) return;
  const e = __miss.get(s) || { n: 0, where };
  e.n++; __miss.set(s, e);
};
window.__scanHtml = function (html, where) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const w = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) __note(w.currentNode.data, where);
};
window.__scanDom = function (root, where) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode, p = n.parentElement;
    if (!p || p.closest('script,style,[data-game-language],[data-no-translate]')) continue;
    __note(n.data, where);
  }
  root.querySelectorAll && root.querySelectorAll('[title],[placeholder],[alt],[aria-label]').forEach(el => {
    for (const a of ['title', 'placeholder', 'aria-label']) if (el.hasAttribute(a)) __note(el.getAttribute(a), where + ' @' + a);
  });
};
`;

const DISPLAY_FIELDS = ['name', 'description', 'flavor', 'skills', 'bestiarySkills', 'bestiaryItem', 'hint', 'objective', 'reward', 'title', 'body', 'sender',
  'quality', 'armorTier', 'tierArmorBonus', 'lockedCondition', 'unlockDescription', 'catalogue', 'catalogue2', 'info', 'text', 'label'];

const dataPass = `(async () => {
  const show = new Set(${JSON.stringify(DISPLAY_FIELDS)});
  let values = 0, evalErrors = 0;
  for (const name of ${JSON.stringify(TABLES)}) {
    let table; try { table = eval(name); } catch { continue; }
    const walk = (o, depth, path) => {
      if (!o || typeof o !== 'object' || depth > 3) return;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === 'string') {
          if (!show.has(k)) continue;
          values++;
          let html = v;
          // Fields stored as JS source, evaluated the way the game itself does it.
          if (/^\\s*['"\`]/.test(v) && /['"\`]\\s*\\+|\\+\\s*['"\`]/.test(v) || /^\\s*'[\\s\\S]*'\\s*$/.test(v) || /^\\s*[a-zA-Z_]+\\(/.test(v) || (k === 'bestiaryItem' || k === 'reward') && /[(+]/.test(v)) {
            try { html = String(eval(v)); } catch { evalErrors++; continue; }
          }
          __scanHtml(html, name + '.' + k);
        } else if (typeof v === 'object') walk(v, depth + 1, path + '.' + k);
      }
    };
    walk(table, 0, name);
  }
  return { values, evalErrors, misses: __miss.size };
})()`;

// Clicks and hovers everything that looks safe. Runs in a throwaway browser profile.
const playPass = `(async () => {
  const danger = /delete|wipe|reset|import|export|window\\.open|location|hardReset|prestige|ascend|sell|logout/i;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hoverAll = async (where) => {
    const els = [...document.querySelectorAll('body *')].filter(e => e.offsetParent !== null && e.children.length < 40).slice(0, 2500);
    let n = 0;
    for (const e of els) {
      try {
        e.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
        e.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        for (const id of ['tooltip', 'tooltip2', 'tooltipMagic']) { const t = document.getElementById(id); if (t && t.style.display !== 'none') __scanDom(t, 'tooltip:' + where); }
        e.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
      } catch {}
      if (++n % 200 === 0) await sleep(0);
    }
    return n;
  };
  window.confirm = () => false; window.alert = () => {}; window.prompt = () => null; window.open = () => null;
  const log = [];
  const startLen = __miss.size;
  // Unlock everything a save hasn't reached yet: this profile is thrown away.
  try { for (const k of Object.keys(unlocks)) unlocks[k] = true; } catch {}
  const nav = NAV_IDS.map(id => document.getElementById(id)).filter(el => el && !danger.test(el.id));
  nav.forEach(el => { el.style.removeProperty('display'); el.classList.remove('gearButtonLocked'); });
  log.push('nav ' + nav.length + ' of ' + NAV_IDS.length);
  let hovered = 0;
  for (const el of nav) {
    try { el.click(); } catch {}
    await sleep(120);
    __scanDom(document.body, 'tab');
    hovered += await hoverAll(el.id);
  }
  log.push('hovered ' + hovered);
  // Every other button once, for panels that only exist after a click.
  const others = [...document.querySelectorAll('button,[onclick]')].filter(el => el.offsetParent !== null && !danger.test((el.getAttribute('onclick') || '') + ' ' + (el.id || '')));
  log.push('others ' + others.length);
  for (const el of others.slice(0, 600)) { try { el.click(); } catch {} await sleep(6); __scanDom(document.body, 'click'); }
  await sleep(500);
  __scanDom(document.documentElement, 'final');
  return { log, newMisses: __miss.size - startLen, total: __miss.size };
})()`;

(async () => {
  const p = await launch({ root: ROOT, width: 1600, height: 900 });
  try {
    await p.addInit(pageLib);
    await p.goto('index.html?lang=zh', 3500);
    console.log('data pass', await p.eval(dataPass));
    const save = fs.readFileSync(path.join(ROOT, SAVE), 'utf8');
    await p.eval(`localStorage.setItem('saveData', ${JSON.stringify(save)}); __dataMiss = [...__miss.entries()]; sessionStorage.setItem('__dataMiss', JSON.stringify(__dataMiss)); 1`);
    await p.goto('index.html?lang=zh', 6000);
    p.errors.length = 0;
    console.log('save loaded', await p.eval(`({ coins: typeof rpgPlayer !== 'undefined' ? rpgPlayer.coins : null, level: typeof rpgPlayer !== 'undefined' ? rpgPlayer.level : null, area: typeof stats !== 'undefined' ? stats.currentArea : null })`));
    await p.eval(`for (const [k, v] of JSON.parse(sessionStorage.getItem('__dataMiss'))) __miss.set(k, v); 1`);
    // Tabs are bound with addEventListener, so their ids come from the source.
    const navIds = new Set();
    for (const f of ['main.js', 'rpg.js', 'garden.js', 'job.js', 'logs.js', 'garrison.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const m of src.matchAll(/\b(?:tabSwitch|changeRPGTab|changeSkillTab)\(\s*["']([A-Za-z0-9_]+)["']/g)) navIds.add(m[1]);
      for (const m of src.matchAll(/did\(\s*["']([A-Za-z0-9_]+)["']\s*\)\.addEventListener\(\s*["']click["']/g)) navIds.add(m[1]);
    }
    console.log('play pass', await p.eval(`const NAV_IDS = ${JSON.stringify([...navIds])}; ` + playPass));
    const misses = await p.eval(`[...__miss.entries()].map(([text, e]) => ({ text, n: e.n, where: e.where }))`);
    misses.sort((a, b) => b.n - a.n);
    fs.writeFileSync(path.join(ROOT, 'i18n', '_work', 'misses.json'), JSON.stringify(misses, null, 1));
    const errs = [...new Set(p.errors)];
    console.log('page errors during play:', errs.length); console.log(errs.slice(0, 12).map(s => String(s).split('\n')[0].slice(0, 160)).join('\n'));
    console.log('misses', misses.length);
    console.log(misses.slice(0, 80).map(m => `${m.n}\t${m.where}\t${m.text.slice(0, 110).replace(/\n/g, ' ')}`).join('\n'));
  } finally { await p.close(); }
})().catch(e => { console.error(e); process.exit(1); });
