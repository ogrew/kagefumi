const CAM_DIST = 3000;
const MAX_LIMIT_Y = 3000;
const STAIR_W_RATIO = 0.3;    // 階段の幅 = D × この値（最大0.5）
const B_OFFSET = 1.0;         // ボールBの位置（ボールAから何踊り場ぶん上か）
const PAIR_INTERVAL = 3;      // ツガイ同士の間隔（踊り場の数）
const STOP_RAMP = 0.06;       // 停止前後の減速・加速にかける時間（サイクル比）
const WARP_N = 400;           // 時間ワープ表の分割数
const SHADOW_EXTRA = 8;       // 影の計算で画面の外に余分に描く踊り場の数（偶数）
const SUN_HEIGHT = 1000;      // LIGHT=FIXED：太陽の高さ（円周軌道の平面の高さ）
// 太陽は無限遠の平行光として扱うので、効くのは向きだけ。
// 高さを固定しているので、SUN_RADIUS が大きいほど太陽は低く（斜めから）、小さいほど真上に近くなる

const sliders = [];           // RESET用：スライダーとデフォルト値の一覧

let sW, sD, sSteps, sH, sVGap, sGap, sElev, sAzim, sZoom, sRoll, sSpeed, sOrbit, sLA, sLB, sBallR, sStopP, sStopLen;
let orbit = 0;
let paused = false;
let pauseBtn;
let shadingSel;   // シェーディングの選択（shading.js の SHADINGS のキー）
let lightSel;     // 光源の置き方（CAMERA / FIXED）
let sLightUp, sShadowTone, sSunSpeed, sSunRadius;
let sunAngle = Math.atan2(-0.3, 0.5);   // 太陽の軌道上の角度（ラジアン）。初期値は以前の固定の向きに合わせた
let panel;
let colorAPicker, colorBPicker, invertCheck, mixSel;
let ditherSel, ditherScreen, sGrainSize, sDotPitch;
let strokeCheck, sStrokeWeight;
let colorCPicker, ballASel, ballBSel;   // 3色のシェーディング（TRI）用
let sColumns, sColSpacing, flowSel, orbitFlowSel;
const COLOR_A_DEFAULT = '#ffffff';   // 紙（背景・光の当たる面）
const COLOR_B_DEFAULT = '#000000';   // インク（影・暗い面）
const COLOR_C_DEFAULT = '#ee2b2b';   // 3色のシェーディング（TRI）の3色目：上面
// TRI のボールの色（光の当たる側, 影側）。A / B / C のどれか
const BALL_A_DEFAULT = ['C', 'B'];
const BALL_B_DEFAULT = ['A', 'B'];

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);

  panel = createDiv();
  panel.style('position', 'absolute');
  panel.style('top', '10px');
  panel.style('left', '10px');
  panel.style('padding', '8px 10px');
  panel.style('background', 'rgba(255,255,255,0.85)');
  panel.style('border', '1px solid #000');
  panel.style('font', '16px monospace');
  // 項目が増えて画面の高さを超えたら、パネルの中をスクロールできるようにする
  panel.style('max-height', 'calc(100vh - 20px)');
  panel.style('overflow-y', 'auto');
  panel.style('box-sizing', 'border-box');

  // ===== 作品タイトル（この下は p5 側：形と動き） =====
  makeGroup(panel, 'Kagefumi', true);

  makeSection(panel, 'LANDING');      // 踊り場の大きさと、上下に重なる踊り場の間隔
  sW     = makeSlider(panel, 'W',          60,  360, 120);
  sD     = makeSlider(panel, 'D',         120,  480, 240);
  sH     = makeSlider(panel, 'H',           5,  200,  30);
  sVGap  = makeSlider(panel, 'V_GAP',       0,  400, 180);

  makeSection(panel, 'STAIRS');       // 段数と、向かい合う踊り場の間隔（＝階段の長さ）
  sSteps = makeSlider(panel, 'STEPS',       3,   12,   6);
  sGap   = makeSlider(panel, 'GAP',         0,  400, 180);

  makeSection(panel, 'BALL');         // ボールの大きさと動き
  sBallR = makeSlider(panel, 'BALL_R_RATIO', 0,   1, 0.75, 0.01);
  sSpeed = makeSlider(panel, 'SPEED',      -2,    2, 0.8, 0.1);
  sLA    = makeSlider(panel, 'L_A',       0.05, 0.8, 0.5, 0.01);
  sLB    = makeSlider(panel, 'L_B',       0.05, 0.8, 0.7, 0.01);
  sStopP = makeSlider(panel, 'STOP_PROB',   0,    1, 0.3, 0.01);
  sStopLen = makeSlider(panel, 'STOP_LEN',  0,  0.4, 0.2, 0.01);

  makeSection(panel, 'CAMERA');
  sElev  = makeSlider(panel, 'ELEV',      -89,   89,  30);
  sAzim  = makeSlider(panel, 'AZIM0',       0,  360,  45);
  sRoll  = makeSlider(panel, 'ROLL',      -90,   90,   0);
  sZoom  = makeSlider(panel, 'ZOOM',      0.3,   3,   1, 0.01);
  sOrbit = makeSlider(panel, 'ORBIT_SPEED', 0,    1, 0.2, 0.01);

  makeSection(panel, 'LAYOUT');       // 階段を画面の横一列に何本並べるか
  sColumns    = makeSlider(panel, 'COLUMNS',      1,    9,   1, 2);   // 列の数（中央を挟んで左右対称になるよう奇数）
  sColSpacing = makeSlider(panel, 'COL_SPACING', 200, 1500, 600, 10); // 列の中心どうしの間隔（ワールド単位）
  flowSel     = makeSelect(panel, 'FLOW', ['SAME', 'ALTERNATE', 'OUTER_REVERSE'], 'ALTERNATE'); // 各列の進む向き
  orbitFlowSel = makeSelect(panel, 'ORBIT_FLOW', ['SAME', 'ALTERNATE', 'OUTER_REVERSE'], 'SAME'); // 各列のカメラが周回する向き

  // ===== LOOK（シェーダー側：見た目） =====
  makeGroup(panel, 'LOOK');

  makeSection(panel, 'SHADING');      // 塗り方と影
  shadingSel = makeSelect(panel, 'SHADING', Object.keys(SHADINGS), 'FLAT');
  strokeCheck = makeCheck(panel, 'STROKE', false);  // 箱の輪郭線を描く（輪郭線のあるシェーディングのみ）
  sStrokeWeight = makeSlider(panel, 'STROKE_WEIGHT', 0.5, 6, 1, 0.5);   // 輪郭線の太さ（画面ピクセル）
  // GRAIN の白黒の置き換え方（ディザリング）
  ditherSel    = makeSelect(panel, 'DITHER', ['RANDOM', 'BAYER', 'HALFTONE'], 'RANDOM');
  ditherScreen = makeCheck(panel, 'DITHER_SCREEN', false);           // 模様を画面に貼りつける（オフ＝面に貼りつける）
  sGrainSize   = makeSlider(panel, 'GRAIN_SIZE', 1, 6, 1);           // RANDOM / BAYER の1マスの大きさ（画面ピクセル）
  sDotPitch    = makeSlider(panel, 'DOT_PITCH', 5, 20, 8);           // HALFTONE の網点の間隔（画面ピクセル）

  // シェーディングとディザの種類に関係する項目だけを表示する
  const updateDitherRows = () => {
    const grain = resolveShading(shadingSel.value()).dither === true;   // 粒（DITHER）で描くシェーディング
    const half = ditherSel.value() === 'HALFTONE';
    const show = (el, on) => el.row.style('display', on ? 'flex' : 'none');
    show(ditherSel, grain);
    show(ditherScreen, grain);
    show(sGrainSize, grain && !half);
    show(sDotPitch, grain && half);
    const st = resolveShading(shadingSel.value()).stroke;
    show(strokeCheck, st === true);   // 'always'（NONE）は常に線を描くので、オン・オフは出さない
    show(sStrokeWeight, st === 'always' || (st === true && strokeCheck.checked()));
    show(sShadowTone, resolveShading(shadingSel.value()).shadow !== false);
  };

  // 2色：A＝背景・光の当たる面（紙）、B＝影・暗い面（インク）。INVERT で役割を入れ替える
  makeSection(panel, 'COLOR');
  colorAPicker = makeColor(panel, 'COLOR_A', COLOR_A_DEFAULT);
  colorBPicker = makeColor(panel, 'COLOR_B', COLOR_B_DEFAULT);
  invertCheck  = makeCheck(panel, 'INVERT', false);
  mixSel       = makeSelect(panel, 'MIX', ['OKLAB', 'SRGB', 'LINEAR'], 'OKLAB'); // 中間色の計算方法
  // 3色のシェーディング（TRI）のときだけ使う色
  colorCPicker = makeColor(panel, 'COLOR_C', COLOR_C_DEFAULT);
  ballASel = makeBallColors(panel, 'BALL_A', BALL_A_DEFAULT);   // ボールA：光の当たる側, 影側
  ballBSel = makeBallColors(panel, 'BALL_B', BALL_B_DEFAULT);

  // シェーディングに関係する項目だけを表示する
  const updateShadingRows = () => {
    updateDitherRows();
    const tri = resolveShading(shadingSel.value()).palette === 3;
    const show = (el, on) => el.row.style('display', on ? 'flex' : 'none');
    show(colorCPicker, tri);
    show(ballASel, tri);
    show(ballBSel, tri);
    show(invertCheck, !tri);   // 3色では A / B の入れ替えは使わない
    show(mixSel, !tri);        // 中間色も使わない
  };
  makeSection(panel, 'LIGHT');        // 光源：CAMERA＝カメラの少し上に追従、FIXED＝太陽が円周軌道を回る
  lightSel = makeSelect(panel, 'LIGHT', ['CAMERA', 'FIXED'], 'CAMERA');
  sLightUp = makeSlider(panel, 'LIGHT_UP',  0,   80,  25);   // LIGHT=CAMERA：カメラから何度上に光源を置くか
  sSunSpeed  = makeSlider(panel, 'SUN_SPEED', -2,   2, 0.3, 0.05); // LIGHT=FIXED：太陽が軌道を回る速さ（度/フレーム）
  sSunRadius = makeSlider(panel, 'SUN_RADIUS', 0, 3000, 600, 10);  // LIGHT=FIXED：軌道の半径（高さは SUN_HEIGHT）
  // 階段・踊り場の影の中の明るさ（0＝インク、1＝影なし）。FLAT では中間色の混ぜ具合にもなる
  sShadowTone = makeSlider(panel, 'SHADOW_TONE', 0, 1, 0.5, 0.01);

  // シェーディングを切り替えたときなどに、関係する項目だけを表示する
  strokeCheck.changed(updateShadingRows);
  shadingSel.changed(updateShadingRows);
  ditherSel.changed(updateShadingRows);
  updateShadingRows();

  // 光源の種類に関係するスライダーだけを表示する
  const updateLightRows = () => {
    const cam = lightSel.value() === 'CAMERA';
    sLightUp.row.style('display', cam ? 'flex' : 'none');
    sSunSpeed.row.style('display', cam ? 'none' : 'flex');
    sSunRadius.row.style('display', cam ? 'none' : 'flex');
  };
  lightSel.changed(updateLightRows);
  updateLightRows();

  const btnRow = createDiv().parent(panel);
  btnRow.style('display', 'flex');
  btnRow.style('gap', '8px');
  btnRow.style('margin-top', '12px');
  btnRow.style('padding-top', '8px');
  btnRow.style('border-top', '2px solid #000');

  const btn = createButton('RESET').parent(btnRow);
  styleButton(btn);
  btn.mousePressed(() => {
    for (const o of sliders) {
      o.s.value(o.val);
      o.v.html(o.val);
    }
    colorAPicker.value(COLOR_A_DEFAULT);
    colorBPicker.value(COLOR_B_DEFAULT);
    invertCheck.checked(false);
    mixSel.selected('OKLAB');
    ditherSel.selected('RANDOM');
    ditherScreen.checked(false);
    strokeCheck.checked(false);
    colorCPicker.value(COLOR_C_DEFAULT);
    ballASel.lit.selected(BALL_A_DEFAULT[0]); ballASel.dark.selected(BALL_A_DEFAULT[1]);
    ballBSel.lit.selected(BALL_B_DEFAULT[0]); ballBSel.dark.selected(BALL_B_DEFAULT[1]);
    ditherSel.elt.dispatchEvent(new Event('change'));
    flowSel.selected('ALTERNATE');
    orbitFlowSel.selected('SAME');
  });

  // PAUSE：時間（階段・球・カメラ周回）を止める。スライダー操作は静止中も反映される
  pauseBtn = createButton('PAUSE').parent(btnRow);
  styleButton(pauseBtn);
  pauseBtn.mousePressed(togglePause);
}

