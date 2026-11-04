// Screenshots of what automated checks can't judge: tooltips, settings, the first-run screen.
const fs = require('fs'), path = require('path');
const { launch } = require('./browser.cjs');
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'i18n', '_work', 'shots');
const SAVE = fs.readFileSync(path.join(ROOT, 'dev', 'A4C - pre boss.json'), 'utf8');
const hover = sel => `(async () => {
  const e = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(x => x.offsetParent)[0];
  if (!e) return 'no element for ' + ${JSON.stringify(sel)};
  const r = e.getBoundingClientRect();
  e.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.x + 5, clientY: r.y + 5, bubbles: false }));
  e.dispatchEvent(new MouseEvent('mousemove', { clientX: r.x + 5, clientY: r.y + 5, bubbles: true }));
  await new Promise(res => setTimeout(res, 300));
  return document.getElementById('tooltip').innerText.replace(/\\s*\\n\\s*/g, ' / ').slice(0, 400);
})()`;
(async () => {
  const p = await launch({ root: ROOT, width: 1600, height: 900 });
  try {
    // First run, no save.
    await p.goto('index.html?lang=zh', 4000);
    await p.shot(path.join(SHOTS, '5-zh-firstrun.png'));
    console.log('first-run text:', (await p.eval(`document.body.innerText.replace(/\\s*\\n\\s*/g, ' / ').slice(0, 260)`)));
    await p.eval(`localStorage.setItem('saveData', ${JSON.stringify(SAVE)}); 1`);
    await p.goto('index.html?lang=zh', 6000);
    // Real mouse: tooltips here react to actual pointer movement.
    const realHover = async sel => {
      const r = await p.eval(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(x => x.offsetParent)[0]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
      if (!r) return 'no element: ' + sel;
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x - 3, y: r.y - 3 });
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
      await p.sleep(450);
      return p.eval(`document.getElementById('tooltip').innerText.replace(/\\s*\\n\\s*/g, ' / ').slice(0, 500)`);
    };
    console.log('item tooltip:', await realHover('.itemSlot'));
    await p.shot(path.join(SHOTS, '6-zh-item-tooltip.png'));
    // Gear with skills, the heavy text case.
    const gear = await p.eval(`(() => { const ids = [...document.querySelectorAll('.itemSlot')].filter(e => e.offsetParent).map(e => e.id.replace('item', '')); return ids.find(i => items[i] && 'skills' in items[i]) || ids[ids.length - 1]; })()`);
    console.log('gear', gear, await realHover(`[id="${gear}item"]`));
    await p.shot(path.join(SHOTS, '7-zh-weapon-tooltip.png'));
    await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
    // Settings.
    const opened = await p.eval(`(() => { const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === '设置' && e.offsetParent); if (!el) return false; el.click(); (el.closest('[onclick]') || el).click(); return true; })()`);
    await p.sleep(700);
    console.log('settings opened', opened);
    await p.shot(path.join(SHOTS, '8-zh-settings.png'));
    await p.eval(`closePanels && closePanels(); 1`).catch(() => {});
    await p.sleep(300);
    // Archive and guild tabs.
    for (const id of ['achievementsTab', 'jobTab']) {
      await p.eval(`document.getElementById(${JSON.stringify(id)}).click(); 1`);
      await p.sleep(900);
      await p.shot(path.join(SHOTS, `9-zh-${id}.png`));
    }
  } finally { await p.close(); }
})().catch(e => { console.error(e); process.exit(1); });
