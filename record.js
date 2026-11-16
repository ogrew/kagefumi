// SNS 用の 7日間の動画：?day=N で開くと、前の日までの機能が入った状態から、その日の20秒の台本が進む。
// 台本はパネルの部品を実際に操作するので、パネルの表示も手で動かしたときと同じように変わる。
// ?day=N&rec=1 は書き出し用：自動では進まず、外から rec.frame() を呼ぶたびに 1/60 秒ずつ進む（tools/record.mjs）

const DAY_SEC = 20;   // 動画の長さ（秒）。日ごとに sec で変えられる

// 1日目より前の状態：線画と表の世界のボールだけで、裏の世界はない
const BEFORE_DAY1 = [
  ['SHADING', 'NONE'],
  ['UNDER_BALLS', false],
];

// 各日の台本：[秒, ラベル, 値, 変化にかける秒数（スライダーのみ・省略で即時）, 動き方]
//   動き方：省略 → ぎゅいんと動いて20%行き過ぎて止まる / 'smooth' → ゆっくり始まってゆっくり止まる
//           'out' → 素早く動いて、行き過ぎずに止まる / 'linear' → 一定の速さで変わる
const DAYS = {
  // H → D → W の順に、大きくして戻す。各変化 1.5 秒（ぎゅいんと動いて少し行き過ぎてから止まる）・大きいまま 2.5 秒。
  // 前の項目が戻り始めて半分のところで次の項目が動き出す（2〜17 秒。残り3秒は元の形のまま）
  1: { title: '影踏み', events: [
    [2, 'H', 60, 1.5], [6, 'H', 30, 1.5],
    [6.75, 'D', 320, 1.5], [10.75, 'D', 240, 1.5],
    [11.5, 'W', 210, 1.5], [15.5, 'W', 120, 1.5],
  ]},
  // 光は最初から FIXED（太陽が回る）。塗りが入り、段が増えて戻り、紙とインク・輪郭線がチカチカし、影の濃さが上下する
  2: { title: '光と影', events: [
    [0, 'LIGHT', 'FIXED'],
    [2, 'SHADING', 'FLAT'],
    [3.5, 'STEPS', 10, 1.5], [6.5, 'STEPS', 6, 1.5],
    [9, 'INVERT', true], [9.5, 'INVERT', false], [10, 'INVERT', true], [10.5, 'INVERT', false],
    [11.5, 'SHADOW_TONE', 0.7, 1.5],
    [14, 'STROKE', false], [14.5, 'STROKE', true], [15, 'STROKE', false], [15.5, 'STROKE', true],
    [14.5, 'SHADOW_TONE', 0.2, 1.5],
    [17, 'SHADOW_TONE', 0.5, 1.5],
    // 全体を通して緩やかに寄って引いて戻る（3.5〜18.5 秒）
    [3.5, 'ZOOM', 1.25, 5, 'smooth'], [8.5, 'ZOOM', 0.75, 5, 'smooth'], [13.5, 'ZOOM', 1, 5, 'smooth'],
  ]},
  // 最初から手描きの線。塗り方が 2.5 秒ごとに切り替わり、最後の TRI は長めに見せる。
  // 粒・網点・線の大きさは、切り替えと同時に値だけ入れる。
  // SPEED は 1 秒と 11 秒で、3 秒かけてサクッと向きを変える（0.8 → -0.8 → 0.8）。ZOOM は 20 秒かけて 1.0 → 1.4
  3: { title: '描き方', events: [
    [0, 'HANDWRITING', true],
    [0, 'ZOOM', 1.4, 20, 'linear'],
    [1, 'SPEED', -0.8, 3, 'out'], [11, 'SPEED', 0.8, 3, 'out'],
    [1.5, 'SHADING', 'GRAIN'],
    [4, 'DITHER', 'BAYER'], [4, 'GRAIN_SIZE', 4],
    [6.5, 'DITHER', 'HALFTONE'], [6.5, 'DOT_PITCH', 9],
    [9, 'DITHER', 'HATCH'], [9, 'HATCH_PITCH', 10],
    [11.5, 'SHADING', 'POSTER'], [11.5, 'HATCH_PITCH', 6],
    [14, 'SHADING', 'TRI'],
  ]},
  // 最初のコマで見た目と形を決める（GRAIN・BAYER、透視投影で寄り気味、逆向きに進む）。
  // 跳ね始め、粒が飛び、足跡が残る。転がりに戻すと足跡が線に変わり、最後は高く跳ねる
  4: { title: '動き', events: [
    [0, 'SHADING', 'GRAIN'], [0, 'DITHER', 'BAYER'], [0, 'GRAIN_SIZE', 3],
    [0, 'LIGHT', 'FIXED'], [0, 'SHADOW_TONE', 0.6], [0, 'ZOOM', 1.4],
    [0, 'PROJECTION', 'PERSPECTIVE'], [0, 'SPEED', -1],
    [0, 'W', 200], [0, 'D', 180], [0, 'GAP', 180],
    [2, 'BOUNCE', 1, 1.5],
    [5, 'PARTICLES', 8],
    [6.5, 'PARTICLE_SIZE', 0.45, 1.5],
    [9.5, 'FOOTPRINTS', true],
    [11.5, 'BOUNCE', 0, 1.5],
    [14, 'TRAIL_SIZE', 0.4, 1.5],
    [16.5, 'BOUNCE', 1.5, 1.5],
    // 初めての PERSPECTIVE なので、前半で画角を 75 と 20 の間でぎゅいんと何度も行き来させ、後半は 50 で止める
    [1, 'FOV', 75, 0.8], [2.2, 'FOV', 20, 0.8], [3.4, 'FOV', 75, 0.8], [4.6, 'FOV', 20, 0.8],
    [5.8, 'FOV', 75, 0.8], [7, 'FOV', 20, 0.8], [8.2, 'FOV', 50, 0.8],
  ]},
  // 最初のコマで見た目と形を決める（ORTHO、TRI のパステル配色、軽く跳ねる）。
  // 階段の長さと踊り場の間隔が呼吸し始め、段がボールの近くにだけ現れ、その残り方が変わり、呼吸が大きくなる
  5: { title: '階段が生きている', events: [
    [0, 'PROJECTION', 'ORTHO'], [0, 'ZOOM', 1.2], [0, 'SPEED', 0.8], [0, 'BOUNCE', 0.5],
    [0, 'W', 120], [0, 'D', 260],
    [0, 'SHADING', 'TRI'],
    [0, 'COLOR_A', '#e5485f'], [0, 'COLOR_B', '#54b0ce'], [0, 'COLOR_C', '#ecee58'],
    [0, 'BG_SEPARATE', true], [0, 'BG_COLOR', '#74b5d1'],
    [2, 'GAP_ANIM', true],
    [5, 'V_GAP_ANIM', true],
    [8.5, 'STEP_SQUASH', true],
    [10.5, 'STEP_FADE', 3, 1.5],
    [13.5, 'STEP_FADE', 0.5, 1.5],
    [16, 'GAP_MAX', 240, 1.5],
  ]},
  // 最初のコマで配色を変え、STEP_SQUASH を切り、真横（ELEV 0）から始める。真横で裏の世界のボールが現れ、
  // カメラは 0 → 20 → 0 → -30 → 0 → 30 と上下する（各 2.5 秒・間に 1 秒止まる）。
  // 下から見ている間は表のボールを消して、裏の世界だけを見せる
  6: { title: '裏の世界', events: [
    [0, 'COLOR_A', '#295bbd'], [0, 'COLOR_B', '#ed7833'], [0, 'COLOR_C', '#f7d14f'],
    [0, 'BG_SEPARATE', true], [0, 'BG_COLOR', '#37796e'],
    [0, 'STEP_SQUASH', false],
    [0, 'ELEV', 0],
    [1, 'UNDER_BALLS', true],
    [2, 'ELEV', 20, 2.5, 'smooth'],
    [5.5, 'ELEV', 0, 2.5, 'smooth'],
    [9, 'ELEV', -30, 2.5, 'smooth'],
    [10.5, 'TOP_BALLS', false],
    [12.5, 'ELEV', 0, 2.5, 'smooth'],
    [14, 'TOP_BALLS', true],
    [16, 'ELEV', 30, 2.5, 'smooth'],
  ]},
  // 30 秒。最初のコマで配色を変え、ZOOM 1.4 から始める。画面が左右に傾き、左右・上下に折り返されて万華鏡になり、
  // 傾きが回り、引いて、画素が粗くなり、傾きが戻り、最後の 4 秒は画素なしで終わる。
  // 絵はパネルの右に寄せているので、折り返しの元の位置（MIRROR_U）を階段の中心に合わせる
  7: { title: '完成', sec: 30, events: [
    [0, 'COLOR_A', '#ea3b45'], [0, 'COLOR_B', '#2b5fac'], [0, 'COLOR_C', '#f7d14f'],
    [0, 'BG_SEPARATE', true], [0, 'BG_COLOR', '#5eaa5b'],
    [0, 'ZOOM', 1.4],
    [2, 'ROLL', -30, 1.5],
    [5, 'ROLL', 30, 1.5],
    [8, 'MIRROR_U', 0.68], [8, 'MIRROR_X', true],
    [10.5, 'MIRROR_Y', true],
    [13, 'ROLL', -45, 1.5],
    [15, 'ZOOM', 0.9, 5, 'smooth'],
    [18, 'PIXELATE', true],
    [20.5, 'PIXEL_SIZE', 8, 1.5],
    [23.5, 'ROLL', 0, 1.5],
    [26, 'PIXELATE', false],
  ]},
  // Day 8：オーバルのらせん階段と、落ちるボール。前の日までの状態は最初のコマですべて戻す。
  // 段の数を上下させ、STEP_SQUASH でらせんをほどいて、また戻す。FALL_PROB はずっと効いている
  8: { title: '落ちる', events: [
    [0, 'SHAPE', 'OVAL'],
    [0, 'W', 120], [0, 'D', 280], [0, 'H', 30], [0, 'V_GAP', 120], [0, 'V_GAP_ANIM', false],
    [0, 'STEPS', 8], [0, 'GAP', 180], [0, 'GAP_ANIM', false], [0, 'STEP_SQUASH', false], [0, 'STEP_FADE', 1],
    [0, 'BALL_R_RATIO', 0.6], [0, 'SPEED', -0.8], [0, 'STOP_PROB', 0.3], [0, 'STOP_LEN', 0.2], [0, 'FALL_PROB', 0.2],
    [0, 'TOP_BALLS', true], [0, 'UNDER_BALLS', false],
    [0, 'BOUNCE', 1], [0, 'PARTICLES', 6], [0, 'PARTICLE_SIZE', 0.25], [0, 'FOOTPRINTS', false],
    [0, 'ELEV', 25], [0, 'AZIM0', 45], [0, 'ROLL', 0], [0, 'PROJECTION', 'ORTHO'], [0, 'ZOOM', 1.15], [0, 'ORBIT_SPEED', 0.2],
    [0, 'COLUMNS', 1],
    [0, 'SHADING', 'GRAIN'], [0, 'DITHER', 'RANDOM'], [0, 'GRAIN_SIZE', 1], [0, 'DITHER_SCREEN', false],
    [0, 'STROKE', true], [0, 'HANDWRITING', false],
    [0, 'COLOR_A', '#ffffff'], [0, 'COLOR_B', '#000000'], [0, 'COLOR_C', '#ee2b2b'], [0, 'INVERT', false],
    [0, 'BG_SEPARATE', false],
    [0, 'LIGHT', 'CAMERA'], [0, 'SHADOW_TONE', 0.5],
    [0, 'MIRROR_X', false], [0, 'MIRROR_Y', false], [0, 'MIRROR_U', 0.5], [0, 'PIXELATE', false], [0, 'PIXEL_SIZE', 4],
    [2.5, 'STEPS', 12, 1.5], [5, 'STEPS', 4, 1.5], [7.5, 'STEPS', 8, 1.5],
    [10.5, 'STEP_SQUASH', true],
    [15.5, 'STEP_SQUASH', false],
  ]},
};