// PLAY / PAUSE を切り替える（PAUSE ボタンと SPACE キーから呼ぶ）
function togglePause() {
  paused = !paused;
  pauseBtn.html(paused ? 'PLAY' : 'PAUSE');
}

// 大きな区分（SCENE / LOOK）の見出し：太字＋太い線
function makeGroup(parent, title, first = false) {
  const g = createDiv(title).parent(parent);
  g.style('font-weight', 'bold');
  g.style('letter-spacing', '0.1em');
  g.style('border-bottom', '2px solid #000');
  g.style('padding-bottom', '2px');
  g.style('margin-top', first ? '0' : '16px');
}

// 小さな区分（LANDING / STAIRS …）の見出し：小さめの灰色の文字＋細い線
function makeSection(parent, title) {
  const s = createDiv(title).parent(parent);
  s.style('font-size', '12px');
  s.style('color', '#666');
  s.style('border-top', '1px solid #bbb');
  s.style('margin-top', '8px');
  s.style('padding-top', '3px');
  s.style('margin-bottom', '2px');
}

// ラベル付きの色選択（行はスライダーと同じ並び）
function makeColor(parent, label, value) {
  const row = createDiv().parent(parent);
  row.style('display', 'flex');
  row.style('align-items', 'center');
  row.style('gap', '6px');
  row.style('margin', '2px 0');
  createSpan(label).parent(row).style('width', '140px');
  const picker = createColorPicker(value).parent(row);
  picker.style('width', '60px');
  picker.style('height', '24px');
  picker.row = row;   // 行ごと表示・非表示を切り替えるため
  return picker;
}

