// Store materials for AIWANNA, all from the game's own art and real play.
//   node 1gp-kit/make_kit.cjs   -> cover.png (with the game's logo), cover_base.png (no text), shots/*.png
const fs = require('fs'), path = require('path');
const { launch } = require('../tools/i18n/browser.cjs');
const ROOT = path.join(__dirname, '..');
const KIT = __dirname;
fs.mkdirSync(path.join(KIT, 'shots'), { recursive: true });
const SAVE = fs.readFileSync(path.join(ROOT, 'dev', 'A4C - pre boss.json'), 'utf8');

const scene = logo => `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: #2a3d1c; }
  .bg { position: absolute; inset: 0; background: url(/img/src/areas/A1.png) center bottom / auto 100%; }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,.28) 100%); }
  .turtle { position: absolute; left: ${logo ? 90 : 350}px; bottom: 96px; width: ${logo ? 500 : 580}px; filter: drop-shadow(0 14px 10px rgba(0,0,0,.35)); }
  .logo { position: absolute; right: 56px; top: 96px; width: 600px; filter: drop-shadow(0 10px 12px rgba(0,0,0,.45)); }
</style><div class="bg"></div><div class="shade"></div>
<img class="turtle" src="/img/src/tortugasdefault/img1.png">
${logo ? '<img class="logo" src="/img/src/icons/tortulogo.png">' : ''}`;

(async () => {
  const p = await launch({ root: ROOT, width: 1280, height: 720 });
  try {
    for (const [name, logo] of [['cover.png', true], ['cover_base.png', false]]) {
      const html = Buffer.from(scene(logo)).toString('base64');
      await p.goto('index.html?lang=en', 300);
      await p.eval(`document.open(); document.write(atob(${JSON.stringify(html)}).split('').map(c => c).join('')); document.close(); 1`);
      await p.sleep(1000);
      await p.shot(path.join(KIT, name), { x: 0, y: 0, width: 1280, height: 720 });
    }
  } finally { await p.close(); }

  const g = await launch({ root: ROOT, width: 1600, height: 900 });
  try {
    await g.goto('index.html', 800);
    await g.eval(`localStorage.setItem('saveData', ${JSON.stringify(SAVE)}); 1`);
    // What a player sees: the debug bar belongs to the developer's save, and "Dev" was the developer's turtle.
    const dress = `(() => { rpgPlayer.debug = false; const d = document.getElementById('debugPanel'); if (d) d.style.display = 'none'; stats.turtleName = 'Jeffrey';
      for (const id of ['turtleName', 'turtleName2']) { const e = document.getElementById(id); if (e) e.textContent = 'Jeffrey'; } return 1; })()`;
    const hover = async sel => {
      const r = await g.eval(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(x => x.offsetParent)[0]; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
      if (!r) return false;
      await g.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x - 3, y: r.y - 3 });
      await g.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
      await g.sleep(500);
      return true;
    };
    for (const [lang, tag] of [['zh', 'zh'], ['en', 'en']]) {
      await g.goto(`index.html?lang=${lang}`, 5000);
      await g.eval(dress);
      await g.sleep(1800);
      await g.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
      await g.shot(path.join(KIT, 'shots', `${tag}-1-main.png`));
      const gear = await g.eval(`(() => { const ids = [...document.querySelectorAll('.itemSlot')].filter(e => e.offsetParent && e.getBoundingClientRect().y < 620).map(e => e.id.replace('item', '')); return ids.find(i => items[i] && 'skills' in items[i]) || ids[ids.length - 1]; })()`);
      await hover(`[id="${gear}item"]`);
      await g.shot(path.join(KIT, 'shots', `${tag}-2-tooltip.png`));
      await g.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
      await g.eval(`document.getElementById('skillsButton').click(); 1`);
      await g.sleep(700);
      await g.shot(path.join(KIT, 'shots', `${tag}-3-skills.png`));
      await g.eval(`document.getElementById('jobTab').click(); 1`);
      await g.sleep(1000);
      await g.shot(path.join(KIT, 'shots', `${tag}-4-guild.png`));
      await g.eval(`document.getElementById('achievementsTab').click(); 1`);
      await g.sleep(1000);
      await g.shot(path.join(KIT, 'shots', `${tag}-5-archive.png`));
    }
  } finally { await g.close(); }
  console.log(fs.readdirSync(KIT).join(' '), '|', fs.readdirSync(path.join(KIT, 'shots')).join(' '));
})().catch(e => { console.error(e); process.exit(1); });
