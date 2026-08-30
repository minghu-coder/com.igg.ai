// Drive Chrome DevTools over WebSocket: collect console + page errors, capture screenshot.
import { writeFile } from 'node:fs/promises';

const tabsUrl = 'http://127.0.0.1:9222/json';
const res = await fetch(tabsUrl);
const tabs = await res.json();
const tab = tabs.find(t => t.type === 'page' && t.url.includes('starfield.html'));
if (!tab) {
  console.error('starfield tab not found in', tabs.map(t => `${t.type}:${t.url}`));
  process.exit(1);
}
console.log('tab', tab.id, tab.url);

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];
function send(method, params = {}) {
  const i = ++id;
  return new Promise((resolve, reject) => {
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}
function sendSession(sessionId, method, params = {}) {
  const i = ++id;
  return new Promise((resolve, reject) => {
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, sessionId, method, params }));
  });
}

ws.addEventListener('message', (msg) => {
  let m;
  try { m = JSON.parse(msg.data); } catch { return; }
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.reject(m.error); else p.resolve(m.result);
  } else if (m.method) {
    events.push(m);
  }
});

await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });

const targets = await send('Target.getTargets');
const pageTarget = targets.targetInfos.find(t => t.url.includes('starfield.html'));
const { sessionId } = await send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
console.log('attached, session', sessionId);

await sendSession(sessionId, 'Runtime.enable');
await sendSession(sessionId, 'Log.enable');
await sendSession(sessionId, 'Page.enable');

await new Promise(r => setTimeout(r, 1500));

const layout = await sendSession(sessionId, 'Page.getLayoutMetrics');
const { cssContentSize, visualViewport } = layout;
const w = Math.ceil(visualViewport.clientWidth || cssContentSize.width);
const h = Math.ceil(visualViewport.clientHeight || cssContentSize.height);
console.log('viewport', w, h);

const shot = await sendSession(sessionId, 'Page.captureScreenshot', { format: 'png' });
await writeFile('D:\\workspace\\com.igg.ai\\starfield-shot.png', Buffer.from(shot.data, 'base64'));
console.log('screenshot saved');

const evalState = await sendSession(sessionId, 'Runtime.evaluate', {
  expression: `JSON.stringify({
    stars: stars.length,
    planets: planets.length,
    sunOn: CONFIG.sun,
    moonOn: CONFIG.moon,
    fps: document.getElementById('fpsDisplay').textContent,
    stats: document.getElementById('starCount').textContent,
    extra: document.getElementById('extraInfo').textContent,
    canvas: { w: canvas.width, h: canvas.height }
  })`,
  returnByValue: true,
});
console.log('state:', evalState.result.value);

await sendSession(sessionId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 400 });
await sendSession(sessionId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: 600, y: 400, button: 'left', clickCount: 1 });
await sendSession(sessionId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: 600, y: 400, button: 'left', clickCount: 1 });
await new Promise(r => setTimeout(r, 500));
const after = await sendSession(sessionId, 'Runtime.evaluate', {
  expression: `JSON.stringify({ shootingStars: shootingStars.length })`,
  returnByValue: true,
});
console.log('after click shootingStars:', after.result.value);

const interesting = events.filter(e =>
  (e.method === 'Runtime.consoleAPICalled') ||
  (e.method === 'Runtime.exceptionThrown') ||
  (e.method === 'Log.entryAdded')
);
console.log('console/exception/log count =', interesting.length);
for (const e of interesting) {
  if (e.method === 'Runtime.consoleAPICalled') {
    const args = (e.params.args || []).map(a => a.value ?? a.description ?? a.unserializableValue ?? '').join(' ');
    console.log(`[${e.params.type}]`, args);
  } else if (e.method === 'Runtime.exceptionThrown') {
    console.log('[exception]', e.params.exceptionDetails.text, e.params.exceptionDetails.exception?.description || '');
  } else if (e.method === 'Log.entryAdded') {
    console.log(`[log:${e.params.entry.level}]`, e.params.entry.text);
  }
}

ws.close();
