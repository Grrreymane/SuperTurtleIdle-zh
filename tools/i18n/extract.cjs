#!/usr/bin/env node
// Static extraction of player-visible English from the game's source.
//
//   npm install --prefix tools acorn   (once)
//   node tools/i18n/extract.cjs        -> i18n/_work/phrases.json
//
// The platform's auto-i18n script translates DOM *text nodes*, so a phrase here is what one text node
// holds at runtime: string-building expressions are folded (literals + known icon constants), split at
// HTML tags, and anything computed becomes a {0} placeholder. patreon.js (supporter names) is skipped
// on purpose: those are people's handles, not game text.
'use strict';
const fs = require('fs'), path = require('path');
const acorn = require(path.join(__dirname, '..', 'node_modules', 'acorn'));

const ROOT = path.join(__dirname, '..', '..');
const JS_FILES = ['gameObjects.js', 'spellList.js', 'main.js', 'rpg.js', 'garden.js', 'job.js', 'logs.js', 'garrison.js'];

// Calls whose string arguments are never shown to the player.
const SKIP_CALLS = new Set(['getElementById', 'did', 'querySelector', 'querySelectorAll', 'getElementsByClassName',
  'getElementsByTagName', 'getElementsByName', 'closest', 'matches', 'createElement', 'addEventListener', 'removeEventListener',
  'getAttribute', 'hasAttribute', 'removeAttribute', 'add', 'remove', 'toggle', 'contains', 'getItem', 'setItem', 'removeItem',
  'includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'replace', 'replaceAll', 'split', 'match', 'test', 'parse',
  'playSound', 'Audio', 'fetch', 'open', 'animate', 'setProperty', 'getPropertyValue', 'require', 'log', 'error', 'warn',
  'animParticleBurst', 'animState', 'voidAnimation', 'anim', 'particleBurst', 'moveElement', 'getContext', 'Image']);
// Fields holding ids, paths or styling rather than text. Fields holding code (use, effect, stats...) are parsed instead.
const SKIP_PROPS = new Set(['src', 'id', 'className', 'img', 'icon', 'image', 'background', 'backgroundImage', 'position', 'align',
  'parent', 'color', 'cursor', 'display', 'href', 'sound', 'animation', 'tag', 'attackChance', 'type', 'item', 'drop', 'area',
  'series', 'tab', 'unlock', 'logic', 'lockedLogic', 'statUp', 'hue', 'healthChance', 'level', 'sell', 'data', 'touch', 'parent2', 'defenseChance']);