// ボールの色の組（光の当たる側 / 影側）を A / B / C から選ぶ行。{ lit, dark, row } を返す
function makeBallColors(parent, label, [lit, dark]) {
  const row = createDiv().parent(parent);
  row.style('display', 'flex');
  row.style('align-items', 'center');
  row.style('gap', '6px');
  row.style('margin', '2px 0');
  createSpan(label).parent(row).style('width', '140px');
  const make = (val, name) => {
    createSpan(name).parent(row).style('font-size', '12px');
    const sel = createSelect().parent(row);
    sel.style('font', '16px monospace');
    for (const o of ['A', 'B', 'C']) sel.option(o);
    sel.selected(val);
    return sel;
  };
  return { lit: make(lit, 'LIT'), dark: make(dark, 'DARK'), row };
}

// ラベル付きのチェックボックス（行はスライダーと同じ並び）
function makeCheck(parent, label, checked) {
  const row = createDiv().parent(parent);
  row.style('display', 'flex');
  row.style('align-items', 'center');
  row.style('gap', '6px');
  row.style('margin', '2px 0');
  createSpan(label).parent(row).style('width', '140px');
  const box = createCheckbox('', checked).parent(row);
  box.elt.querySelector('input').style.transform = 'scale(1.3)';
  box.row = row;   // 行ごと表示・非表示を切り替えるため
  return box;
}