let recDay = 0;          // 0 なら台本なし（ふつうの表示）
let recTime = 0;         // 台本の経過時間（秒）
let recNext = 0;         // 次に始める event の番号
const recTweens = [];    // 進行中の変化 { ctl, from, to, t0, dur }

// パネルの部品に値を入れて、手で操作したときと同じイベントを出す（表示の切り替えも動く）
function setCtl(label, value) {
  const c = controls[label];
  if (!c) { console.warn('record.js: no control', label); return; }
  const input = c.elt.querySelector && c.elt.querySelector('input[type=checkbox]');
  if (input) {
    c.checked(value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (c.elt.tagName === 'SELECT') {
    c.selected(value);
    c.elt.dispatchEvent(new Event('change'));
  } else {
    c.value(value);
    c.elt.dispatchEvent(new Event('input'));
  }
}

function startDay() {
  const q = new URLSearchParams(location.search);
  recDay = +q.get('day') || 0;
  if (!DAYS[recDay]) { recDay = 0; return; }
  // 前の日までの台本をすべて終えた状態にする
  for (const [l, v] of BEFORE_DAY1) setCtl(l, v);
  for (let d = 1; d < recDay; d++) for (const [, l, v] of DAYS[d].events) setCtl(l, v);
  // 絵をパネルの右の空いた所の中央へ寄せる
  window.REC_VIEW_SHIFT = (panel.elt.offsetLeft + panel.elt.offsetWidth) / 2;
  DAYS[recDay].events.sort((a, b) => a[0] - b[0]);
  if (q.get('rec')) {
    window.REC_FRAME_MS = 1000 / 60;
    noLoop();
    window.rec = { ready: true, frames: (DAYS[recDay].sec ?? DAY_SEC) * 60, frame: () => redraw() };
  }
}

// draw() の最初に呼ばれる：台本を dt ミリ秒進める
function recTick(dt) {
  if (!recDay) return;
  const ev = DAYS[recDay].events;
  while (recNext < ev.length && ev[recNext][0] <= recTime) {
    const [t, l, v, dur, ease] = ev[recNext++];
    if (dur) {
      const c = controls[l];
      recTweens.push({ l, from: +c.value(), to: v, t0: t, dur, ease });
    } else {
      setCtl(l, v);
    }
  }
  for (let i = recTweens.length - 1; i >= 0; i--) {
    const tw = recTweens[i];
    const u = Math.min(1, (recTime - tw.t0) / tw.dur);
    // 既定：いきなり大きく動いて、変化量の20%だけ行き過ぎてから戻って止まる（easeOutBack）
    // 'smooth'：ゆっくり始まってゆっくり止まる（ズームなど、緩やかに見せたいもの）
    const k = 2.6, v = u - 1;
    const e = tw.ease === 'smooth' ? u * u * (3 - 2 * u)
            : tw.ease === 'out' ? 1 - (1 - u) ** 3
            : tw.ease === 'linear' ? u
            : 1 + (k + 1) * v * v * v + k * v * v;
    setCtl(tw.l, tw.from + (tw.to - tw.from) * e);
    if (u >= 1) recTweens.splice(i, 1);
  }
  recTime += dt / 1000;
}