const isPathy = s => /^(https?:|\/\/|\.\/|img\/|audio\/|font\/|src\/|#[0-9a-f]{3,8}\b|rgba?\(|url\(|var\()/i.test(s) || /\.(png|jpe?g|gif|mp3|webp|svg|js|css|json)\b/i.test(s);
const isCssy = s => (/^[a-z-]+\s*:\s*[^:]+;?\s*$/.test(s) && !/[A-Z]/.test(s)) || (/[{};]\s*$/.test(s) && /[:;{]/.test(s) && !/^[A-Z"]/.test(s));   // sentences may end in ; too
const isIdent = s => (/^[a-z][a-zA-Z0-9_$]*$/.test(s) && /[A-Z0-9_]/.test(s)) || /^[A-Z][A-Z0-9_]*\d+[A-Z0-9_]*$/.test(s) || /^[a-z0-9_-]+-[a-z0-9_-]+$/.test(s);

const decode = s => s.replace(/&#(\d+);?/g,(_, n) => +n === 39 ? "'" : String.fromCodePoint(+n)).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const HOLE = '';
const HOLE_RE = new RegExp(HOLE, 'g');

const JUNK = /^(texto( texto)*|Talar madera.*|eeee+|lorem.*)$/i;
const out = new Map();   // phrase -> { files:Set, ctx, line, sent }
function record(text, file, line, ctx, folded, sent) {
  let s = decode(text).replace(/ /g, ' ').trim();
  if (!s) return;
  // Wrapping double quotes are display decoration: one "{0}" pattern in the dictionary handles them all.
  const q = /^"([\s\S]*)"$/.exec(s);
  if (q && q[1].trim()) s = q[1].trim();
  let n = 0;
  s = s.replace(HOLE_RE, () => `{${n++}}`);
  const letters = s.replace(/\{\d+\}/g, '');
  if (!/[A-Za-z]{2}/.test(letters) || JUNK.test(s)) return;  // numbers, punctuation, single-letter units, dev placeholders
  if (/[<>=!&|]=?\s*\d|\w\.\w+\.\w|^\w+\.\w+$|\(\)$/.test(s) && !/\s[a-z]+\s/.test(s)) return;   // leftover code such as rpgClass.TG0.level>59
  if (s.length > 1900 || isPathy(s) || isCssy(letters.trim()) || isIdent(s)) return;   // test the text without {0}: a trailing } is not CSS
  // A lone lowercase word from a plain literal is almost always an id ('none', 'hidden', 'day').
  if (!folded && /^[a-z]+$/.test(s)) return;
  if (/^(function |return |var |let |const |document\.|window\.|this\.)/.test(s)) return;
  const e = out.get(s) || { files: new Set(), ctx: ctx ? ctx.slice(0, 300) : '', line: `${file}:${line}`, sent };
  e.files.add(file);
  out.set(s, e);
}

// Split a folded string the way the browser would: every run between tags is one text node.
const segments = joined => joined.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ').split(/<[^>]*>/);
const hasTags = s => /<[a-zA-Z\/][^>]*>/.test(s);

const constants = new Map();
const markupFns = new Set();

// A function whose return value holds tags is markup when it appears inside a sentence: the browser
// splits the sentence around it, so it is a text-node boundary rather than a {0}.
function findMarkupFns(file) {
  const ast = acorn.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' });
  const hasTagLiteral = n => {
    if (!n || typeof n !== 'object') return false;
    if (Array.isArray(n)) return n.some(hasTagLiteral);
    if (n.type === 'Literal' && typeof n.value === 'string' && /<[a-zA-Z\/]/.test(n.value)) return true;
    if (n.type === 'TemplateElement' && /<[a-zA-Z\/]/.test(n.value.cooked || '')) return true;
    if (n.type === 'Identifier' && /Icon$/.test(n.name)) return true;
    for (const k of Object.keys(n)) if (k !== 'type' && hasTagLiteral(n[k])) return true;
    return false;
  };
  const walk = (n, fn) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(x => walk(x, fn));
    if (n.type === 'FunctionDeclaration' && n.id) fn = n.id.name;
    if (n.type === 'ReturnStatement' && fn && hasTagLiteral(n.argument)) markupFns.add(fn);
    for (const k of Object.keys(n)) if (k !== 'type') walk(n[k], fn);
  };
  walk(ast, null);
}

function run(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const lines = src.split('\n');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true });

  // File-scope string constants (icon snippets): treated as part of the literal, not as a hole.
  for (const st of ast.body) if (st.type === 'VariableDeclaration') for (const d of st.declarations) {
    if (d.id.type === 'Identifier' && d.init && d.init.type === 'Literal' && typeof d.init.value === 'string' && /</.test(d.init.value)) constants.set(d.id.name, d.init.value);
  }

  // Many data fields are JS source in a string, run later with eval():
  //   description = `'Equipable<br>'+rUpgLvl("I78")+'<br>+'+beautify(x)+' Damage'`,  use = 'logPrint("Hi"); gain(1)'
  function embedded(str, outer) {
    const s = str.trim();
    if (!/[()=;+'"`]/.test(s)) return null;
    let parsed;
    try { parsed = acorn.parse(s, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true }); } catch { return null; }
    if (!parsed.body.length) return null;
    const relocate = n => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(relocate);
      if (typeof n.type === 'string') { n.loc = outer.loc; for (const k of Object.keys(n)) if (k !== 'loc') relocate(n[k]); }
    };
    relocate(parsed);
    const first = parsed.body[0];
    if (parsed.body.length === 1 && first.type === 'ExpressionStatement') {
      const e = first.expression;
      if (e.type === 'Literal' && typeof e.value === 'string') return s[0] === "'" ? { expr: e } : null;   // "..." is quoted display text
      if (e.type === 'TemplateLiteral') return { expr: e };
      if (e.type === 'BinaryExpression' && e.operator === '+') return /['"`]/.test(s) ? { expr: e } : null;
      if (e.type === 'CallExpression') {
        const c = e.callee;
        return c.type === 'MemberExpression' || (c.type === 'Identifier' && /^[a-z_$]/.test(c.name)) ? { program: parsed } : null;   // "Fire (burn)" is text
      }
      if (['AssignmentExpression', 'UpdateExpression', 'ConditionalExpression', 'LogicalExpression', 'SequenceExpression'].includes(e.type)) return { program: parsed };
      return null;                                                                                               // "Turtle", "Stone - Tier"
    }
    if (parsed.body.every(b => b.type === 'LabeledStatement' || b.type === 'EmptyStatement')) return null;       // "Use: Increases"
    return { program: parsed };
  }

  function flatten(node) {
    if (!node) return [];
    if (node.type === 'Literal' && typeof node.value === 'string') {
      const c = embedded(node.value, node);
      if (c && c.expr) return c.expr.type === 'Literal' ? [{ t: c.expr.value }] : flatten(c.expr);
      if (c && c.program) return [{ hole: c.program, silent: true }];
      return [{ t: node.value }];
    }
    if (node.type === 'Literal') return typeof node.value === 'number' ? [{ t: String(node.value) }] : [{ hole: node }];
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && markupFns.has(node.callee.name)) return [{ t: '<m>' }, { hole: node, silent: true, argsOnly: true }];
    if (node.type === 'TemplateLiteral') {
      if (!node.expressions.length) {
        const c = embedded(node.quasis[0].value.cooked || '', node);
        if (c && c.expr) return c.expr.type === 'Literal' ? [{ t: c.expr.value }] : flatten(c.expr);
        if (c && c.program) return [{ hole: c.program, silent: true }];
      }
      const r = [];
      node.quasis.forEach((q, i) => { r.push({ t: q.value.cooked || '' }); if (node.expressions[i]) r.push(...flatten(node.expressions[i])); });
      return r;
    }
    if (node.type === 'BinaryExpression' && node.operator === '+') return [...flatten(node.left), ...flatten(node.right)];
    if (node.type === 'Identifier' && constants.has(node.name)) return [{ t: constants.get(node.name) }];
    return [{ hole: node }];
  }
  const isBuilder = n => n && ((n.type === 'Literal' && typeof n.value === 'string') || n.type === 'TemplateLiteral' || (n.type === 'BinaryExpression' && n.operator === '+'));

  function take(node) {
    const parts = flatten(node);
    const joined = parts.map(p => p.silent ? '' : p.hole ? HOLE : p.t).join('');
    const multi = parts.length > 1 || hasTags(joined);
    const line = node.loc.start.line;
    const ctx = (lines[line - 1] || '').trim();
    const segs = segments(joined);
    // Fragments of one sentence: keep the whole line so the translator sees what surrounds them.
    const texts = segs.map(x => decode(x).trim()).filter(x => /[A-Za-z]{2}/.test(x));
    const sent = texts.length > 1 ? texts.join(' ▮ ').replace(HOLE_RE, '{}').slice(0, 280) : undefined;
    for (const seg of segs) {
      if (/\{[^}]*:[^}]*\}/.test(seg)) continue;
      record(seg, file, line, ctx, multi, sent);
    }
    for (const p of parts) if (p.hole) {
      if (p.argsOnly) p.hole.arguments.forEach(a => visit(a));
      else visit(p.hole);
    }
  }

  function visit(node) {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'Literal': case 'TemplateLiteral':
        if (isBuilder(node)) take(node);
        return;
      case 'BinaryExpression':
        if (node.operator === '+') return take(node);
        // Comparisons: the literal side is an id, keep looking only at the computed side.
        if (node.left.type !== 'Literal') visit(node.left);
        if (node.right.type !== 'Literal') visit(node.right);
        return;
      case 'SwitchCase':
        (node.consequent || []).forEach(visit);
        return;
      case 'MemberExpression':
        visit(node.object);
        if (node.computed && node.property.type !== 'Literal') visit(node.property);
        return;
      case 'Property':
        if (node.computed) visit(node.key);
        if (!(node.key && SKIP_PROPS.has(node.key.name || node.key.value))) visit(node.value);
        return;
      case 'AssignmentExpression': {
        const l = node.left;
        if (l.type === 'MemberExpression') {
          const name = !l.computed && l.property && l.property.name;
          const isStyle = l.object && l.object.type === 'MemberExpression' && l.object.property && l.object.property.name === 'style';
          visit(l);
          if (isStyle || (name && SKIP_PROPS.has(name))) return;
        }
        return visit(node.right);
      }
      case 'CallExpression': case 'NewExpression': {
        const c = node.callee;
        const name = c.type === 'MemberExpression' && !c.computed ? c.property.name : c.type === 'Identifier' ? c.name : '';
        visit(c);
        if (SKIP_CALLS.has(name)) return node.arguments.forEach(a => { if (!isBuilder(a)) visit(a); });
        if (name === 'setAttribute') {
          const [k, v] = node.arguments;
          if (k && k.type === 'Literal' && /^(title|placeholder|alt|aria-label)$/.test(k.value)) visit(v);
          return;
        }
        return node.arguments.forEach(visit);
      }
      default:
        for (const k of Object.keys(node)) {
          if (k === 'loc' || k === 'type' || k === 'start' || k === 'end') continue;
          const v = node[k];
          if (Array.isArray(v)) v.forEach(x => x && typeof x.type === 'string' && visit(x));
          else if (v && typeof v.type === 'string') visit(v);
        }
    }
  }
  ast.body.forEach(visit);
}