// ラベル付きのプルダウン（行はスライダーと同じ並び）
function makeSelect(parent, label, options, selected) {
  const row = createDiv().parent(parent);
  row.style('display', 'flex');
  row.style('align-items', 'center');
  row.style('gap', '6px');
  row.style('margin', '2px 0');
  createSpan(label).parent(row).style('width', '140px');
  const sel = createSelect().parent(row);
  sel.style('font', '16px monospace');
  for (const o of options) sel.option(o);
  sel.selected(selected);
  sel.row = row;   // 行ごと表示・非表示を切り替えるため
  return sel;
}

function styleButton(b) {
  b.style('font', '16px monospace');
  b.style('padding', '4px 12px');
}

function makeSlider(parent, label, min, max, val, stp = 1) {
  const row = createDiv().parent(parent);
  row.style('display', 'flex');
  row.style('align-items', 'center');
  row.style('gap', '6px');
  const name = createSpan(label).parent(row);
  name.style('width', '140px');
  const s = createSlider(min, max, val, stp).parent(row);
  s.style('width', '160px');
  const v = createSpan(String(val)).parent(row);
  v.style('width', '50px');
  s.input(() => v.html(s.value()));
  sliders.push({ s, v, val });
  s.row = row;   // 行ごと表示・非表示を切り替えるため
  return s;
}

// H キーでパネル全体を表示・非表示
function keyPressed() {
  if (key === 'h' || key === 'H') {
    const hidden = panel.style('display') === 'none';
    panel.style('display', hidden ? 'block' : 'none');
  }
  // SPACE キーで PLAY / PAUSE。false を返して、ページのスクロールや
  // フォーカス中のボタン・チェックボックスが反応するのを防ぐ
  if (key === ' ') {
    togglePause();
    return false;
  }
}

function sideOf(k) {
  return abs(k % 2) === 0 ? 1 : -1;
}

