#!/usr/bin/env node
// Turn the translation work files into what ships and what gets uploaded.
//
//   node tools/i18n/build.cjs
//     i18n/zh.json            master dictionary, English -> Chinese. Edit here for later fixes.
//     i18n/zh.js              the same dictionary for the game (window.STI_ZH)
//     i18n/phrases/en.json    AIWANNA "by source text" original, p.<sha256> -> English
//     i18n/phrases/zh.json    AIWANNA translation
//
// AIWANNA takes at most 2000 entries / 400,000 bytes per file, so the platform copy holds what players see
// the most and the rest stays in the bundled dictionary. Both are used at runtime; platform edits win.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const WORK = path.join(ROOT, 'i18n', '_work');
const MAX_KEYS = 2000, MAX_BYTES = 400000;

const holes = s => (s.match(/\{\d+\}/g) || []).slice().sort().join(',');
const dict = new Map();   // en -> zh
const problems = [], dropped = [];

// Terms the translation batches rendered differently: one spelling everywhere.
const NORMALIZE = [
  [/邪咒|咒缚/g, '诅咒'], [/花之力/g, '花力'], [/(?<!乌)龟机器人/g, '乌龟机器人'], [/祈愿/g, '愿望'], [/天文馆/g, '星象馆'],
  [/公会工事|公会工作/g, '公会事务'], [/魔鬼鱼/g, '恶魔鱼'], [/苦痛/g, '灾厄'], [/摸摸威力/g, '摸摸力'], [/突变/g, '变异'],
];

function add(en, zh, from) {
  if (zh === null || zh === undefined || zh === '') { dropped.push(en); return; }
  if (typeof zh !== 'string') return problems.push(`${from}: not a string: ${en}`);
  zh = zh.trim();
  for (const [re, to] of NORMALIZE) zh = zh.replace(re, to);
  if (holes(en) !== holes(zh)) return problems.push(`${from}: placeholders differ: "${en}" -> "${zh}"`);
  if (zh === en) return;
  if (zh.length > 2000) return problems.push(`${from}: too long: ${en}`);
  dict.set(en, zh);
}

