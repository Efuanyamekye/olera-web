// Render local HTML files to PDF via Chromium CDP (no npm deps).
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/opt/pw-browsers/chromium';
const jobs = JSON.parse(process.argv[2]); // [{html, pdf, footer}]

const userDir = mkdtempSync(join(tmpdir(), 'chr-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  // The page is a local file; keep Chromium off the network entirely. Without
  // these it dials Google update/safebrowsing through the agent proxy and hangs.
  '--proxy-server=http://127.0.0.1:1', '--disable-background-networking', '--disable-component-update',
  '--disable-sync', '--disable-domain-reliability', '--no-first-run',
  '--no-default-browser-check', '--metrics-recording-only', '--disable-default-apps',
  '--remote-debugging-port=9344', `--user-data-dir=${userDir}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9344/json/version');
      return (await r.json()).webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  throw new Error('chromium did not start');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map(); this.sessions = new Map();
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.id && this.waiting.has(m.id)) {
        const { res, rej } = this.waiting.get(m.id); this.waiting.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method === 'Page.loadEventFired') {
        const s = this.sessions.get(m.sessionId); if (s) s();
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waiting.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

const footerTpl = f => `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#5f6b64;padding:0 0.5in;display:flex;justify-content:space-between;">
<span>${f}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

console.error('[1] waiting for endpoint');
const wsUrl = await endpoint();
console.error('[2] endpoint up');
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r));
const cdp = new CDP(ws);
console.error('[3] ws open');

for (const job of jobs) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  console.error('[4] target created');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  console.error('[5] attached');
  await cdp.send('Page.enable', {}, sessionId);
  const loaded = new Promise(r => cdp.sessions.set(sessionId, r));
  await cdp.send('Page.navigate', { url: 'file://' + job.html }, sessionId);
  // Don't hang forever if the load event never lands (local images, no network).
  console.error('[6] navigated');
  await Promise.race([loaded, sleep(15000)]);
  console.error('[7] loaded');
  await sleep(800); // fonts + images settle
  console.log('  rendering', job.pdf.split('/').pop());
  console.error('[8] printing');
  const { data } = await cdp.send('Page.printToPDF', {
    printBackground: true, preferCSSPageSize: false,
    paperWidth: 8.5, paperHeight: 11,
    marginTop: 0.5, marginBottom: 0.62, marginLeft: 0.5, marginRight: 0.5,
    displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: footerTpl(job.footer),
  }, sessionId);
  const fs = await import('node:fs');
  fs.writeFileSync(job.pdf, Buffer.from(data, 'base64'));
  console.log('wrote', job.pdf, (fs.statSync(job.pdf).size / 1024).toFixed(0) + 'KB');
  await cdp.send('Target.closeTarget', { targetId });
}

ws.close();
chrome.kill();
process.exit(0);
