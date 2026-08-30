// Inspect planet state and force-render them to verify they are drawn.
const tabsUrl = 'http://127.0.0.1:9222/json';
const tabs = await (await fetch(tabsUrl)).json();
const tab = tabs.find(t => t.type === 'page' && t.url.includes('starfield.html'));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  const i = ++id;
  return new Promise((res, rej) => {
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}
function sendS(sid, method, params = {}) {
  const i = ++id;
  return new Promise((res, rej) => {
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, sessionId: sid, method, params }));
  });
}
ws.addEventListener('message', (msg) => {
  const m = JSON.parse(msg.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.rej(m.error); else p.res(m.result);
  }
});
await new Promise(r => ws.addEventListener('open', r));
const targets = await send('Target.getTargets');
const t = targets.targetInfos.find(t => t.url.includes('starfield.html'));
const { sessionId } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
await sendS(sessionId, 'Runtime.enable');

const inspect = await sendS(sessionId, 'Runtime.evaluate', {
  expression: `(() => {
    const list = planets.map(p => ({
      rawX: p.x, rawY: p.y, radius: p.radius, hue: p.hue, sat: p.sat, lum: p.lum, ring: p.ring
    }));
    return JSON.stringify({ planets: list, viewport: { W, H } });
  })()`,
  returnByValue: true,
});
console.log('planets raw state:', inspect.result.value);

// Compute where each planet should land on screen:
const planets = JSON.parse(inspect.result.value).planets;
const vp = JSON.parse(inspect.result.value).viewport;
for (const p of planets) {
  const px = Math.round(p.rawX * vp.W);
  const py = Math.round(p.rawY * vp.H);
  console.log(`planet (hue=${p.hue} ring=${p.ring} r=${p.radius}) expected at (${px}, ${py}) on ${vp.W}x${vp.H}`);
}

const probe = await sendS(sessionId, 'Runtime.evaluate', {
  expression: `(() => {
    const c = canvas.getContext('2d');
    const samples = [];
    for (const p of planets) {
      const px = Math.round(p.x * canvas.width + Math.sin(p.wobble) * p.wobbleAmp);
      const py = Math.round(p.y * canvas.height);
      const data = c.getImageData(px - 1, py - 1, 3, 3).data;
      samples.push({ name: 'hue=' + p.hue, at: [px, py], rgba: [data[0], data[1], data[2], data[3]] });
    }
    return JSON.stringify(samples);
  })()`,
  returnByValue: true,
});
console.log('center pixel samples:', probe.result.value);

const offscreen = await sendS(sessionId, 'Runtime.evaluate', {
  expression: `(() => {
    const c2 = document.createElement('canvas');
    c2.width = 200; c2.height = 120;
    const cc = c2.getContext('2d');
    cc.fillStyle = '#000';
    cc.fillRect(0,0,200,120);
    for (const p of planets) {
      // Reuse drawPlanet but on the small canvas
      // Save state from main canvas first
    }
    return 'skipped';
  })()`,
  returnByValue: true,
});

ws.close();