JS_FILES.forEach(findMarkupFns);
// Two passes so constants defined in gameObjects.js also fold in the files that use them.
for (const f of JS_FILES) run(f);
out.clear();
for (const f of JS_FILES) run(f);

// index.html: static markup and the attributes the platform script translates.
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ');
  // onclick etc. can hold '>' so drop event/style attributes before splitting at tags.
  const noAttrs = html.replace(/\s(on[a-z]+|style)\s*=\s*("[^"]*"|'[^']*')/gi, '');
  for (const seg of noAttrs.split(/<[^>]*>/)) record(seg, 'index.html', 0, '', true);
  for (const m of noAttrs.matchAll(/\s(?:title|placeholder|alt|aria-label)\s*=\s*"([^"]+)"/gi)) record(m[1], 'index.html', 0, '(attribute)', true);
}

const kindOf = ctx => { const m = /^\w+\.\w+\.(\w+)\s*=/.exec(ctx || ''); return m ? m[1] : undefined; };
const list = [...out.entries()].map(([text, e]) => ({ text, at: e.line, k: kindOf(e.ctx), sent: e.sent, files: [...e.files] }));
list.sort((a, b) => a.at.localeCompare(b.at, 'en', { numeric: true }));
const dir = path.join(ROOT, 'i18n', '_work');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'phrases.json'), JSON.stringify(list, null, 1));