function draw() {
  // 2色：紙（背景・光の当たる面）とインク（影・暗い面）。INVERT で入れ替える
  const toRgb01 = (picker) => {
    const c = picker.color();
    return [red(c) / 255, green(c) / 255, blue(c) / 255];
  };
  const colA = toRgb01(colorAPicker), colB = toRgb01(colorBPicker);
  const shading = shadingSel.value();
  const tri = resolveShading(shading).palette === 3;
  const colC = toRgb01(colorCPicker);
  const inverted = invertCheck.checked() && !tri;   // 3色のときは入れ替えない
  const paperRGB = inverted ? colB : colA;
  const inkRGB = inverted ? colA : colB;
  background(paperRGB[0] * 255, paperRGB[1] * 255, paperRGB[2] * 255);

  // 形状パラメータをまとめる
  const p = {
    W: sW.value(),
    D: sD.value(),
    steps: sSteps.value(),
    H: sH.value(),
    gap: sGap.value(),
  };
  p.step = (p.H + sVGap.value()) / 2;      // 隣り合う踊り場の高低差
  p.run = p.gap / p.steps;
  p.rise = p.step / (p.steps + 1);
  p.sw = p.D * STAIR_W_RATIO;
  p.zc = p.D / 2 - p.sw / 2;               // 階段の中心z（絶対値）
  p.R = p.sw * sBallR.value() / 2;         // 球の半径（1.0で直径＝階段の幅）

  const e = radians(sElev.value());
  const zoom = sZoom.value();
  // ロールで画面が傾いても途切れないよう、画面の対角線の半分で判定する
  const halfView = sqrt(sq(width) + sq(height)) / 2 / zoom;
  const limitY = min(halfView / abs(cos(e)) + p.D, MAX_LIMIT_Y);
  const sceneR = sqrt(sq(limitY + p.H) + sq(p.gap / 2 + p.W) + sq(p.D / 2));

  if (!paused) orbit += sOrbit.value();

  // 正投影なので「視野角」の代わりに、見える範囲の広さ（ZOOM）で調整する
  const hw = width / 2 / zoom;
  const hh = height / 2 / zoom;

  // 全列で共通の描画設定（光源・色・ディザ）
  const base = {
    zoom,
    paper: paperRGB, ink: inkRGB, mixMode: mixSel.value(),
    dither: ditherSel.value(), ditherScreen: ditherScreen.checked(),
    grainSize: sGrainSize.value(), dotPitch: sDotPitch.value(),
    stairShadowTone: sShadowTone.value(),
    stroke: strokeOn(shading), strokeWeight: sStrokeWeight.value(),
    // ボールの影が届く高さの範囲（ボール中心から上下に）。
    // 下は「自分の床から1.5段ぶん」まで：階段を下る先には落ちるが、
    // 2段下にある真下の踊り場（床の向こう側）には届かない。上も同じ幅にする
    ballReach: p.R + 1.5 * p.step,
    step: p.step, H: p.H,   // POSTER のグラデーション用
  };
  if (tri) {
    // 3色のシェーディング：A / B / C の名前から色を引く
    const pal = { A: colA, B: colB, C: colC };
    base.uniforms = {
      uColC: colC,
      uBallInkLit: pal[ballASel.lit.value()], uBallInkDark: pal[ballASel.dark.value()],
      uBallPaperLit: pal[ballBSel.lit.value()], uBallPaperDark: pal[ballBSel.dark.value()],
    };
  }
  if (lightSel.value() === 'FIXED') {
    // 太陽：高さ SUN_HEIGHT の水平な円周上を、SUN_SPEED（度/フレーム）で回る
    // （yは下向きなので、上は -y）
    if (!paused) sunAngle += radians(sSunSpeed.value());
    const r = sSunRadius.value();
    base.lightDir = [r * cos(sunAngle), -SUN_HEIGHT, r * sin(sunAngle)];
  }
  // LIGHT=CAMERA のときは、光の向きを列ごとのカメラから計算する（列のループの中）

  // 列：画面の横一列に COLUMNS 本並べる。c は中央を0とした列番号（左が負、右が正）
  // 各列は同じカメラで、投影範囲だけを横にずらして描く（列どうしの影は落とし合わない）
  const n = sColumns.value();
  const spacing = sColSpacing.value();
  const near = CAM_DIST - sceneR, far = CAM_DIST + sceneR;
  for (let i = 0; i < n; i++) {
    const c = i - (n - 1) / 2;
    const st = columnState(c);
    const dir = flowDir(c, flowSel.value());
    const du = paused ? 0 : dir * sSpeed.value() / p.step;
    st.u = (((st.u + du) % 2) + 2) % 2;
    st.uTotal += du;

    // この列のカメラ：周回の向きを ORBIT_FLOW で列ごとに変える
    const a = radians(sAzim.value() + orbit * flowDir(c, orbitFlowSel.value()));
    const { eye, up } = cameraFor(a, e);
    const colBase = { ...base };
    if (lightSel.value() !== 'FIXED') {
      // カメラへ向かう方向を、画面の上方向へ LIGHT_UP 度だけ傾ける
      // （p5 の up ベクトルは画面の下向きなので、画面の上は -up）
      const toCam = eye.copy().normalize();
      const lu = radians(sLightUp.value());
      const L = p5.Vector.mult(toCam, cos(lu)).sub(p5.Vector.mult(up, sin(lu)));
      colBase.lightDir = [L.x, L.y, L.z];
    }

    drawColumn(p, st, c, colBase, shading, limitY, () => {
      // この列の位置へ投影範囲をずらす（影の下準備のあとに設定し直す）
      const dx = c * spacing;
      ortho(-hw - dx, hw - dx, -hh, hh, near, far);
      camera(eye.x, eye.y, eye.z, 0, 0, 0, up.x, up.y, up.z);
    }, a, e);
  }
}

