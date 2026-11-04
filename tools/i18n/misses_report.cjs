// Filter i18n/_work/misses.json down to what a player could actually read. Prints in groups.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const misses = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', '_work', 'misses.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'patreon.js'), 'utf8');
const patrons = new Set([...src.matchAll(/"([^"]+)"/g)].map(m => m[1]));
const phrases = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', '_work', 'phrases.json'), 'utf8')).map(p => [p.text, p]));
const dropped = new Set();
for (const f of ['base.json', 'extra.json']) {
  for (const [en, zh] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', '_work', f), 'utf8')))) if (zh === null) dropped.add(en);
}
const NON_DISPLAY_FIELDS = /\.(sort|armoryState|state|crafting|type|id|attacking|class|element|statUp|parentUpgrade|tab|target|panel|rarity|unlocked|cooldown|hidden|status|mode|active|location|lock|locked|req|requirement|container|gatherType|job|panelType|bestiary|bestiaryTab|sound)$/;
const isDataNoise = m => /^[a-z]+\.[a-zA-Z0-9]+$/.test(m.where) && (NON_DISPLAY_FIELDS.test(m.where) || /^[a-z][a-zA-Z0-9_]*$/.test(m.text) || /^[A-Z]\d+[A-Z]*$/.test(m.text));
const keep = misses.filter(m => !patrons.has(m.text) && !dropped.has(m.text) && !isDataNoise(m)
  && !/^(eeee+|texto|dONT|false|true|null|undefined|Patreon|Ko-Fi|Dev)$/i.test(m.text) && !/^\{?texto|^Talar madera|^Aqui van los|^modo diablo/i.test(m.text));
fs.writeFileSync(path.join(ROOT, 'i18n', '_work', 'misses_clean.json'), JSON.stringify(keep, null, 1));
const groups = {};
for (const m of keep) { const g = m.where.split(/[.:@ ]/)[0]; (groups[g] = groups[g] || []).push(m); }
console.log('clean misses', keep.length, 'of', misses.length, Object.entries(groups).map(([k, v]) => `${k}:${v.length}`).join(' '));
for (const m of keep.slice(0, +process.argv[2] || 200)) console.log(`${m.where.slice(0, 22)}\t${m.text.slice(0, 120).replace(/\n/g, ' ')}`);
