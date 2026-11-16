// SHARE：パネルの値を URL の # 以降に書き出し、その URL を開くと同じ値のパネルで始まる。
// 書くのは初期値と違う項目だけ（例：#SHAPE=OVAL&W=200&COLOR_A=e5485f&GAP_ANIM=1）。
//   チェックボックスは 1 / 0、色は # を外した6桁、BALL_A / BALL_B は LIT と DARK の2文字（例：CB）。
// URL にない項目は初期値になり、知らない項目は読み飛ばすので、項目を足したり消したりしても古い URL は開ける。
// #panel=0 を付けるとパネルを隠して開く。?day=N（record.js の台本）のときは # を読まない

let shareDefaults = null;   // パネルを作り終えた直後の値（＝初期値）。差分を取るのに使う

// パネルの部品の今の値を、URL に書く文字列で返す
function shareValueOf(c) {
  const input = c.elt.querySelector && c.elt.querySelector('input[type=checkbox]');
  if (input) return input.checked ? '1' : '0';
  const v = String(c.elt.value);
  return v.startsWith('#') ? v.slice(1).toLowerCase() : v;
}

// URL に書くすべての項目：ラベル → 今の値（文字列）。並びはパネルの順（＝戻すときの順）
function shareSnapshot() {
  const out = {};
  for (const [label, c] of Object.entries(controls)) out[label] = shareValueOf(c);
  out.BALL_A = ballASel.lit.value() + ballASel.dark.value();
  out.BALL_B = ballBSel.lit.value() + ballBSel.dark.value();
  return out;
}

// setup() でパネルを作り終えたところで呼ぶ：初期値を控え、URL の # があればその値を入れる
function initShare() {
  shareDefaults = shareSnapshot();
  if (new URLSearchParams(location.search).get('day')) return;
  const q = new URLSearchParams(location.hash.slice(1));
  // 部品の値を入れる順はパネルの順にする（SHAPE を先に入れないと、OVAL の W=0 などが入らない）
  for (const label of Object.keys(controls)) {
    if (!q.has(label)) continue;
    const c = controls[label];
    const raw = q.get(label);
    const isCheck = c.elt.querySelector && c.elt.querySelector('input[type=checkbox]');
    if (isCheck) setCtl(label, raw === '1');
    else if (c.elt.tagName === 'SELECT') {
      if ([...c.elt.options].some(o => o.value === raw)) setCtl(label, raw);
    } else if (c.elt.type === 'color') {
      if (/^[0-9a-f]{6}$/i.test(raw)) setCtl(label, '#' + raw);
    } else if (raw !== '' && Number.isFinite(+raw)) {
      setCtl(label, +raw);
    }
  }
  // 古い URL の SPEED（ボールとカメラが同じ速さだった頃）は、BALL_SPEED と CAM_SPEED の両方に入れる
  const oldSpeed = q.get('SPEED');
  if (oldSpeed !== null && oldSpeed !== '' && Number.isFinite(+oldSpeed)) {
    for (const label of ['BALL_SPEED', 'CAM_SPEED']) if (!q.has(label)) setCtl(label, +oldSpeed);
  }
  for (const [key, sel] of [['BALL_A', ballASel], ['BALL_B', ballBSel]]) {
    const v = q.get(key);
    if (v && /^[ABC]{2}$/.test(v)) { sel.lit.selected(v[0]); sel.dark.selected(v[1]); }
  }
  if (q.get('panel') === '0') panel.style('display', 'none');
}

// 今のパネルの値の共有 URL（初期値と違う項目だけ）
function shareURL() {
  const now = shareSnapshot();
  const q = new URLSearchParams();
  for (const [label, v] of Object.entries(now)) if (v !== shareDefaults[label]) q.set(label, v);
  const hash = q.toString();
  return location.origin + location.pathname + location.search + (hash ? '#' + hash : '');
}

// SHARE ボタン：アドレスバーを共有 URL にして、クリップボードにコピーする
async function shareNow(btn) {
  const url = shareURL();
  history.replaceState(null, '', url);
  let ok = false;
  try {
    await navigator.clipboard.writeText(url);
    ok = true;
  } catch (e) {
    // クリップボードの API が使えないとき（http の別ホストなど）は、昔ながらの方法でコピーする
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
    if (!ok) console.warn('share.js: clipboard failed', e);
  }
  btn.html(ok ? 'COPIED' : 'URL UPDATED');
  setTimeout(() => btn.html('SHARE'), 1200);
}
