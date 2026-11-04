#!/usr/bin/env node
// Turn the translation work files into what ships with the game.
//
//   node tools/i18n/build.cjs
//     i18n/zh.json   the merged dictionary, English -> Chinese, for reading (font.py uses it too)
//     i18n/zh.js     the same plus decoration patterns, for the game (window.STI_ZH)
'use strict';
const fs = require('fs'), path = require('path');
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

console.log({ phrases: phrases.length, translated: dict.size, dropped: dropped.length, untouched: missing.length, bundleKB: Math.round(fs.statSync(path.join(ROOT, 'i18n', 'zh.js')).size / 1024) });
if (problems.length) { console.log(`\n${problems.length} problems:`); console.log(problems.slice(0, 60).join('\n')); process.exitCode = 1; }
if (missing.length && process.argv.includes('--missing')) console.log('\nuntranslated:\n' + missing.map(p => JSON.stringify(p.text)).join('\n'));