// 方位角 a・仰角 e のカメラの位置と上方向（ROLL 込み）
function cameraFor(a, e) {
  const r = CAM_DIST * cos(e);
  const eye = createVector(r * sin(a), -CAM_DIST * sin(e), r * cos(a));
  // ロール：視線方向を軸に、カメラの上方向ベクトルを回す
  const fwd = p5.Vector.mult(eye, -1).normalize();
  const right = p5.Vector.cross(fwd, createVector(0, 1, 0)).normalize();
  const up0 = p5.Vector.cross(right, fwd);
  const roll = radians(sRoll.value());
  const up = p5.Vector.mult(up0, cos(roll)).add(p5.Vector.mult(right, sin(roll)));
  return { eye, up };
}

// 列ごとの状態（階段の進み具合）。列数を変えても、同じ位置の列は続きから動く
const columnStates = new Map();
function columnState(c) {
  if (!columnStates.has(c)) columnStates.set(c, { u: 0, uTotal: 0 });
  return columnStates.get(c);
}

// 列 c の向き（1 = そのまま、-1 = 逆）。FLOW（進む向き）と ORBIT_FLOW（周回の向き）で使う
//   SAME：全列同じ / ALTERNATE：隣どうしが逆 / OUTER_REVERSE：中央以外が逆
// 箱と紙のボールに輪郭線を描くか（シェーディングの stroke 設定とパネルの STROKE から決める）
function strokeOn(name) {
  const st = resolveShading(name).stroke;
  return st === 'always' || (st === true && strokeCheck.checked());
}

function flowDir(c, mode) {
  if (mode === 'ALTERNATE') return Math.abs(c) % 2 === 0 ? 1 : -1;
  if (mode === 'OUTER_REVERSE') return c === 0 ? 1 : -1;
  return 1;
}