// base.json: the translated batches. extra.json: later additions and hand fixes, which win. Both English -> Chinese, null = not display text.
const phrases = JSON.parse(fs.readFileSync(path.join(WORK, 'phrases.json'), 'utf8'));
const seen = new Set();
for (const f of ['base.json', 'extra.json']) {
  const file = path.join(WORK, f);
  if (!fs.existsSync(file)) continue;
  // Numeric entities (&#128220 and friends) reach the DOM as the character itself.
  const entities = s => typeof s === 'string' ? s.replace(/&#(\d+);?/g, (_, n) => String.fromCodePoint(+n)) : s;
  for (const [raw, zh] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) { const en = entities(raw); seen.add(en); dict.delete(en); add(en, entities(zh), f); }
}
const missing = phrases.filter(p => !seen.has(p.text));

// Decoration around translated text, resolved by the script's {0} recursion. Literal parts are not words, so these stay out of the platform file.
const WRAP = {
  '"{0}"': '“{0}”', '❖ {0}': '❖ {0}', '❖ {0}': '❖ {0}', '★ {0}': '★ {0}', '{0} ✔️': '{0} ✔️', '{0} 💀': '{0} 💀', '👤 {0}': '👤 {0}',
  '✦── {0} ──✦': '✦── {0} ──✦', '{0} x{1}': '{0} x{1}', '{0} up to {1}': '{0}，最高 {1}',
  '“ {0} ”': '“{0}”', '{0}⚠️': '{0}⚠️', '🔒 {0}': '🔒 {0}',
};
const all = { ...Object.fromEntries([...dict.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en'))) };
// Some stat lines are written with &nbsp; after the bullet, and the script matches inner spaces exactly.
const NBSP = Object.fromEntries(Object.entries(all).filter(([en]) => en.startsWith('❖ ')).map(([en, zh]) => ['❖ ' + en.slice(2), zh.replace(/^❖ /, '❖ ')]));

fs.writeFileSync(path.join(ROOT, 'i18n', 'zh.json'), JSON.stringify(all, null, 1));
// Talent descriptions are quoted JS that gets eval'd, so a sentence split around an icon loses its opening or closing quote on screen.
const UNQUOTED = {};
for (const [en, zh] of Object.entries(all)) {
  if (en.startsWith('"') !== en.endsWith('"')) UNQUOTED[en.replace(/^"|"$/g, '').trim()] = zh.replace(/^["“]|["”]$/g, '').trim();
}
// Browser tab titles: {0} is a reminder icon that is usually empty, which leaves just the text.
const TITLES = {};
for (const [en, zh] of Object.entries(all)) {
  const m = /^\{0\} ([A-Z][^{}]*)$/.exec(en);
  if (m && !all[m[1]]) TITLES[m[1]] = zh.replace(/^\{0\}\s*/, '');
}
fs.writeFileSync(path.join(ROOT, 'i18n', 'zh.js'), 'window.STI_ZH=' + JSON.stringify({ ...TITLES, ...UNQUOTED, ...all, ...NBSP, ...WRAP }) + ';\n');

// Platform copy, most-seen first: fixed interface and UI code, then names, then short text.
const firstFile = new Map(phrases.map(p => [p.text, p.at.split(':')[0]]));
const kindOf = new Map(phrases.map(p => [p.text, p.k]));
const isChangelog = en => firstFile.get(en) === 'index.html' && /^(Added|Removed|Reworked|Fixed|Changed|Improved|Rebalanced)\b/.test(en);
const rank = en => {
  const f = firstFile.get(en), k = kindOf.get(en);
  if (isChangelog(en)) return 6;
  if (f && f !== 'gameObjects.js') return 0;
  if (k === 'name') return 1;
  if (k === 'description' || k === 'skills' || k === 'hint' || k === 'objective') return 2;
  if (k === 'flavor') return 4;
  return 3;
};
const ordered = [...dict.keys()].sort((a, b) => rank(a) - rank(b) || a.length - b.length);
const id = en => 'p.' + crypto.createHash('sha256').update(en.trim(), 'utf8').digest('hex');
const enOut = {}, zhOut = {};
let enBytes = 2, zhBytes = 2, count = 0;
const entry = (k, v) => Buffer.byteLength(JSON.stringify(k) + ':' + JSON.stringify(v) + ',');
for (const en of ordered) {
  if (count >= MAX_KEYS) break;
  const k = id(en), zh = dict.get(en);
  const a = entry(k, en), b = entry(k, zh);
  if (enBytes + a > MAX_BYTES - 2000 || zhBytes + b > MAX_BYTES - 2000) continue;
  enOut[k] = en; zhOut[k] = zh; enBytes += a; zhBytes += b; count++;
}
fs.mkdirSync(path.join(ROOT, 'i18n', 'phrases'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'i18n', 'phrases', 'en.json'), JSON.stringify(enOut, null, 0));
fs.writeFileSync(path.join(ROOT, 'i18n', 'phrases', 'zh.json'), JSON.stringify(zhOut, null, 0));

console.log({ phrases: phrases.length, translated: dict.size, dropped: dropped.length, untouched: missing.length, platformEntries: count, platformBytes: { en: enBytes, zh: zhBytes }, bundleKB: Math.round(fs.statSync(path.join(ROOT, 'i18n', 'zh.js')).size / 1024) });
if (problems.length) { console.log(`\n${problems.length} problems:`); console.log(problems.slice(0, 60).join('\n')); process.exitCode = 1; }
if (missing.length && process.argv.includes('--missing')) console.log('\nuntranslated:\n' + missing.map(p => JSON.stringify(p.text)).join('\n'));