const chars = list.reduce((a, p) => a + p.text.length, 0);
const words = list.reduce((a, p) => a + p.text.split(/\s+/).length, 0);
const holes = list.filter(p => /\{\d+\}/.test(p.text));
const byFile = {};
for (const p of list) { const f = p.at.split(':')[0]; byFile[f] = (byFile[f] || 0) + 1; }
console.log({ phrases: list.length, withPlaceholders: holes.length, words, chars, byFile, markupFns: markupFns.size });
if (process.argv.includes('--report')) {
  const clip = s => s.replace(/\n/g, ' ').slice(0, 105);
  const code = list.filter(p => /['"]\s*\+|\+\s*['"]|^[a-z]\w*\(|\w\("/.test(p.text));
  console.log('\ncode-like', code.length, '\n' + code.slice(0, 14).map(p => clip(p.text) + '   @' + p.at).join('\n'));
  console.log('\npatterns sample\n' + holes.filter((_, i) => i % Math.ceil(holes.length / 28) === 0).map(p => clip(p.text)).join('\n'));
  const thin = holes.filter(p => p.text.replace(/\{\d+\}/g, '').replace(/[^A-Za-z]/g, '').length < 5);
  console.log('\nthin', thin.length, thin.map(p => p.text).join(' | ').slice(0, 600));
  const glued = holes.filter(p => /^\{\d+\}[A-Za-z]/.test(p.text));
  console.log('\nglued-start', glued.length, glued.slice(0, 14).map(p => clip(p.text).slice(0, 48)).join(' | '));
  console.log('\nplain sample\n' + list.filter((_, i) => i % Math.ceil(list.length / 34) === 0).map(p => clip(p.text)).join('\n'));
  console.log('\nlongest', Math.max(...list.map(p => p.text.length)), ' over400:', list.filter(p => p.text.length > 400).length);
}