// 1列ぶんを描く：ボールの位置 → 影の下準備 → 階段 → ボール
// setView()：この列の投影範囲とカメラを設定する関数
function drawColumn(p, st, c, base, shading, limitY, setView, a, e) {
  const u = st.u;
  fill(255);
  stroke(0);
  strokeWeight(1);

  // 以下、座標はすべて「階段ローカル」（踊り場kの中心y = k*step）で計算し、
  // 最後に -u*step だけずらして描く
  const kMin = ceil(u - limitY / p.step);
  const kMax = floor(u + limitY / p.step);
  // ツガイ（A：インク色、B：白＝Aの上）を PAIR_INTERVAL 踊り場ごとに配置
  // 階段にボールの影を落とすため、先に位置だけ計算しておく。半径0なら置かない
  const balls = [];
  if (p.R > 0) {
    const span = PAIR_INTERVAL * p.step;
    const jMin = ceil(-limitY / span);
    const jMax = floor(limitY / span);
    const LA = sLA.value(), LB = sLB.value();
    const warpA = buildWarp(LA, sStopLen.value());
    const warpB = buildWarp(LB, sStopLen.value());
    const prob = sStopP.value();
    for (let j = jMin; j <= jMax; j++) {
      const off = j * PAIR_INTERVAL;
      const qA = stopWarp(u + off, st.uTotal + off, j, 0, prob, warpA, c);
      const qB = stopWarp(u + off - B_OFFSET, st.uTotal + off - B_OFFSET, j, 1, prob, warpB, c);
      balls.push({ ...ballPos(qA, p, LA), r: p.R, ink: true });
      balls.push({ ...ballPos(qB, p, LB), r: p.R, ink: false });
    }
  }

  const ctx = { ...base, balls, centerY: u * p.step };

  // 形は2踊り場ごとに繰り返すので、キャッシュした2踊り場分を偶数kごとに並べる
  const geo = stairGeometry(p);
  const k0 = kMin - (((kMin % 2) + 2) % 2);   // kMin以下の偶数

  // 影の下準備：光源から見た奥行きを描く
  // 画面外（光源側）にある踊り場も影を落とすので、上下に SHADOW_EXTRA 踊り場ぶん余分に描く
  const xr = p.gap / 2 + p.W;
  const yc = u * p.step;
  const bounds = {
    x: [-xr, xr],
    y: [yc - limitY - p.step, yc + limitY + p.step],
    z: [-p.D / 2, p.D / 2],
  };
  const casterY = [bounds.y[0] - SHADOW_EXTRA * p.step, bounds.y[1] + SHADOW_EXTRA * p.step];
  shadowPass(shading, ctx, bounds, casterY,
    (dsh) => {   // 階段・踊り場
      dsh.setUniform('uObjScale', 1.0);
      for (let k = k0 - SHADOW_EXTRA; k <= kMax + SHADOW_EXTRA; k += 2) {
        dsh.setUniform('uOffset', [0, k * p.step, 0]);
        model(geo);
      }
    },
    (dsh) => {   // ボール
      for (const b of balls) {
        dsh.setUniform('uBallY', b.y);
        dsh.setUniform('uOffset', [b.x, b.y, b.z]);
        dsh.setUniform('uObjScale', b.r);
        sphere(1, 24, 16);
      }
    });

  setView();
  push();
  translate(0, -u * p.step, 0);
  const sh = beginShading(shading, ctx);
  for (let k = k0; k <= kMax; k += 2) {
    sh.setUniform('uOffset', [0, k * p.step, 0]);
    push();
    translate(0, k * p.step, 0);
    model(geo);
    pop();
  }
  endShading(ctx);

  // ボール：シェーディングにボール用の塗りがあればそれで、なければ通常描画
  if (!shadeBalls(shading, ctx)) {
    const ink = inkColor255(ctx);
    const paper = paperColor255(ctx);
    // 紙のボールの輪郭線は、箱の線と同じく STROKE のオン・オフと太さに従う
    for (const b of balls) drawBall(b, b.r, b.ink ? ink : paper, a, e, ink, ctx.stroke && !b.ink, ctx.strokeWeight);
  }
  pop();
}

// 停止の抽選：このサイクルで止まるなら、サイクル内の進みをワープさせる
// q：折り返しありの位置、qAbs：折り返しなしの位置（抽選用）、id：0=A,1=B
// col：列番号（列ごとに抽選結果を変えて、止まるタイミングがそろわないようにする）
function stopWarp(q, qAbs, j, id, prob, warp, col = 0) {
  if (!warp) return q;
  const n = floor(q);
  const f = q - n;
  if (hash3(j + col * 1013, id, floor(qAbs)) >= prob) return q;
  const x = f * WARP_N;
  const i = min(floor(x), WARP_N - 1);
  return n + lerp(warp[i], warp[i + 1], x - i);
}

// 疑似乱数（同じ入力なら常に同じ値 0〜1）
function hash3(a, b, c) {
  const v = sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return v - floor(v);
}

// 時間ワープ表 g(t)：g(0)=0, g(1)=1、踊り場中央（f=L/2）で速度0になり len だけ停止
// 速度 v(t) = (1 - 停止窓) × (1 + a × sin²) で、停止で失った分を前後の加速で取り戻す
// サイクルの境目では速度1なので、止まらないサイクルとなめらかにつながる
function buildWarp(L, len) {
  const tp = L / 2;
  const half = min(len / 2, tp - STOP_RAMP - 0.01);
  if (half <= 0) return null;

  const dt = 1 / WARP_N;
  const win = t => {
    const d = abs(t - tp) - half;
    if (d <= 0) return 1;
    if (d >= STOP_RAMP) return 0;
    const k = d / STOP_RAMP;
    return 1 - k * k * (3 - 2 * k);
  };
  const bump = t => t < tp ? sq(sin(PI * t / tp)) : sq(sin(PI * (t - tp) / (1 - tp)));

  // 前半・後半それぞれ、進む量がちょうど tp / (1 - tp) になる加速量 a を求める
  let i0 = [0, 0], i1 = [0, 0];
  for (let i = 0; i < WARP_N; i++) {
    const t = (i + 0.5) * dt;
    const h = t < tp ? 0 : 1;
    i0[h] += (1 - win(t)) * dt;
    i1[h] += (1 - win(t)) * bump(t) * dt;
  }
  const ac = [(tp - i0[0]) / i1[0], (1 - tp - i0[1]) / i1[1]];

  const g = new Float32Array(WARP_N + 1);
  for (let i = 0; i < WARP_N; i++) {
    const t = (i + 0.5) * dt;
    const h = t < tp ? 0 : 1;
    g[i + 1] = g[i] + (1 - win(t)) * (1 + ac[h] * bump(t)) * dt;
  }
  for (let i = 0; i <= WARP_N; i++) g[i] /= g[WARP_N]; // 誤差補正
  return g;
}

