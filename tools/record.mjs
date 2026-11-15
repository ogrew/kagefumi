// Day N の20秒を、1/60 秒ずつ進めながら1フレームずつ撮って mp4（1080×1440, 60fps）にする。
// パネルも映る。画面収録の許可は要らない（Chrome をヘッドレスで動かして、ページの画像を撮る）。
//   python3 -m http.server 8765 を動かした状態で:
//   node tools/record.mjs 1            → out/day1.mp4
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const day = process.argv[2] || '1';
const W = 1080, H = 1440, FPS = 60;   // 3:4 の縦長
const URL_ = `http://localhost:8765/?day=${day}&rec=1`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const work = join(process.env.REC_TMP || tmpdir(), `kagefumi-day${day}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'frames'), { recursive: true });
mkdirSync('out', { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(work, 'profile')}`,
  `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1',
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

try {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.enable');
  await send('Page.navigate', { url: URL_ });
  for (let i = 0; i < 100; i++) { await sleep(200); if (await evaluate('!!(window.rec && window.rec.ready)')) break; }
  const info = await evaluate(`(() => { const gl = document.querySelector('canvas').getContext('webgl2');
    const d = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return { w: innerWidth, h: innerHeight, renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?', frames: rec.frames }; })()`);
  console.log('page', info);
  const t0 = Date.now();
  for (let f = 0; f < info.frames; f++) {
    await evaluate('rec.frame()');
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(work, 'frames', String(f).padStart(5, '0') + '.png'), Buffer.from(data, 'base64'));
    if (f % 120 === 0) console.log(`frame ${f}/${info.frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
} finally {
  ws.close(); chrome.kill();
}

const out = `out/day${day}.mp4`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(work, 'frames', '%05d.png'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
console.log('wrote', out);
