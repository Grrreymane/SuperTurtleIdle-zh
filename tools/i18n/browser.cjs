// Tiny headless Chromium driver for the i18n checks (no dependencies; needs Node 22+ for global WebSocket).
// Serves the game from a throwaway local port, drives it over the DevTools protocol, and cleans up on close().
'use strict';
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function serve(root) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(root, rel === '/' ? 'index.html' : rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function launch({ root, width = 1600, height = 900, lang = 'en-US' }) {
  if (!CHROME) throw new Error('Chrome not found');
  const { server, port } = await serve(root);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sti-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},${height}`, `--lang=${lang}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('Chrome did not start: ' + buf.slice(-400))), 30000);
    proc.stderr.on('data', d => { buf += d; const m = /DevTools listening on (ws:\S+)/.exec(buf); if (m) { clearTimeout(t); resolve(m[1]); } });
  });
  const browserPort = new URL(wsUrl).port;
  const targets = await (await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json();
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  const consoleLog = [], errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled') { const line = m.params.args.map(a => a.value ?? a.description ?? '').join(' '); consoleLog.push(line); if (m.params.type === 'error') errors.push(line); }
    if (m.method === 'Network.loadingFailed' && !m.params.canceled) errors.push('network: ' + m.params.errorText + ' ' + (pending.urls && pending.urls.get(m.params.requestId) || ''));
    if (m.method === 'Network.requestWillBeSent') { (pending.urls = pending.urls || new Map()).set(m.params.requestId, m.params.request.url); }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errors.push(`http ${m.params.response.status}: ${m.params.response.url}`);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');

  const page = {
    base: `http://127.0.0.1:${port}/`,
    errors, consoleLog, send,
    async goto(url, waitMs = 2500) {
      const loaded = new Promise(resolve => { const prev = ws.onmessage; ws.onmessage = ev => { prev(ev); const m = JSON.parse(ev.data); if (m.method === 'Page.loadEventFired') { ws.onmessage = prev; resolve(); } }; });
      await send('Page.navigate', { url: url.startsWith('http') ? url : page.base + url });
      await Promise.race([loaded, new Promise(r => setTimeout(r, 60000))]);
      await new Promise(r => setTimeout(r, waitMs));
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async addInit(source) { await send('Page.addScriptToEvaluateOnNewDocument', { source }); },
    async shot(file, clip) {
      const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    async close() {
      try { await send('Browser.close'); } catch {}
      try { ws.close(); } catch {}
      server.closeAllConnections?.(); server.close();
      await new Promise(r => setTimeout(r, 400));
      try { proc.kill(); } catch {}
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch {}
    },
  };
  return page;
}
module.exports = { launch };