// シェーダーを使わない場合のボール。col：塗りの色 [r,g,b]（0〜255）
// 紙の色の球（outline = true）は背景と同化するので、カメラに正対する円で輪郭線を描く
function drawBall(pos, R, col, a, e, lineCol, outline, lineW = 1) {
  push();
  translate(pos.x, pos.y, pos.z);
  fill(col);
  noStroke();
  sphere(R, 24, 16);
  if (outline) {
    rotateY(a);
    rotateX(e);
    noFill();
    stroke(lineCol);
    strokeWeight(lineW);
    circle(0, 0, R * 2);
  }
  pop();
}

// 踊り場0・1（とそれぞれの階段）を1つのジオメトリにまとめてキャッシュする
// 形に関わるスライダーが変わったときだけ作り直す
let stairGeo = null;
let stairKey = '';
function stairGeometry(p) {
  const geoKey = [p.W, p.D, p.steps, p.H, p.gap, p.step].join(',');
  if (geoKey !== stairKey) {
    if (stairGeo) freeGeometry(stairGeo);
    stairGeo = buildGeometry(() => {
      for (let k = 0; k <= 1; k++) {
        for (const b of boxesOf(k, p)) {
          push();
          translate(b.x, b.top + b.h / 2, b.z);
          box(b.w, b.h, b.d);
          pop();
        }
      }
    });
    stairKey = geoKey;
  }
  return stairGeo;
}

// 踊り場kと、そこから1つ上（反対側）へ向かう階段の箱リスト
function boxesOf(k, p) {
  const side = sideOf(k);
  const top = k * p.step - p.H / 2;
  const list = [{ x: side * (p.gap / 2 + p.W / 2), z: 0, top: top, w: p.W, h: p.H, d: p.D }];
  for (let i = 1; i <= p.steps; i++) {
    list.push({
      x: side * (p.gap / 2 - (i - 0.5) * p.run),
      z: side * p.zc,
      top: top - i * p.rise,
      w: p.run, h: p.rise, d: p.sw,
    });
  }
  return list;
}

// 球の位置（階段ローカル座標）
// u が1進むごとに、踊り場n → 階段 → 踊り場n+1 を1サイクル進む（＝下る）
function ballPos(q, p, L) {
  const n = floor(q);
  const f = q - n;
  const s = sideOf(n);
  const R = p.R;
  let x, z;

  if (f < L) {
    // 踊り場nでU字に折り返す（奥/手前を入れ替える）
    const t = f / L;
    x = s * (p.gap / 2 + (p.W / 2) * sin(PI * t));
    z = s * p.zc * cos(PI * t);
  } else {
    // 踊り場nから踊り場n+1へ階段を進む
    const t = (f - L) / (1 - L);
    x = s * (p.gap / 2 - p.gap * t);
    z = -s * p.zc;
  }

  // 今のサイクルに関わる箱（踊り場n・n+1と、その前後の階段）だけを対象に、
  // 上面に接する高さのうち一番高いものを採用（めり込み防止）
  const near = boxesOf(n, p).concat(boxesOf(n + 1, p));
  let y = Infinity;
  for (const b of near) {
    const dx = max(b.x - b.w / 2 - x, 0, x - (b.x + b.w / 2));
    const dz = max(b.z - b.d / 2 - z, 0, z - (b.z + b.d / 2));
    const d2 = dx * dx + dz * dz;
    if (d2 < R * R) {
      y = min(y, b.top - sqrt(R * R - d2));
    }
  }
  if (y === Infinity) y = n * p.step - p.H / 2 - R;

  return { x, y, z };
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}