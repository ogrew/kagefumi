const CAM_DIST = 3000;           // ORTHO のカメラの距離（正投影なので見え方には効かない）
const MAX_LIMIT_Y_PERSP = 6000;  // PERSPECTIVE で描く範囲の上限（消失点へ向かう階段をどこまで描くか）
const MAX_LIMIT_Y = 3000;
const STAIR_W_RATIO = 0.3;    // 階段の幅 = D × この値（最大0.5）
const B_OFFSET = 1.0;         // ボールBの位置（ボールAから何踊り場ぶん上か）
const PAIR_INTERVAL = 3;      // ツガイ同士の間隔（踊り場の数）
const STOP_RAMP = 0.06;       // 停止前後の減速・加速にかける時間（サイクル比）
const WARP_N = 400;           // 時間ワープ表の分割数
const SHADOW_EXTRA = 8;       // 影の計算で画面の外に余分に描く踊り場の数（偶数）
const STEP_SHADOW_EXTRA = 3;  // STEP_SQUASH の段の影で、画面の外に余分に描く踊り場の数
// 落ちる（FALL_PROB）：踊り場で曲がりきれず、まっすぐ転がって外側の端から落ちる。
// 折り返しの進み t（0〜1）で FALL_EDGE のところで端に着く（入口から端まで W、折り返しの出だしと同じ速さ）
const FALL_EDGE = 2 / Math.PI;
const FALL_GRAVITY = 0.006;   // 落ちていくボールの重力（半径に対する割合／フレーム²）
const FALL_HOLD_SEC = 0.8;    // 落ち始めてから、元の大きさのまま落ちる秒数
const FALL_SHRINK_SEC = 1.2;  // そのあと、ゆっくり縮んで消えるまでの秒数
const OVAL_FALL_F = 0.35;     // オーバル：落ちるサイクルで、外側の縁に着くまでの進み（サイクルに対する割合）
const FALL_GROW_SEC = 1.0;    // 次の踊り場で現れるとき、大きさが 0 → 1 になるまでの秒数
const FALL_TIP_SEC = 0.25;    // 端の角から外へ転がり出るのにかかる秒数
const FALL_DRIFT = 0.3;       // 落ちるときの横の速さ（転がってきた速さに対する割合）。小さいほど真下に落ちる
// 逆さの世界：ボールは表・裏とも常に描く。画面は、ELEV がこの角度（度）より上なら表の世界の
// ボールに、下なら裏の世界のボールについていき、その間はなめらかに移る
const BOTH_WORLDS_DEG = 10;
const SUN_HEIGHT = 1000;      // LIGHT=FIXED：太陽の高さ（円周軌道の平面の高さ）
// 太陽は無限遠の平行光として扱うので、効くのは向きだけ。
// 高さを固定しているので、SUN_RADIUS が大きいほど太陽は低く（斜めから）、小さいほど真上に近くなる

const sliders = [];           // RESET用：スライダーとデフォルト値の一覧
const controls = {};          // ラベル → パネルの部品（record.js が台本から操作する）

// 1フレームの経過時間（ミリ秒）。動画の書き出し中（record.js）は 60fps 固定
function dtMs() { return window.REC_FRAME_MS ?? deltaTime; }

let sBounce, sParticles, sParticleSize, sFallProb;
let topBallsCheck, underBallsCheck;
let footCheck, sTrailLife, sTrailSize;   // 足跡（FOOTPRINTS）   // 表の世界・裏の世界のボールを描くか
let stepSquashCheck, sStepFade;   // 段の動き（STEP_SQUASH）
let sLandSize, sStairWidth;   // SQUARE だけの大きさ：角の踊り場の一辺と、階段の幅（踊り場に対する割合）
let shapeSel;   // 階段の形：SWITCHBACK（折り返し階段）/ OVAL（オーバルのらせん）/ SQUARE（角ばったらせん）
let projSel, sFov;   // 投影：ORTHO（正投影）/ PERSPECTIVE（透視投影）
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
let ditherSel, ditherScreen, sGrainSize, sDotPitch, sHatchPitch;
let sFade;        // FLAT：面の色が切り替わるときのフェードの幅
let strokeCheck, sStrokeWeight;
let handCheck, sHandWobble, sHandBoil;
let colorCPicker, ballASel, ballBSel;
let bgSepCheck, bgPicker;   // 背景色を COLOR_A / B とは別に決める
let pixCheck, sPixSize, sPixInk;   // POST：大きな四角い画素に置き換える
let mirrorXCheck, mirrorYCheck, sMirrorU, sMirrorV;   // POST：画面の中央で折り返す   // 3色のシェーディング（TRI）用
let sColumns, sColSpacing, flowSel, orbitFlowSel, sAnimPhase;
// 形のアニメーション（呼吸）：スライダーの値を、最小〜最大の間でサイン波で動かす
const anims = [];        // makeAnim で作った { base, check, min, max, speed }
let animV, animGap, animElev;   // V_GAP / GAP / ELEV のアニメーション
let animTime = 0;        // アニメーションの経過時間（秒）。PAUSE 中は止まる
const COLOR_A_DEFAULT = '#ffffff';   // 紙（背景・光の当たる面）
const COLOR_B_DEFAULT = '#000000';   // インク（影・暗い面）
const BG_DEFAULT = '#eeeeee';        // BG_SEPARATE のときの背景色
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

  makeSection(panel, 'SHAPE');        // 階段の形（大枠）
  shapeSel = makeSelect(panel, 'SHAPE', ['SWITCHBACK', 'OVAL', 'SQUARE'], 'SWITCHBACK');

  makeSection(panel, 'LANDING');      // 踊り場の大きさと、上下に重なる踊り場の間隔
  sW     = makeSlider(panel, 'W',          60,  360, 120);
  sD     = makeSlider(panel, 'D',         120,  480, 240);
  sLandSize = makeSlider(panel, 'LANDING_SIZE', 40, 360, 120);   // SQUARE：角の踊り場（正方形）の一辺
  sH     = makeSlider(panel, 'H',           5,  200,  30);
  sVGap  = makeSlider(panel, 'V_GAP',       0,  400, 180);
  animV  = makeAnim(panel, 'V_GAP', sVGap, 120, 180, 0.14, 240);

  makeSection(panel, 'STAIRS');       // 段数と、向かい合う踊り場の間隔（＝階段の長さ）
  sSteps = makeSlider(panel, 'STEPS',       3,   12,   6);
  sGap   = makeSlider(panel, 'GAP',         0,  400, 180);
  sStairWidth = makeSlider(panel, 'STAIR_WIDTH', 0, 1, 0.4, 0.01);   // SQUARE：階段の幅（LANDING_SIZE に対する割合。ボールの大きさもこれに比例）
  animGap = makeAnim(panel, 'GAP', sGap, 80, 160, 0.21, 240);
  // 段の動き：段はボールの近くにだけあり、近づくと下端から縦に伸びて現れ、去ると縮んで消える
  stepSquashCheck = makeCheck(panel, 'STEP_SQUASH', false);
  sStepFade = makeSlider(panel, 'STEP_FADE', 0.3, 4, 1, 0.1);   // 段が現れる・消えるのにかかる長さ（段何個分か）
  stepSquashCheck.changed(updateStepRows);
  updateStepRows();

  makeSection(panel, 'BALL');         // ボールの大きさと動き
  sBallR = makeSlider(panel, 'BALL_R_RATIO', 0,   1, 0.75, 0.01);
  sSpeed = makeSlider(panel, 'SPEED',      -2,    2, 0.8, 0.1);
  sLA    = makeSlider(panel, 'L_A',       0.05, 0.8, 0.5, 0.01);
  sLB    = makeSlider(panel, 'L_B',       0.05, 0.8, 0.7, 0.01);
  sStopP = makeSlider(panel, 'STOP_PROB',   0,    1, 0.3, 0.01);
  sStopLen = makeSlider(panel, 'STOP_LEN',  0,  0.4, 0.2, 0.01);
  sFallProb = makeSlider(panel, 'FALL_PROB', 0, 1, 0, 0.01);   // 踊り場で曲がりきれずに落ちる確率（0＝落ちない）
  topBallsCheck   = makeCheck(panel, 'TOP_BALLS', true);     // 表の世界（上面を下る）のボール
  underBallsCheck = makeCheck(panel, 'UNDER_BALLS', true);   // 裏の世界（底面を上る）のボール
  sBounce  = makeSlider(panel, 'BOUNCE',    0,    2,   0, 0.1);   // 段を跳ねる高さ（段の高さの何倍か。0＝転がる）
  sParticles    = makeSlider(panel, 'PARTICLES', 0, 16, 0);            // 着地のたびに飛び散る粒の数（0＝なし）
  sParticleSize = makeSlider(panel, 'PARTICLE_SIZE', 0.05, 0.5, 0.25, 0.01);  // 粒の大きさ（ボールの半径に対する割合）
  sParticles.elt.addEventListener('input', updateParticleRow);
  updateParticleRow();
  // 足跡：ボールが通った所に跡が残り、しばらくすると粒になって消えていく
  footCheck  = makeCheck(panel, 'FOOTPRINTS', false);
  sTrailLife = makeSlider(panel, 'TRAIL_LIFE', 0.5, 2, 1.0, 0.1);     // 跡が消えるまでの秒数
  sTrailSize = makeSlider(panel, 'TRAIL_SIZE', 0.1, 0.5, 0.15, 0.05); // 跡の半径（ボールの半径に対する割合）
  footCheck.changed(updateFootRows);
  updateFootRows();

  makeSection(panel, 'CAMERA');
  sElev  = makeSlider(panel, 'ELEV',      -89,   89,  30);
  animElev = makeAnim(panel, 'ELEV', sElev, -30, 30, 0.03);   // 上から（表の世界）と下から（裏の世界）を往復する
  sAzim  = makeSlider(panel, 'AZIM0',       0,  360,  45);
  sRoll  = makeSlider(panel, 'ROLL',      -90,   90,   0);
  // 投影：ORTHO は遠近感なし、PERSPECTIVE は遠近感あり。どちらも大きさは ZOOM で決まる。
  // PERSPECTIVE のカメラの距離は、注視点での大きさが ZOOM と同じになるよう FOV から決める
  // （FOV を広げると、大きさはそのままで遠近感だけが強くなる）
  projSel  = makeSelect(panel, 'PROJECTION', ['ORTHO', 'PERSPECTIVE'], 'ORTHO');
  sZoom  = makeSlider(panel, 'ZOOM',      0.3,   3,   1, 0.01);
  sFov     = makeSlider(panel, 'FOV',       10,  100,  40);        // PERSPECTIVE：縦の画角（度）。広いほど遠近感が強い
  projSel.changed(updateProjRows);
  updateProjRows();
  shapeSel.changed(updateShapeRows);
  updateShapeRows();
  sOrbit = makeSlider(panel, 'ORBIT_SPEED', 0,    1, 0.2, 0.01);

  makeSection(panel, 'LAYOUT');       // 階段を画面の横一列に何本並べるか
  sColumns    = makeSlider(panel, 'COLUMNS',      1,    9,   1, 2);   // 列の数（中央を挟んで左右対称になるよう奇数）
  sColSpacing = makeSlider(panel, 'COL_SPACING', 200, 1500, 600, 10); // 列の中心どうしの間隔（ワールド単位）
  flowSel     = makeSelect(panel, 'FLOW', ['SAME', 'ALTERNATE', 'OUTER_REVERSE'], 'ALTERNATE'); // 各列の進む向き
  orbitFlowSel = makeSelect(panel, 'ORBIT_FLOW', ['SAME', 'ALTERNATE', 'OUTER_REVERSE'], 'SAME'); // 各列のカメラが周回する向き
  sAnimPhase = makeSlider(panel, 'ANIM_PHASE', 0, 360, 60);   // 形のアニメーションの、隣の列との位相のずれ（度）
  // COLUMNS が 1 なら、列に関わる項目は使わないので隠す
  sColumns.elt.addEventListener('input', updateColumnRows);
  updateColumnRows();

  // ===== LOOK（シェーダー側：見た目） =====
  makeGroup(panel, 'LOOK');

  makeSection(panel, 'SHADING');      // 塗り方と影
  shadingSel = makeSelect(panel, 'SHADING', Object.keys(SHADINGS), 'FLAT');
  strokeCheck = makeCheck(panel, 'STROKE', true);  // 箱の輪郭線を描く（輪郭線のあるシェーディングのみ）
  sStrokeWeight = makeSlider(panel, 'STROKE_WEIGHT', 0.5, 6, 1, 0.5);   // 輪郭線の太さ（画面ピクセル）
  handCheck   = makeCheck(panel, 'HANDWRITING', false);             // 輪郭線を手描き風にする
  sHandWobble = makeSlider(panel, 'HAND_WOBBLE', 0.5, 8, 2, 0.5);   // 線のぶれの大きさ（画面ピクセル）
  sHandBoil   = makeSlider(panel, 'HAND_BOIL', 0, 12, 4, 1);        // 線を描き直す回数（1秒あたり。0 で止める）
  sFade       = makeSlider(panel, 'FADE', 0, 0.2, 0.05, 0.01);      // FLAT：面の色が切り替わるときのフェードの幅（光への向きの値。0 で瞬時）
  // GRAIN の白黒の置き換え方（ディザリング）
  ditherSel    = makeSelect(panel, 'DITHER', ['RANDOM', 'BAYER', 'HALFTONE', 'HATCH'], 'RANDOM');
  ditherScreen = makeCheck(panel, 'DITHER_SCREEN', false);           // 模様を画面に貼りつける（オフ＝面に貼りつける）
  sGrainSize   = makeSlider(panel, 'GRAIN_SIZE', 1, 6, 1);           // RANDOM / BAYER の1マスの大きさ（画面ピクセル）
  sDotPitch    = makeSlider(panel, 'DOT_PITCH', 5, 20, 8);           // HALFTONE の網点の間隔（画面ピクセル）
  sHatchPitch  = makeSlider(panel, 'HATCH_PITCH', 3, 16, 6);         // HATCH の線の間隔（画面ピクセル）

  // シェーディングとディザの種類に関係する項目だけを表示する
  const updateDitherRows = () => {
    const grain = resolveShading(shadingSel.value()).dither === true;   // 粒（DITHER）で描くシェーディング
    const half = ditherSel.value() === 'HALFTONE';
    const show = (el, on) => el.row.style('display', on ? 'flex' : 'none');
    show(ditherSel, grain);
    show(ditherScreen, grain);
    const hatch = ditherSel.value() === 'HATCH';
    show(sGrainSize, grain && !half && !hatch);   // RANDOM / BAYER のみ
    show(sDotPitch, grain && half);
    show(sHatchPitch, grain && hatch);
    const st = resolveShading(shadingSel.value()).stroke;
    show(strokeCheck, st === true);   // 'always'（NONE）は常に線を描くので、オン・オフは出さない
    const lines = st === 'always' || (st === true && strokeCheck.checked());
    show(sStrokeWeight, lines);
    show(handCheck, lines);
    show(sHandWobble, lines && handCheck.checked());
    show(sHandBoil, lines && handCheck.checked());
    show(sShadowTone, resolveShading(shadingSel.value()).shadow !== false);
    show(sFade, shadingSel.value() === 'FLAT');
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
  // 背景色：オフなら紙の色（COLOR_A、INVERT なら COLOR_B）。オンなら BG_COLOR を使う
  bgSepCheck = makeCheck(panel, 'BG_SEPARATE', false);
  bgPicker   = makeColor(panel, 'BG_COLOR', BG_DEFAULT);
  const updateBgRow = () => bgPicker.row.style('display', bgSepCheck.checked() ? 'flex' : 'none');
  bgSepCheck.changed(updateBgRow);
  updateBgRow();

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
  handCheck.changed(updateShadingRows);
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

  // 描き終えた画面に後からかける処理
  makeSection(panel, 'POST');
  mirrorXCheck = makeCheck(panel, 'MIRROR_X', false);              // 左半分を右へ折り返す
  sMirrorU = makeSlider(panel, 'MIRROR_U', 0, 1, 0.5, 0.01);         // 画面中央に持ってくる元の画面の横位置（0＝左）
  mirrorYCheck = makeCheck(panel, 'MIRROR_Y', false);              // 上半分を下へ折り返す
  sMirrorV = makeSlider(panel, 'MIRROR_V', 0, 1, 0.5, 0.01);         // 同じく縦位置（0＝上）
  // チェックが入っているときだけ、位置のスライダーを出す
  const updateMirrorRows = () => {
    sMirrorU.row.style('display', mirrorXCheck.checked() ? 'flex' : 'none');
    sMirrorV.row.style('display', mirrorYCheck.checked() ? 'flex' : 'none');
  };
  mirrorXCheck.changed(updateMirrorRows);
  mirrorYCheck.changed(updateMirrorRows);
  updateMirrorRows();
  pixCheck = makeCheck(panel, 'PIXELATE', false);                  // 画面を大きな四角い画素に置き換える
  sPixSize = makeSlider(panel, 'PIXEL_SIZE', 2, 10, 4, 1);          // 画素1つの大きさ（画面ピクセル）
  sPixInk  = makeSlider(panel, 'PIXEL_INK', 0.1, 1, 0.4, 0.1);      // この太さ（画面ピクセル）の線がセルを横切るほど暗い色があれば、その色にする
  const updatePixRows = () => {
    const on = pixCheck.checked();
    sPixSize.row.style('display', on ? 'flex' : 'none');
    sPixInk.row.style('display', on ? 'flex' : 'none');
  };
  pixCheck.changed(updatePixRows);
  updatePixRows();

  const btnRow = createDiv().parent(panel);
  btnRow.style('display', 'flex');
  btnRow.style('gap', '8px');
  btnRow.style('margin-top', '12px');
  btnRow.style('padding-top', '8px');
  btnRow.style('border-top', '2px solid #000');

  const btn = createButton('RESET').parent(btnRow);
  styleButton(btn);
  btn.mousePressed(() => {
    for (const a of anims) setAnim(a, false);
    setTimeout(updateParticleRow, 0);
    setTimeout(updateColumnRows, 0);
    projSel.selected('ORTHO');
    updateProjRows();
    shapeSel.selected('SWITCHBACK');
    updateShapeRows();
    stepSquashCheck.checked(false);
    updateStepRows();   // スライダーを初期値に戻したあとで表示を合わせる
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
    strokeCheck.checked(true);
    handCheck.checked(false);
    topBallsCheck.checked(true);
    footCheck.checked(false);
    updateFootRows();
    underBallsCheck.checked(true);
    colorCPicker.value(COLOR_C_DEFAULT);
    bgPicker.value(BG_DEFAULT);
    bgSepCheck.checked(false);
    bgSepCheck.elt.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));
    ballASel.lit.selected(BALL_A_DEFAULT[0]); ballASel.dark.selected(BALL_A_DEFAULT[1]);
    ballBSel.lit.selected(BALL_B_DEFAULT[0]); ballBSel.dark.selected(BALL_B_DEFAULT[1]);
    ditherSel.elt.dispatchEvent(new Event('change'));
    flowSel.selected('ALTERNATE');
    orbitFlowSel.selected('SAME');
    mirrorXCheck.checked(false);
    pixCheck.checked(false);
    pixCheck.elt.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));
    mirrorYCheck.checked(false);
    mirrorXCheck.elt.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));
  });

  // PAUSE：時間（階段・球・カメラ周回）を止める。スライダー操作は静止中も反映される
  pauseBtn = createButton('PAUSE').parent(btnRow);
  styleButton(pauseBtn);
  pauseBtn.mousePressed(togglePause);

  // SHARE：今のパネルの値を URL にしてコピーする（share.js）
  const shareBtn = createButton('SHARE').parent(btnRow);
  styleButton(shareBtn);
  shareBtn.mousePressed(() => shareNow(shareBtn));

  initShare();   // share.js：初期値を控え、URL の # にパネルの値があれば入れる
  if (typeof startDay === 'function') startDay();   // record.js：?day=N なら、その日の状態から台本を始める
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
  controls[label] = picker;
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
  const cb = createCheckbox('', checked).parent(row);
  cb.elt.querySelector('input').style.transform = 'scale(1.3)';
  cb.row = row;   // 行ごと表示・非表示を切り替えるため
  controls[label] = cb;
  return cb;
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
  controls[label] = sel;
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
  controls[label] = s;
  return s;
}

// スライダー base の値をアニメーションさせる設定（チェックボックス＋最小・最大・速さ）。
// チェックを入れると3本のスライダーが出て、base は操作できなくなる（値はアニメーションで決まる）
//   label_MIN / label_MAX：動く範囲 / label_SPEED：1秒あたりの往復回数（Hz）
//   maxHi：label_MAX のスライダーの上限（省略すると base と同じ）
function makeAnim(parent, label, base, minVal, maxVal, speed, maxHi) {
  const lo = base.elt.min, hi = base.elt.max;
  const a = {
    base,
    check: makeCheck(parent, label + '_ANIM', false),
    min: makeSlider(parent, label + '_MIN', +lo, +hi, minVal),
    max: makeSlider(parent, label + '_MAX', +lo, maxHi ?? +hi, maxVal),
    speed: makeSlider(parent, label + '_SPEED', 0, 0.5, speed, 0.01),
  };
  a.check.changed(() => setAnim(a, a.check.checked()));
  setAnim(a, false);
  anims.push(a);
  return a;
}

function setAnim(a, on) {
  a.check.checked(on);
  for (const s of [a.min, a.max, a.speed]) s.row.style('display', on ? 'flex' : 'none');
  a.base.elt.disabled = on;
  a.base.row.style('opacity', on ? '0.4' : '1');
}

// アニメーション中なら、列 c の今の値。最小〜最大をサイン波で往復し、列ごとに ANIM_PHASE ずつ位相がずれる
function animValue(a, c) {
  if (!a.check.checked()) return a.base.value();
  const lo = a.min.value(), hi = a.max.value();
  const phase = radians(sAnimPhase.value()) * c;
  return lo + (hi - lo) * (0.5 + 0.5 * sin(TWO_PI * a.speed.value() * animTime + phase));
}

// 列 c の形状パラメータ
function shapeFor(c) {
  const p = {
    W: sW.value(),
    D: sD.value(),
    steps: sSteps.value(),
    H: sH.value(),
    gap: animValue(animGap, c),
  };
  p.step = (p.H + animValue(animV, c)) / 2;   // 隣り合う踊り場の高低差
  p.run = p.gap / p.steps;
  p.rise = p.step / (p.steps + 1);
  p.sw = p.D * STAIR_W_RATIO;
  if (shapeSel.value() === 'SQUARE') {
    // SQUARE は W / D の代わりに、角の踊り場の一辺と階段の幅を直接決める
    p.W = sLandSize.value();
    p.sw = p.W * sStairWidth.value();
  }
  p.zc = p.D / 2 - p.sw / 2;                  // 階段の中心z（絶対値）
  p.R = p.sw * sBallR.value() / 2;            // 球の半径（1.0で直径＝階段の幅）
  p.oval = shapeSel.value() === 'OVAL';
  p.square = shapeSel.value() === 'SQUARE';
  p.track = p.oval || p.square;   // ずっと同じ向きに回るらせん（踊り場で折り返さない）
  p.period = p.square ? 4 : 2;    // 形が何踊り場ごとに繰り返すか
  if (p.square) {
    // 角ばったらせん：四隅に一辺 W（LANDING_SIZE）の正方形の踊り場、4辺に長さ GAP の直線の階段（幅は sw ＝ STAIR_WIDTH）。
    // 踊り場の中心は (±h, ±h)。ボールは踊り場の上を半径 W/2 の四分円で 90度曲がる
    p.tw = p.sw;
    p.h = p.gap / 2 + p.W / 2;
    const turn = PI * p.W / 4;                 // 四分円の長さ
    p.Lo = turn / (turn + p.gap);              // 1サイクルのうち踊り場にいる割合（一定の速さ）
    // 落ちる：階段に出てすぐ（上りなら階段の終わり近く）で外側の縁に着く
    p.fallF = p.Lo + (1 - p.Lo) * 0.25;
    p.fallB = 1 - (1 - p.Lo) * 0.25;
    p.xr = p.zr = p.h + p.W / 2;
  } else if (p.oval) {
    // オーバル：踊り場は長さ W の直線、階段は半円のカーブ。トラックの幅は階段の幅（sw）と同じ。
    // GAP はカーブの内側の穴の直径。ボールはトラックの中心線（半径 rc）を通る
    p.tw = p.sw;
    p.rIn = p.gap / 2;
    p.rc = p.rIn + p.tw / 2;
    p.arc = PI * p.rc / p.steps;               // 1段ぶんの中心線の長さ
    // 直線とカーブを同じ速さで進むよう、1サイクルのうち直線にいる割合を長さから決める（L_A / L_B は使わない）
    p.Lo = p.W / (p.W + PI * p.rc);
    p.xr = p.W / 2 + p.rIn + p.tw;             // 横（x）の広がり
    p.zr = p.rIn + p.tw;                       // 奥行き（z）の広がり
    p.fallF = OVAL_FALL_F;
    p.fallB = 1 - OVAL_FALL_F;
  } else {
    p.xr = p.gap / 2 + p.W;
    p.zr = p.D / 2;
  }
  return p;
}

// SHAPE に合わせてパネルを変える。OVAL では W を 0 まで下げられ（0 で真円のらせん）、OVAL / SQUARE では L_A / L_B は使わない
function updateShapeRows() {
  const oval = shapeSel.value() === 'OVAL';
  const track = shapeSel.value() !== 'SWITCHBACK';
  sW.elt.min = oval ? 0 : 60;
  if (!oval && sW.value() < 60) { sW.value(60); sW.elt.dispatchEvent(new Event('input')); }
  sLA.row.style('display', track ? 'none' : 'flex');
  sLB.row.style('display', track ? 'none' : 'flex');
  // SQUARE は W / D の代わりに LANDING_SIZE / STAIR_WIDTH を使う
  const square = shapeSel.value() === 'SQUARE';
  sW.row.style('display', square ? 'none' : 'flex');
  sD.row.style('display', square ? 'none' : 'flex');
  sLandSize.row.style('display', square ? 'flex' : 'none');
  sStairWidth.row.style('display', square ? 'flex' : 'none');
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
  // 背景色（BG_SEPARATE がオンなら BG_COLOR、オフなら紙の色）
  const bgRGB = bgSepCheck.checked() ? toRgb01(bgPicker) : paperRGB;
  // POST：PIXELATE がオンなら、ここから画面をフレームバッファに描く
  const pixOn = beginPixelate(pixCheck.checked());
  background(bgRGB[0] * 255, bgRGB[1] * 255, bgRGB[2] * 255);

  if (typeof recTick === 'function') recTick(dtMs());   // record.js：Day の台本を進める
  if (!paused) animTime += dtMs() / 1000;

  // 形状パラメータ（中央の列。列ごとの形は shapeFor(c) で作る）
  const p = shapeFor(0);

  // 投影。zoom は「注視点の深さで、1ワールド単位が何ピクセルか」（ディザや HATCH の大きさに使う）
  const persp = projSel.value() === 'PERSPECTIVE';
  const fov = radians(sFov.value());
  const zoom = sZoom.value();
  const camDist = persp ? (height / 2) / (zoom * tan(fov / 2)) : CAM_DIST;
  // ロールで画面が傾いても途切れないよう、画面の対角線の半分で判定する
  const halfView = sqrt(sq(width) + sq(height)) / 2 / zoom;

  if (!paused) orbit += sOrbit.value();

  // 正投影なので「視野角」の代わりに、見える範囲の広さ（ZOOM）で調整する
  const hw = width / 2 / zoom;
  const hh = height / 2 / zoom;

  // 全列で共通の描画設定（光源・色・ディザ）
  const base = {
    zoom,
    paper: paperRGB, ink: inkRGB, mixMode: mixSel.value(),
    dither: ditherSel.value(), ditherScreen: ditherScreen.checked(),
    grainSize: sGrainSize.value(), dotPitch: sDotPitch.value(), hatchPitch: sHatchPitch.value(),
    stairShadowTone: sShadowTone.value(),
    fade: sFade.value(),
    stroke: strokeOn(shading), strokeWeight: sStrokeWeight.value(),
    // 手描きの線：ぶれ（ワールド単位）と、いま使う描き直しの番号
    hand: strokeOn(shading) && handCheck.checked(),
    handAmp: sHandWobble.value() / zoom,
    handVariant: sHandBoil.value() > 0 ? floor(animTime * sHandBoil.value()) % HAND_VARIANTS : 0,
    bounce: sBounce.value(),
    topBalls: topBallsCheck.checked(), underBalls: underBallsCheck.checked(),
    footprints: footCheck.checked(), trailLife: sTrailLife.value(), trailSize: sTrailSize.value(),
    stepSquash: stepSquashCheck.checked(), stepFade: sStepFade.value(),
    particles: sParticles.value(), particleSize: sParticleSize.value(),
    fallProb: sFallProb.value(),
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
  for (let i = 0; i < n; i++) {
    const c = i - (n - 1) / 2;
    // この列の形（V_GAP / GAP のアニメーションは、列ごとに位相をずらす）
    const p = shapeFor(c);
    // この列の仰角（ELEV のアニメーションも、列ごとに位相をずらす）
    const eDeg = animValue(animElev, c);
    const e = radians(eDeg);
    const limitY = persp ? perspLimitY(e, fov, camDist) + p.D : min(halfView / abs(cos(e)) + p.D, MAX_LIMIT_Y);
    const sceneR = sqrt(sq(limitY + p.H) + sq(p.xr) + sq(p.zr));
    // 透視投影では、カメラより手前に来る部分は描かない（near を 0 より大きく保つ）
    const near = max(camDist - sceneR, persp ? 10 : -Infinity), far = camDist + sceneR;
    const st = columnState(c);
    const dir = flowDir(c, flowSel.value());
    const du = paused ? 0 : dir * sSpeed.value() / p.step;
    st.uTotal += du;
    st.du = du;
    if (du !== 0) st.dir = du > 0 ? 1 : -1;   // 進む向き（止まっている間は前の向き）。落ちる向きを決める
    // 画面の追いかけ方：表だけ見えるときは表のボールに（du と同じ向き）、裏だけ見えるときは
    // 裏のボールに（逆向き）ついていく。その間はなめらかに移り、真横では階段が止まる。
    // 位置ではなく毎フレームの進みとして足し込むので、ELEV を変えても画面は飛ばない
    st.S = (st.S ?? st.uTotal) + du * (1 - 2 * underWeight(eDeg));

    // この列のカメラ：周回の向きを ORBIT_FLOW で列ごとに変える
    const a = radians(sAzim.value() + orbit * flowDir(c, orbitFlowSel.value()));
    const { eye, up } = cameraFor(a, e, camDist);
    const colBase = { ...base };
    // 形に関わる値は列ごと（形のアニメーションで列ごとに違うため）
    colBase.ballReach = p.R + 1.5 * p.step;
    colBase.step = p.step;
    colBase.eDeg = eDeg;
    // LIGHT=FIXED で下から見ているときは、太陽を上下反転させる（裏の世界の太陽）
    if (base.lightDir && eDeg < 0) colBase.lightDir = [base.lightDir[0], -base.lightDir[1], base.lightDir[2]];
    // 画面の右方向と下方向（階段ローカル座標）。HATCH の線の間隔を画面のピクセルで測るのに使う
    // （p5 の up ベクトルは画面の下向き）
    const fwd = p5.Vector.mult(eye, -1).normalize();
    const right = p5.Vector.cross(fwd, up).normalize();
    colBase.uniforms = {
      ...base.uniforms,
      uViewRight: [right.x, right.y, right.z],
      uViewDown: [up.x, up.y, up.z],
    };
    if (lightSel.value() !== 'FIXED') {
      // カメラへ向かう方向を、画面の上方向へ LIGHT_UP 度だけ傾ける
      // （p5 の up ベクトルは画面の下向きなので、画面の上は -up）
      // 下から見ているとき（裏の世界）は、裏の世界の「上」（世界の下向き）へ傾ける
      const toCam = eye.copy().normalize();
      const lu = radians(sLightUp.value()) * (eDeg < 0 ? -1 : 1);
      const L = p5.Vector.mult(toCam, cos(lu)).sub(p5.Vector.mult(up, sin(lu)));
      colBase.lightDir = [L.x, L.y, L.z];
    }

    drawColumn(p, st, c, colBase, shading, limitY, () => {
      // この列の位置へ投影範囲をずらす（影の下準備のあとに設定し直す）
      // REC_VIEW_SHIFT：動画の書き出し時に、パネルの右の空いた所へ絵全体を寄せる（画面ピクセル）
      const dx = c * spacing + (window.REC_VIEW_SHIFT ?? 0) / zoom;
      if (persp) {
        // 視錐台を横にずらす（注視点の深さで dx ずれるよう、near の面での量に直す）
        const th = near * tan(fov / 2), tw = th * width / height, sx = dx * near / camDist;
        frustum(-tw - sx, tw - sx, -th, th, near, far);
      } else {
        ortho(-hw - dx, hw - dx, -hh, hh, near, far);
      }
      camera(eye.x, eye.y, eye.z, 0, 0, 0, up.x, up.y, up.z);
    }, a, e);
  }

  // POST：画面の中央で折り返す
  applyMirror(mirrorXCheck.checked(), mirrorYCheck.checked(),
              [sMirrorU.value(), sMirrorV.value()], bgRGB);

  // POST：大きな四角い画素に置き換える。使う色（パレット）は紙・インク・背景と、
  // TRI なら3色目、FLAT なら中間色（ほかのシェーディングは紙とインクだけで描く）
  if (pixOn) {
    const pal = [paperRGB, inkRGB, bgRGB];
    if (tri) pal.push(colC);
    else if (shading === 'FLAT') {
      pal.push(midColor(resolveShading(shading),
        { ink: inkRGB, paper: paperRGB, stairShadowTone: sShadowTone.value(), mixMode: mixSel.value() }));
    }
    endPixelate(sPixSize.value(), sPixInk.value(), pal);
  }
}

// 画面がどれだけ裏の世界についていくか（0：表、1：裏）。ELEV が ±BOTH_WORLDS_DEG の間でなめらかに変わる
function underWeight(eDeg) {
  const t = constrain((BOTH_WORLDS_DEG - eDeg) / (2 * BOTH_WORLDS_DEG), 0, 1);
  return t * t * (3 - 2 * t);
}

// 方位角 a・仰角 e のカメラの位置と上方向（ROLL 込み）
function cameraFor(a, e, dist = CAM_DIST) {
  const r = dist * cos(e);
  const eye = createVector(r * sin(a), -dist * sin(e), r * cos(a));
  // ロール：視線方向を軸に、カメラの上方向ベクトルを回す
  const fwd = p5.Vector.mult(eye, -1).normalize();
  const right = p5.Vector.cross(fwd, createVector(0, 1, 0)).normalize();
  const up0 = p5.Vector.cross(right, fwd);
  const roll = radians(sRoll.value());
  const up = p5.Vector.mult(up0, cos(roll)).add(p5.Vector.mult(right, sin(roll)));
  return { eye, up };
}

// PERSPECTIVE で描く範囲（注視点から上下にどこまでか）。
// 縦の軸の上の点は、注視点から Y 離れると、深さが Y・sin(e) だけ変わり、画面の縦位置は Y・cos(e) / 深さ。
// これが画面の端（tan(fov/2)、ROLL があれば対角線ぶん広げる）に届く Y を、遠ざかる側と近づく側で求める。
// 遠ざかる側は消失点が画面の中にあると果てしなく続くので、MAX_LIMIT_Y_PERSP で打ち切る
function perspLimitY(e, fov, dist) {
  const diag = sRoll.value() !== 0 ? sqrt(sq(width) + sq(height)) / height : 1;
  const t = tan(fov / 2) * diag * 1.1;
  const ce = abs(cos(e)), se = abs(sin(e));
  const away = ce - t * se > 0.02 ? t * dist / (ce - t * se) : Infinity;
  const toward = t * dist / (ce + t * se);
  return min(max(away, toward), MAX_LIMIT_Y_PERSP);
}

// PERSPECTIVE のときだけ FOV を出す
function updateProjRows() {
  sFov.row.style('display', projSel.value() === 'PERSPECTIVE' ? 'flex' : 'none');
}

// 列ごとの状態（階段の進み具合）。列数を変えても、同じ位置の列は続きから動く
const columnStates = new Map();
function columnState(c) {
  if (!columnStates.has(c)) columnStates.set(c, { u: 0, uTotal: 0, prevQ: new Map(), particles: [], marks: [], lastMark: new Map(), fall: new Map(), fallers: [], frame: 0 });
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
  fill(255);
  stroke(0);
  strokeWeight(1);

  // ---- 2つの世界と、画面の追いかけ方 ----
  // 表の世界：ボールは踊り場の上面を下る（踊り場の番号が増える向き）。
  // 裏の世界：ボールは踊り場の底面を、重力が逆向きのまま上る（番号が減る向き）。
  // どちらも同じ進み U（折り返しなし）で動き、向きだけが逆。
  // 画面は、表だけ見えるときは表のボールに、裏だけ見えるときは裏のボールについていく
  // （階段が流れ、ボールはほぼ止まって見える）。その間はなめらかに移り、真横では階段が止まる
  const U = st.uTotal;
  const S = st.S;                                 // 画面の中心にくる踊り場の番号（折り返しなし）
  // 以下、座標はすべて「階段ローカル」（踊り場kの中心y = k*step）。
  // 数が大きくなりすぎないよう、折り返しなしの番号から F（偶数）を引いた番号で扱う。
  // 形は p.period（2 か 4）踊り場ごとに繰り返すので、F をずらしても見た目は変わらない
  const F = p.period * floor(S / p.period);
  const s = S - F;                                // 画面の中心（ローカル）。最後に -s*step だけずらして描く
  if (st.F !== undefined && st.F !== F) {
    // 基準がずれたら、ローカル座標で持っている粒も同じだけずらす
    const d = (F - st.F) * p.step;
    for (const pt of st.particles) { pt.y -= d; pt.floor -= d; }
    for (const mk of st.marks) mk.y -= d;
    for (const b of st.fallers) b.y -= d;
  }
  st.F = F;
  const yShift = -F * p.step;                     // 折り返しなしの座標 → ローカル座標

  const lim = limitY / p.step;
  const kMin = ceil(s - lim);
  const kMax = floor(s + lim);
  // ツガイ（A・B）を PAIR_INTERVAL 踊り場ごとに配置。
  //   表：A＝インク色（先を行く）、B＝紙の色（1つ上で追う）
  //   裏：同じ進みで、色だけ入れ替える（黒が白を追う）
  // 階段にボールの影を落とすため、先に位置だけ計算しておく。半径0なら置かない
  const balls = [];
  const pathBalls = [];   // 段の動き（STEP_SQUASH）用：画面の少し外まで含めたボールの位置
  const stepMode = base.stepSquash;
  if (p.R > 0 || stepMode) {
    const LA = p.track ? p.Lo : sLA.value(), LB = p.track ? p.Lo : sLB.value();
    const warpA = buildWarp(LA, sStopLen.value());
    const warpB = buildWarp(LB, sStopLen.value());
    const prob = sStopP.value();
    const ext = 1 + (stepMode ? ceil(SHADOW_EXTRA / PAIR_INTERVAL) : 0);
    const worlds = [];
    // 表・裏とも ELEV に関係なく描く（ELEV で出し分けると、真横付近でパチパチ切り替わって見えるため）。
    // TOP_BALLS / UNDER_BALLS でオフにした世界は描かない（粒も出さず、STEP_SQUASH の段も反応しない）
    if (base.topBalls) worlds.push({ under: false, center: S - U });    // 表のボールは q ≈ U + off の踊り場にいる
    if (base.underBalls) worlds.push({ under: true, center: -S - U });  // 裏のボールは踊り場 -q にいる
    for (const w of worlds) {
      const jMin = ceil((w.center - lim) / PAIR_INTERVAL);
      const jMax = floor((w.center + lim) / PAIR_INTERVAL);
      for (let j = jMin - ext; j <= jMax + ext; j++) {
        const off = j * PAIR_INTERVAL;
        const id = w.under ? 2 : 0;   // 止まる・落ちる抽選は世界ごとに変える
        // 落ちるのは、そのボールがいま折り返す踊り場（here）か、上りで次に着く踊り場（next）。
        // 落ちる踊り場では止まらない（落ちるを優先）
        const qa0 = U + off, qb0 = U + off - B_OFFSET;
        const fa = { here: fallsAt(j, id, floor(qa0), c, base.fallProb), next: fallsAt(j, id, floor(qa0) + 1, c, base.fallProb) };
        const fb = { here: fallsAt(j, id + 1, floor(qb0), c, base.fallProb), next: fallsAt(j, id + 1, floor(qb0) + 1, c, base.fallProb) };
        const qA = fa.here ? qa0 : stopWarp(qa0, qa0, j, id, prob, warpA, c);
        const qB = fb.here ? qb0 : stopWarp(qb0, qb0, j, id + 1, prob, warpB, c);
        const dir = st.dir ?? 1;
        // 落ちて隠れているボールには、段（STEP_SQUASH）も反応しない
        if (stepMode) {
          if (!fallHidden(qA, LA, fa, dir, p)) pathBalls.push({ q: qA, L: LA, under: w.under });
          if (!fallHidden(qB, LB, fb, dir, p)) pathBalls.push({ q: qB, L: LB, under: w.under });
        }
        if (j < jMin - 1 || j > jMax + 1 || p.R <= 0) continue;
        const tag = w.under ? 'u' : 't';
        const specs = [
          { key: tag + j + 'A', q: qA, L: LA, fall: fa, ink: !w.under },
          { key: tag + j + 'B', q: qB, L: LB, fall: fb, ink: w.under },
        ];
        for (const sp of specs) {
          const b = fallBall(st, sp, p, base, w.under, yShift);
          if (!b) {
            // 隠れている間は、着地も足跡も扱わない（現れたあとに、跡が前の跡とつながらないように）
            st.prevQ.delete(sp.key);
            st.lastMark.delete(sp.key);
            continue;
          }
          balls.push(b);
          // 着地したら粒を出す（前のフレームからの進みを見る）
          if (base.particles > 0 || base.footprints) {
            const hit = detectContact(st, sp.key, sp.q, sp.L, p, b, base);
            if (base.footprints) leaveFootprint(st, sp.key, sp.q, sp.L, p, b, base, hit, yShift);
          }
        }
      }
    }
  }
  // 粒を動かし、ボールと一緒に描く（同じシェーディング・同じ色・影も落とす）
  updateParticles(st, p);
  updateFallers(st, p);
  footStep = p.step;   // まとめるときに、基準 F のずれを高さに直すのに使う
  updateFootprints(st, base);
  for (const pt of st.particles) balls.push({ x: pt.x, y: pt.y, z: pt.z, r: pt.r * (1 - pt.age / pt.life), ink: pt.ink });
  // 落ちていくボール：しばらくは元の大きさのまま落ち、そのあとゆっくり縮んで消える
  for (const b of st.fallers) {
    const u = constrain((b.age - FALL_HOLD_SEC) / FALL_SHRINK_SEC, 0, 1);
    balls.push({ x: b.x, y: b.y, z: b.z, r: b.r * (1 - u * u * (3 - 2 * u)), ink: b.ink, under: b.under });
  }

  const ctx = { ...base, balls, centerY: s * p.step };

  // 形は2踊り場ごとに繰り返すので、キャッシュした2踊り場分を偶数kごとに並べる
  const geo = stairGeometry(p, c, base.stroke, stepMode);
  // 段の動き：各段の位置・大きさ・角度。影の下準備と本番で同じ段を2回使うので、1フレームに1回だけ計算する
  const stepCache = new Map();
  const stepAt = (k, i) => {
    const key = k * 64 + i;
    if (!stepCache.has(key)) stepCache.set(key, stepTransform(k, i, p, pathBalls, base.stepFade, F));
    return stepCache.get(key);
  };
  const k0 = kMin - (((kMin % p.period) + p.period) % p.period);   // kMin以下で、形の繰り返しの始まり

  // 影の下準備：光源から見た奥行きを描く
  // 画面外（光源側）にある踊り場も影を落とすので、上下に SHADOW_EXTRA 踊り場ぶん余分に描く
  const xr = p.xr;
  const yc = s * p.step;
  const bounds = {
    x: [-xr, xr],
    y: [yc - limitY - p.step, yc + limitY + p.step],
    z: [-p.zr, p.zr],
  };
  const casterY = [bounds.y[0] - SHADOW_EXTRA * p.step, bounds.y[1] + SHADOW_EXTRA * p.step];
  shadowPass(shading, ctx, bounds, casterY,
    (dsh) => {   // 階段・踊り場
      dsh.setUniform('uObjScale', 1.0);
      for (let k = k0 - SHADOW_EXTRA; k <= kMax + SHADOW_EXTRA; k += p.period) {
        dsh.setUniform('uOffset', [0, k * p.step, 0]);
        model(geo);
      }
      // 動く段は1つずつ描くので重い。画面外の段の影は近い分（STEP_SHADOW_EXTRA）だけにする
      if (stepMode) drawMovingSteps(dsh, k0 - STEP_SHADOW_EXTRA, kMax + STEP_SHADOW_EXTRA + 1, p, stepAt, true);
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
  translate(0, -s * p.step, 0);
  // 手描きのときは、箱の線は描かずに塗りだけを描き、あとで手描きの線を重ねる
  const sh = beginShading(shading, base.hand ? { ...ctx, stroke: false } : ctx);
  for (let k = k0; k <= kMax; k += p.period) {
    sh.setUniform('uOffset', [0, k * p.step, 0]);
    push();
    translate(0, k * p.step, 0);
    model(geo);
    pop();
  }
  if (stepMode) drawMovingSteps(sh, k0, kMax + 1, p, stepAt, false);
  endShading(ctx);
  if (base.hand) drawHandLines(p, base, geo, stepMode, k0, kMax, stepAt, F);

  // 足跡（階段の上、ボールの下）
  // 上から見ているときは裏の跡（底面）、下から見ているときは表の跡（上面）は見えないので描かない
  if (st.marks.length || (st.markChunks && st.markChunks.length)) {
    const show = { top: base.eDeg > -BOTH_WORLDS_DEG, under: base.eDeg < BOTH_WORLDS_DEG };
    drawFootprints(shading, ctx, st, base.trailLife, show, p.step);
  }

  // ボール：シェーディングにボール用の塗りがあればそれで、なければ通常描画
  if (!shadeBalls(shading, ctx)) {
    const ink = inkColor255(ctx);
    const paper = paperColor255(ctx);
    // 紙のボールの輪郭線は、箱の線と同じく STROKE のオン・オフと太さに従う
    balls.forEach((b, i) => drawBall(b, b.r, b.ink ? ink : paper, a, e, ink, ctx.stroke && !b.ink, ctx.strokeWeight,
      base.hand ? { amp: base.handAmp, seed: base.handVariant * 977 + i } : null));
  }
  pop();
}

// ---------------------------------------------------------------------
// 段の動き（STEP_SQUASH）
// ---------------------------------------------------------------------
// 段とボールの距離（段何個分か）。踊り場の上の移動も含めて、ボールの進み q で測る。
// 踊り場kの i 段目（1 が踊り場kのすぐ上）は、踊り場k-1 → k へ下りるサイクルの階段部分にある。
// 1段ぶんの進みは (1 - L) / steps なので、踊り場の折り返し（長さ L）は L / (1 - L) × steps 段ぶんになる
// 裏の世界のボールは、踊り場kの底面で折り返したあと、踊り場kの i 段目の下を i = 1 から順に通って
// 踊り場k-1 へ上る（ボールの進み q の踊り場は -k）
// k は折り返しなしの踊り場番号
function stepDistance(k, i, steps, ball) {
  const L = ball.L;
  const qBox = ball.under
    ? -k + L + (1 - L) * ((i - 0.5) / steps)
    : (k - 1) + L + (1 - L) * (1 - (i - 0.5) / steps);
  return abs(ball.q - qBox) / ((1 - L) / steps);
}

// 行き過ぎて戻る動き（0 → 1。途中で 1 を少し超える）
function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * pow(x - 1, 3) + c1 * pow(x - 1, 2);
}

// ボールがどれだけ近いか x（0＝遠い、1＝近い。直線的）。
// ボールから1段以内は常に 1（乗っている段と隣の段）、その外の STEP_FADE 段ぶんで変わる
function stepPresence(k, i, p, pathBalls, fade) {
  let m = Infinity;
  for (const b of pathBalls) m = min(m, stepDistance(k, i, p.steps, b));   // k は折り返しなし
  return constrain((1 + fade - m) / fade, 0, 1);
}

// 段1つの今の位置と大きさ。描かない（高さ0）なら null
// ボールが近づくと下端から縦に一気に伸びて現れ（少し伸びすぎて戻る）、去ると縮んで消える
// k：ローカルの踊り場番号、F：ローカル → 折り返しなしの番号へのずれ
function stepTransform(k, i, p, pathBalls, fade, F = 0) {
  const x = stepPresence(k + F, i, p, pathBalls, fade);
  const e = x <= 0 ? 0 : easeOutBack(x);
  if (e <= 0.001) return null;
  if (p.oval) {
    // オーバルの段（扇形）：高さ1の形を縦にだけ伸び縮みさせる
    const bottom = k * p.step - p.H / 2 - i * p.rise + p.rise;
    return { geo: ovalStepGeometry(p, k, i), cy: bottom - p.rise * e / 2, sy: p.rise * e };
  }
  const b = boxesOf(k, p)[i];
  const bottom = b.top + b.h;   // 下端（y が大きい側）を残す
  return { cx: b.x, cy: bottom - b.h * e / 2, cz: b.z, sx: b.w, sy: b.h * e, sz: b.d };
}

// 段を1つずつ描く。depth：影の下準備（光源から見た奥行き）なら true
// 大きさは uObjMat でシェーダーにも渡し、ディザや影の位置を箱と合わせる
function drawMovingSteps(sh, kFrom, kTo, p, stepAt, depth) {
  sh.setUniform('uUseObjMat', 1);
  for (let k = kFrom; k <= kTo; k++) {
    for (let i = 1; i <= p.steps; i++) {
      const t = stepAt(k, i);
      if (!t) continue;
      if (t.geo) {
        // オーバルの段：横の位置と形は形そのものが持っているので、縦の伸び縮みと高さだけ渡す
        sh.setUniform('uObjMat', [1, 0, 0, 0, t.sy, 0, 0, 0, 1]);
        sh.setUniform('uOffset', [0, t.cy, 0]);
        if (depth) model(t.geo);
        else { push(); translate(0, t.cy, 0); scale(1, t.sy, 1); model(t.geo); pop(); }
        continue;
      }
      // 列優先の3×3：拡大縮小
      sh.setUniform('uObjMat', [t.sx, 0, 0, 0, t.sy, 0, 0, 0, t.sz]);
      sh.setUniform('uOffset', [t.cx, t.cy, t.cz]);
      if (depth) {
        box(1);
      } else {
        push();
        translate(t.cx, t.cy, t.cz);
        scale(t.sx, t.sy, t.sz);
        box(1);
        pop();
      }
    }
  }
  sh.setUniform('uUseObjMat', 0);
}

// STEP_SQUASH がオンのときだけ STEP_FADE を出す
function updateStepRows() {
  sStepFade.row.style('display', stepSquashCheck.checked() ? 'flex' : 'none');
}

// ---------------------------------------------------------------------
// 着地の粒
// ---------------------------------------------------------------------
// 位置 q のボールがどこに触れているか。n：踊り場の番号、s：-1＝踊り場の上、
// 0〜steps＝階段の上（何番目の段の中央を過ぎたか。0 は最初の段の中央より手前）
function contactStage(q, L, steps) {
  const n = floor(q);
  const f = q - n;
  if (f < L) return { n, s: -1 };
  const g = (f - L) / (1 - L) * steps;
  return { n, s: min(floor(g + 0.5), steps) };
}

// 前のフレームからの進みで、ボールが段や踊り場に着地したかを調べ、着地したら粒を出す。
// 跳ねの着地点（段の中央・踊り場の端）を越えた瞬間が着地。ただし踊り場から階段へ
// 出ていく瞬間は離陸なので出さない（下りなら最初の端、上りなら最後の端）
function detectContact(st, key, q, L, p, ball, base) {
  const prev = st.prevQ.get(key);
  st.prevQ.set(key, q);
  if (prev === undefined || prev === q || abs(q - prev) > 0.5) return false;
  const a = contactStage(prev, L, p.steps), b = contactStage(q, L, p.steps);
  let hit = false;
  if (q > prev) {
    // 下り：段の中央を越えた / 次の踊り場に着いた
    if (b.n > a.n) hit = true;
    else if (a.s >= 0 && b.s > a.s) hit = true;
  } else {
    // 上り：段の中央を越えた / 踊り場（階段の下端側）に着いた
    if (b.n === a.n && a.s >= 0 && b.s >= 0 && b.s < a.s) hit = true;
    else if (b.n === a.n && a.s >= 0 && b.s === -1) hit = true;
  }
  if (hit && base.particles > 0) spawnParticles(st, ball, p, base);
  return hit;
}

// ボールの足元から、粒を放射状に飛ばす
// 裏の世界のボールの粒は、重力が逆向き（上へ落ちる）
function spawnParticles(st, ball, p, base) {
  const R = p.R;
  const g = ball.under ? -1 : 1;     // 重力の向き（y は下向きなので、表は +1）
  const floorY = ball.y + g * R;     // ボールが触れている面の高さ
  for (let i = 0; i < base.particles; i++) {
    const ang = random(TWO_PI);
    const sp = R * random(0.03, 0.09);
    st.particles.push({
      x: ball.x, y: floorY - g * R * 0.1, z: ball.z,
      vx: cos(ang) * sp, vz: sin(ang) * sp, vy: -g * R * random(0.06, 0.14),
      floor: floorY, g,
      r: R * base.particleSize * random(0.6, 1.2),
      ink: ball.ink,
      age: 0, life: random(30, 55),
    });
  }
  if (st.particles.length > 600) st.particles.splice(0, st.particles.length - 600);
}

// 粒を1フレームぶん動かす：重力で落ち、足元の面で小さく跳ね、小さくなって消える
function updateParticles(st, p) {
  if (paused) return;
  const dt = min(dtMs() / (1000 / 60), 3);   // 60fps のときの1フレームを1とする
  const gy = p.R * 0.012;
  for (const pt of st.particles) {
    const g = pt.g || 1;
    pt.vy += g * gy * dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.z += pt.vz * dt;
    const lim = pt.floor - g * pt.r;   // 粒の端が面に触れる高さ
    if ((pt.y - lim) * g > 0) {
      pt.y = lim;
      pt.vy *= -0.3;
      pt.vx *= 0.6; pt.vz *= 0.6;
    }
    pt.age += dt;
  }
  st.particles = st.particles.filter(pt => pt.age < pt.life);
}

// COLUMNS が 1 なら、列の間隔・向き・位相のずれの項目を隠す
function updateColumnRows() {
  const multi = sColumns.value() > 1;
  for (const el of [sColSpacing, flowSel, orbitFlowSel, sAnimPhase]) el.row.style('display', multi ? 'flex' : 'none');
}

// ---------------------------------------------------------------------
// 足跡
// ---------------------------------------------------------------------
// ボールが面に触れている所に、跡（薄い円盤）を残す。跡は階段に貼りついて一緒に流れる。
//   転がっているとき（BOUNCE 0、または踊り場の上）：通った道に跡を細かく並べて線にする
//   跳ねているとき（階段の上）：着地した瞬間にだけ跡を置く（hit）
// STEP_SQUASH がオンのときは、段は消えていくので階段の上には残さない
// yShift：折り返しなしの座標 → ローカル座標へのずれ（面に触れているかの判定に使う）
function leaveFootprint(st, key, q, L, p, ball, base, hit, yShift) {
  const f = q - floor(q);
  const onLanding = f < L;
  if (!onLanding && base.stepSquash) { st.lastMark.delete(key); return; }
  const r = p.R * base.trailSize;
  const rolling = onLanding || base.bounce <= 0;
  const g = ball.under ? -1 : 1;                     // 面のある向き（表は下、裏は上）
  const at = { x: ball.x, y: ball.y + g * p.R, z: ball.z };   // ボールが触れている面の点
  if (rolling) {
    // 面から離れている間（裏の世界で縁から落ちている間など）は残さない
    const n = ball.under ? -floor(q) : floor(q);
    const surf = p.track ? trackPos(q, p, L, 0, ball.under).y
               : ball.under ? contactYUnder(ball.x, ball.z, n, p) : contactY(ball.x, ball.z, n, p);
    if (abs(ball.y - yShift - surf) > 0.5) { st.lastMark.delete(key); return; }
    // 前の跡から一定の距離（半径の0.8倍）進んだら、次の跡を置く
    const last = st.lastMark.get(key);
    const d = last ? dist(last.x, last.y, last.z, at.x, at.y, at.z) : Infinity;
    if (d < r * 0.8) return;
    st.lastMark.set(key, at);
  } else {
    st.lastMark.delete(key);
    if (!hit) return;
  }
  st.marks.push({ x: at.x, y: at.y, z: at.z, r, under: ball.under, born: st.markClock || 0 });
}

// 跡の年齢を進め、TRAIL_LIFE を過ぎたものを捨てる
// 跡は1つずつ描くと重い（p5 は1回描くごとの手間が大きい）ので、まとめて描く：
//   1. FOOT_CHUNK_SEC ごとに、その間に置いた跡を世界ごとに1つの形（buildGeometry）にする（小さいまとまり）
//   2. 小さいまとまりが FOOT_MERGE 個たまったら、1つの大きいまとまりに作り直す
// 跡ごとに置いた時刻を頂点の色に書き込んでおき、シェーダーが跡ごとに薄くする。
// まとめる前の新しい跡（st.marks）だけは1つずつ描く
let footStep = 1;
const FOOT_CHUNK_SEC = 0.1;
const FOOT_MERGE = 10;
function updateFootprints(st, base) {
  if (!st.markChunks) { st.markChunks = []; st.markClock = 0; st.chunkStart = 0; }
  if (!paused) st.markClock += min(dtMs(), 100) / 1000;
  // 一番新しい跡まで消えたまとまりを捨てる
  st.markChunks = st.markChunks.filter(ch => {
    const alive = st.markClock - ch.tEnd < base.trailLife;
    if (!alive) freeGeometry(ch.geo);
    return alive;
  });
  st.marks = st.marks.filter(mk => st.markClock - mk.born < base.trailLife);
  // 一定時間ごとに、新しい跡を小さいまとまりにする（多すぎるときは時間を待たずに）
  if (st.markClock - st.chunkStart >= FOOT_CHUNK_SEC || st.marks.length > 300) {
    for (const under of [false, true]) {
      const list = st.marks.filter(mk => mk.under === under);
      if (list.length) st.markChunks.push(buildFootChunk(list, st.F, under, false));
    }
    st.marks = [];
    st.chunkStart = st.markClock;
    // 小さいまとまりがたまったら、世界ごとに1つにまとめ直す（基準 F は今のものにそろえる）
    for (const under of [false, true]) {
      const small = st.markChunks.filter(ch => !ch.big && ch.under === under);
      if (small.length < FOOT_MERGE) continue;
      const list = [];
      for (const ch of small) {
        const d = (ch.F - st.F) * ch.step;
        for (const mk of ch.marks) list.push({ ...mk, y: mk.y + d });
        freeGeometry(ch.geo);
      }
      st.markChunks = st.markChunks.filter(ch => !small.includes(ch));
      st.markChunks.push(buildFootChunk(list, st.F, under, true));
    }
  }
}

// 跡のリストを1つの形にする。跡は面に貼った平たい12角形（buildGeometry は1つずつの手間が大きいので、
// 頂点を直接並べて作る）。置いた時刻は、まとまりの時間幅の中での割合として頂点の色（赤）に入れる
const FOOT_SIDES = 12;
let footGeoCount = 0;
function buildFootChunk(list, F, under, big) {
  const t0 = min(...list.map(mk => mk.born));
  const tEnd = max(...list.map(mk => mk.born));
  const span = max(tEnd - t0, 1e-3);
  const geo = new p5.Geometry(1, 1);
  geo.gid = 'footprint-' + (footGeoCount++);
  const ny = under ? 1 : -1;   // 面の外向き（表は上 = -y、裏は下 = +y）
  for (const mk of list) {
    const base = geo.vertices.length;
    const y = footCenterY(mk) + ny * FOOT_H / 2;   // 円盤の外側の面
    const t = (mk.born - t0) / span;
    for (let i = 0; i <= FOOT_SIDES; i++) {
      // 0 番目が中心、1〜FOOT_SIDES 番目が周
      const a = (i - 1) / FOOT_SIDES * TWO_PI;
      const rr = i === 0 ? 0 : mk.r;
      geo.vertices.push(createVector(mk.x + rr * cos(a), y, mk.z + rr * sin(a)));
      geo.vertexNormals.push(createVector(0, ny, 0));
      geo.uvs.push(0, 0);
      geo.vertexColors.push(t, 0, 0, 1);
    }
    for (let i = 1; i <= FOOT_SIDES; i++) {
      geo.faces.push([base, base + i, base + (i % FOOT_SIDES) + 1]);
    }
  }
  return { geo, F, step: footStep, t0, span, tEnd, under, big, marks: big ? [] : list };
}

// FOOTPRINTS がオンのときだけ、跡の長さと大きさのスライダーを出す
function updateFootRows() {
  const on = footCheck.checked();
  sTrailLife.row.style('display', on ? 'flex' : 'none');
  sTrailSize.row.style('display', on ? 'flex' : 'none');
}

// PARTICLES が 0 なら、粒の大きさのスライダーを隠す
function updateParticleRow() {
  if (sParticleSize) sParticleSize.row.style('display', sParticles.value() > 0 ? 'flex' : 'none');
}

// 停止の抽選：このサイクルで止まるなら、サイクル内の進みをワープさせる
// q：折り返しありの位置、qAbs：折り返しなしの位置（抽選用）、id：0=A,1=B
// col：列番号（列ごとに抽選結果を変えて、止まるタイミングがそろわないようにする）
// ---------------------------------------------------------------------
// 落ちる（FALL_PROB）
// ---------------------------------------------------------------------
// ボール（ツガイ j・抽選の番号 id）が、折り返しなしの進み n のサイクルの踊り場で落ちるか。
// 止まる抽選（stopWarp）とは別の乱数にする
function fallsAt(j, id, n, col, prob) {
  return prob > 0 && hash3(j * 7.31 + col * 1013 + 101, id + 17, n) < prob;
}

// 落ちたボールが隠れているか。進む向き dir で決まる：
//   下り（dir > 0）：落ちる踊り場の端を越えてから、次の踊り場に着くまで
//   上り（dir < 0）：落ちる踊り場の端を越えてから、上の踊り場に着くまで（その間の階段も）
function fallHidden(q, L, fall, dir, p) {
  const f = q - floor(q);
  // オーバル・角ばったらせん：サイクルの始め（上りなら終わり）から外側の縁に着く所（fallF / fallB）までの間に外側へ寄っていき、
  // 外側の縁を越えたら隠れる。次のサイクルに入ったら現れる
  if (p && p.track) return fall.here && (dir >= 0 ? f >= p.fallF : f < p.fallB);
  if (dir >= 0) return fall.here && f >= L * FALL_EDGE;
  return (fall.here && f < L * (1 - FALL_EDGE)) || (fall.next && f >= L);
}

// 曲がりきれずに、踊り場の入口からまっすぐ外側へ転がる位置。
// u：入口からの進み（u = FALL_EDGE で外側の端）、fromStart：折り返しの始め（t = 0）側から入ったか
function fallStraight(u, fromStart, n, p, under) {
  const k = under ? -n : n;          // 踊り場の番号
  const s = sideOf(k);
  const x = s * (p.gap / 2 + (p.W / 2) * PI * u);
  // 入ってきた側の z（表：t = 0 で +zc、t = 1 で -zc。裏はその逆）
  const z = (fromStart ? 1 : -1) * (under ? -1 : 1) * s * p.zc;
  return { x, y: under ? contactYUnder(x, z, k, p) : contactY(x, z, k, p), z };
}

// ボール1つの位置と大きさ。隠れているなら null。
// 端を越えた瞬間に「落ちていくボール」を切り離し、次の踊り場に着いたら大きさ 0 → 1 で現れる
function fallBall(st, sp, p, base, under, yShift) {
  const { q, L, fall } = sp;
  const dir = st.dir ?? 1;
  const n = floor(q), f = q - n, t = f / L;
  const hidden = fallHidden(q, L, fall, dir, p);
  let rec = st.fall.get(sp.key);
  if (!rec) { rec = { hidden, age: -1 }; st.fall.set(sp.key, rec); }
  rec.frame = st.frame;
  if (hidden && !rec.hidden && fall.here && (p.track || f < L)) spawnFaller(st, sp, p, under, yShift, dir);
  const appear = !hidden && rec.hidden;
  if (appear) rec.age = 0;
  rec.hidden = hidden;
  if (hidden) return null;

  let pos;
  if (p.track) {
    // 落ちるサイクルでは、外側の縁へ少しずつ寄っていく
    const lat = fall.here ? min(1, dir >= 0 ? f / p.fallF : (1 - f) / (1 - p.fallB)) * p.tw / 2 : 0;
    pos = trackPos(q, p, L, base.bounce, under, lat);
  } else {
    const straight = fall.here && f < L && (dir >= 0 ? t < FALL_EDGE : t > 1 - FALL_EDGE);
    pos = straight ? fallStraight(dir >= 0 ? t : 1 - t, dir >= 0, n, p, under)
                   : (under ? ballPosUnder : ballPos)(q, p, L, base.bounce);
  }
  const b = { ...pos, y: pos.y + yShift, r: p.R, ink: sp.ink, under };
  if (rec.age >= 0) {
    const u = rec.age / FALL_GROW_SEC;
    if (u >= 1) rec.age = -1;
    else {
      b.r = p.R * u * u * (3 - 2 * u);   // ゆっくり膨らみ始めて、ゆっくり元の大きさに落ち着く
      if (!paused) rec.age += dtMs() / 1000;
    }
  }
  if (appear && base.particles > 0) spawnParticles(st, b, p, base);
  return b;
}

// 端から落ちていくボールを切り離す。横の速さは、転がってきた速さの FALL_DRIFT 倍で外側へ
function spawnFaller(st, sp, p, under, yShift, dir) {
  const n = floor(sp.q);
  let e, ox, oz, speed;
  if (p.track) {
    // オーバル・角ばったらせん：外側の縁の位置と、その外向き
    const fEdge = n + (dir >= 0 ? p.fallF : p.fallB);
    e = trackPos(fEdge, p, sp.L, 0, under, p.tw / 2);
    const o = (p.oval ? ovalPlace : squarePlace)(fEdge, p, sp.L, under);
    ox = o.ox; oz = o.oz;
    // 道に沿って進む速さ（1フレームあたり）
    speed = (p.oval ? p.W + PI * p.rc : PI * p.W / 4 + p.gap) * abs(st.du ?? 0);
  } else {
    e = fallStraight(FALL_EDGE, dir >= 0, n, p, under);
    ox = sideOf(under ? -n : n); oz = 0;
    speed = (p.W / 2) * PI / sp.L * abs(st.du ?? 0);
  }
  // 端の角から転がり落ちる：落ち始めの FALL_TIP_SEC の間に、ボールが踊り場にめり込まない所（端から半径ぶん外）まで出る
  st.fallers.push({ x: e.x, z: e.z, xe: e.x, ze: e.z, ox: ox * p.R, oz: oz * p.R, dx: 0, dz: 0,
                    vx: ox * speed * FALL_DRIFT, vz: oz * speed * FALL_DRIFT,
                    y: e.y + yShift, vy: 0, g: under ? -1 : 1, r: p.R, ink: sp.ink, under, age: 0 });
}

// 落ちていくボールを1フレームぶん動かす（裏の世界は上へ落ちる）。
// あわせて、しばらく画面に出てこないボールの記録を捨てる
function updateFallers(st, p) {
  st.frame++;
  if (st.frame % 600 === 0) for (const [k, r] of st.fall) if (st.frame - r.frame > 300) st.fall.delete(k);
  if (paused) return;
  const dt = min(dtMs() / (1000 / 60), 3);
  for (const b of st.fallers) {
    b.vy += b.g * p.R * FALL_GRAVITY * dt;
    b.dx += b.vx * dt;
    b.dz += b.vz * dt;
    const k = min(1, b.age / FALL_TIP_SEC);
    const tip = 1 - (1 - k) * (1 - k);
    b.x = b.xe + b.ox * tip + b.dx;
    b.z = b.ze + b.oz * tip + b.dz;
    b.y += b.vy * dt;
    b.age += dt / 60;
  }
  st.fallers = st.fallers.filter(b => b.age < FALL_HOLD_SEC + FALL_SHRINK_SEC);
}

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
// hand：手描きの輪郭線にするなら { amp：ぶれ（ワールド単位）, seed }
function drawBall(pos, R, col, a, e, lineCol, outline, lineW = 1, hand = null) {
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
    if (hand) handCircle(R, hand.amp, hand.seed);
    else circle(0, 0, R * 2);
  }
  pop();
}

// 踊り場0〜period-1（とそれぞれの階段）を1つのジオメトリにまとめてキャッシュする
// 形に関わるスライダーが変わったときだけ作り直す
// 列ごとに持つ（形のアニメーションでは、列ごとに形が違うため）
const stairGeos = new Map();   // 列番号 c → { key, geo }
// withStroke：輪郭線を描くか。描かないなら線のデータを作らない（作り直しが軽くなる）
// landingsOnly：踊り場だけを作る（段を1つずつ動かす STEP_SQUASH のとき）
function stairGeometry(p, c = 0, withStroke = true, landingsOnly = false) {
  const geoKey = [p.oval, p.square, p.W, p.D, p.sw, p.steps, p.H, p.gap, p.step, withStroke, landingsOnly].join(',');
  let entry = stairGeos.get(c);
  if (!entry) { entry = { key: '', geo: null }; stairGeos.set(c, entry); }
  if (geoKey !== entry.key) {
    if (entry.geo) freeGeometry(entry.geo);
    entry.geo = buildGeometry(() => {
      if (!withStroke) noStroke();
      if (p.oval) { ovalStairs(p, withStroke, landingsOnly); return; }
      for (let k = 0; k < p.period; k++) {
        const list = boxesOf(k, p);
        for (const b of (landingsOnly ? list.slice(0, 1) : list)) {
          push();
          translate(b.x, b.top + b.h / 2, b.z);
          box(b.w, b.h, b.d);
          pop();
        }
      }
    });
    entry.key = geoKey;
  }
  return entry.geo;
}

// ---------------------------------------------------------------------
// 手描きの線（HANDWRITING）
// ---------------------------------------------------------------------
// 箱の輪郭線（box() の線）をそのまま使い、p5 の線のシェーダーで線の端を少しずつずらして描く。
//   ・辺ごとに、画面の上で線と垂直な向きに少しずれる（両端のずれ方が違うので、少し傾く）
//   ・両端が辺の向きに少し伸びたり縮んだりする（角で線がはみ出したり、届かなかったりする）
//   ・ずらし方を変えて2回描く（線が2本重なる）
// 角でつながる線どうしは別々にずれるので、角のつなぎ目（join）は描かない。
// ずれ方は「辺（箱の中での位置と向き）」と種から決まる乱数で決める。形が呼吸しても、
// 画面が流れても、同じ辺は同じようにずれる。HAND_BOIL では種を順に切り替える（線の震え）
const HAND_VARIANTS = 3;
const HAND_PASSES = 2;   // 1辺を何本の線で描くか

let handStrokeShader = null;
function getHandStrokeShader() {
  if (handStrokeShader) return handStrokeShader;
  handStrokeShader = baseStrokeShader().modify({
    uniforms: { 'float uHandAmp': 2, 'float uHandSeed': 0 },
    declarations: `
      vec4 handRnd;
      float handJoin;
      float handHash(vec4 p) {
        p = fract(p * vec4(0.1031, 0.1030, 0.0973, 0.1099));
        p += dot(p, p.wzxy + 33.33);
        return fract((p.x + p.y) * (p.z + p.w));
      }
    `,
    // 物体の座標で乱数を決める（辺ごと・端ごと）
    'StrokeVertex getObjectInputs': `(StrokeVertex inputs) {
      vec3 tIn = inputs.tangentIn, tOut = inputs.tangentOut;
      bool hasIn = dot(tIn, tIn) > 1e-12, hasOut = dot(tOut, tOut) > 1e-12;
      // 2本の線のつなぎ目（向きの違う接線を両方持つ点）は描かない
      handJoin = (hasIn && hasOut && distance(normalize(tIn), normalize(tOut)) > 1e-3) ? 1.0 : 0.0;
      vec3 d = abs(normalize(hasIn ? tIn : tOut));
      vec3 q = floor(inputs.position * 64.0 + 0.5) / 64.0;   // 浮動小数の誤差をならす
      vec3 pe = q - dot(q, d) * d;                         // 辺の向きの成分を除く（辺の両端で同じ値）
      float sd = uHandSeed;
      handRnd = vec4(
        handHash(vec4(pe + d * 3.7, sd)),          // 辺ごと：線と垂直なずれ
        handHash(vec4(pe + d * 5.1, sd + 17.0)),   // 辺ごと：（予備）
        handHash(vec4(q, sd + 31.0)),              // 端ごと：線と垂直なずれ
        handHash(vec4(q, sd + 47.0)));             // 端ごと：辺の向きの伸び縮み
      return inputs;
    }`,
    // カメラの座標でずらす（画面の上で線と垂直な向き・辺の向き。少しカメラ側に寄せて、面に隠れないようにする）
    'StrokeVertex getCameraInputs': `(StrokeVertex inputs) {
      vec3 t = dot(inputs.tangentIn, inputs.tangentIn) > 1e-12 ? inputs.tangentIn : inputs.tangentOut;
      float l = length(t.xy);
      vec2 dir = l > 1e-6 ? t.xy / l : vec2(1.0, 0.0);
      vec2 nrm = vec2(-dir.y, dir.x);
      float side = (handRnd.x * 2.0 - 1.0) * 0.7 + (handRnd.z * 2.0 - 1.0) * 0.5;
      float along = (handRnd.w * 2.0 - 1.0) * 4.0;   // 伸び縮みは垂直なずれより大きくする
      inputs.position.xy += (nrm * side + dir * along) * uHandAmp;
      inputs.position.z += uHandAmp * 3.0;
      if (handJoin > 0.5) inputs.weight = 0.0;
      return inputs;
    }`,
  });
  return handStrokeShader;
}

// 手描きの線の種（折り返しなしの踊り場番号・何本目の線・HAND_BOIL の番号から決める）
function handSeed(kk, pass, variant) {
  return ((((kk % 997) + 997) % 997) * HAND_PASSES + pass) * HAND_VARIANTS + variant + 1;
}

// 階段の手描きの線を描く（塗りを描いたあとに重ねる）
// geo：階段（2踊り場分、輪郭線つき）。F：ローカル座標の基準（k + F が折り返しなしの番号）
function drawHandLines(p, base, geo, stepMode, k0, kMax, stepAt, F) {
  const hs = getHandStrokeShader();
  push();
  strokeShader(hs);
  stroke(inkColor255(base));
  strokeWeight(base.strokeWeight || 1);
  noFill();
  for (let pass = 0; pass < HAND_PASSES; pass++) {
    hs.setUniform('uHandAmp', base.handAmp);
    for (let k = k0; k <= kMax; k += p.period) {
      hs.setUniform('uHandSeed', handSeed(k + F, pass, base.handVariant));
      push();
      translate(0, k * p.step, 0);
      model(geo);
      pop();
    }
    if (stepMode) {
      // STEP_SQUASH の段：大きさ1の箱を拡大して描く（縮んだ段は、ぶれも一緒に縮む）
      for (let k = k0; k <= kMax + 1; k++) {
        for (let i = 1; i <= p.steps; i++) {
          const t = stepAt(k, i);
          if (!t) continue;
          hs.setUniform('uHandSeed', handSeed((k + F) * 64 + i, pass, base.handVariant));
          if (t.geo) {
            hs.setUniform('uHandAmp', base.handAmp * constrain(t.sy / p.rise, 0, 1));
            push(); translate(0, t.cy, 0); scale(1, t.sy, 1); model(t.geo); pop();
            continue;
          }
          // 縮んだ段はぶれも小さくする（小さな段の線が大きくはみ出さないように）
          const f = constrain(p.square ? t.sy / p.rise : min(t.sx / p.run, t.sy / p.rise, t.sz / p.sw), 0, 1);
          hs.setUniform('uHandAmp', base.handAmp * f);
          push();
          translate(t.cx, t.cy, t.cz);
          scale(t.sx, t.sy, t.sz);
          box(1);
          pop();
        }
      }
    }
  }
  resetShader();
  pop();
}

// 決まった種から乱数列を作る（mulberry32）
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 手描きの円（ボールの輪郭線）：半径が少しうねり、描き終わりが描き始めを少し追い越して、ぴったり閉じない
function handCircle(R, amp, seed) {
  const rnd = makeRng(seed * 2654435761 + 7);
  const th0 = rnd() * TWO_PI;
  const over = 0.25 + rnd() * 0.35;          // 追い越す角度
  const ph1 = rnd() * TWO_PI, ph2 = rnd() * TWO_PI;
  const drift = (rnd() - 0.3) * amp * 1.5;   // 描き終わりで半径がずれる量
  const N = 48;
  beginShape();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const th = th0 + t * (TWO_PI + over);
    const r = R + amp * (0.5 + 0.35 * sin(2 * th + ph1) + 0.25 * sin(3 * th + ph2)) + drift * t;
    vertex(r * cos(th), r * sin(th), 0);
  }
  endShape();
}

// 踊り場kと、そこから1つ上（反対側）へ向かう階段の箱リスト
// ---------------------------------------------------------------------
// オーバル（SHAPE = OVAL）
// ---------------------------------------------------------------------
// 上から見ると陸上トラックの形。踊り場kは長さ W の直線（z = sideOf(k) × rc）、
// 踊り場k-1 → k の間は半円のカーブを下る階段（踊り場kの段 i = 1〜steps。i = 1 が踊り場kのすぐ上）。
// カーブの中心は x = sideOf(k-1) × W/2。中心から見た角度 θ（0：踊り場k-1の側、π：踊り場kの側）で
// 位置は (sc·(W/2 + r·sinθ), sc·r·cosθ)。段 i は θ = (steps - i)Δ 〜 (steps - i + 1)Δ（Δ = π/steps）
// 表のボールはずっと同じ向きに回りながら下り、裏のボールは逆向きに回りながら上る

// 中心から角度 th、半径 r の点（sc：カーブの中心の側）
function ovalPt(p, sc, r, th) {
  return [sc * (p.W / 2 + r * sin(th)), sc * r * cos(th)];
}

// 扇形の段1つ（踊り場kの段 i）を、上面 y0・下面 y1 で作る（buildGeometry の中で呼ぶ）。
// 曲面は細かい平面に分ける。輪郭線は箱と同じく、縁だけに引く
function ovalWedge(p, k, i, y0, y1, withStroke) {
  const sc = sideOf(k - 1);
  const D = PI / p.steps;
  const th0 = (p.steps - i) * D, th1 = th0 + D;
  const segs = max(2, ceil(D / (PI / 24)));
  const r0 = p.rIn, r1 = p.rIn + p.tw;
  const P = (r, th, y) => { const [x, z] = ovalPt(p, sc, r, th); return [x, y, z]; };
  const V = (v, n, u = 0) => { normal(n[0], n[1], n[2]); vertex(v[0], v[1], v[2], u, u); };
  // 4点（a b c d の順に回る四角）を三角形2つで。uv は側面の縦の位置（0：上端、1：下端）
  const quad = (a, b, c, d, n, ua = 0, ub = 0, uc = 0, ud = 0) => {
    const N = Array.isArray(n[0]) ? n : [n, n, n, n];
    V(a, N[0], ua); V(b, N[1], ub); V(c, N[2], uc);
    V(a, N[0], ua); V(c, N[2], uc); V(d, N[3], ud);
  };
  const rad = th => [sc * sin(th), 0, sc * cos(th)];        // 外向き
  const tan = th => [sc * cos(th), 0, -sc * sin(th)];       // θ が増える向き
  push();
  noStroke();
  fill(255);
  beginShape(TRIANGLES);
  for (let j = 0; j < segs; j++) {
    const a = th0 + D * j / segs, b = th0 + D * (j + 1) / segs;
    quad(P(r0, a, y0), P(r1, a, y0), P(r1, b, y0), P(r0, b, y0), [0, -1, 0]);   // 上面
    quad(P(r0, a, y1), P(r0, b, y1), P(r1, b, y1), P(r1, a, y1), [0, 1, 0]);    // 下面
    const ra = rad(a), rb = rad(b), na = ra.map(v => -v), nb = rb.map(v => -v);
    quad(P(r1, a, y0), P(r1, b, y0), P(r1, b, y1), P(r1, a, y1), [ra, rb, rb, ra], 0, 0, 1, 1);  // 外側
    quad(P(r0, a, y0), P(r0, a, y1), P(r0, b, y1), P(r0, b, y0), [na, na, nb, nb], 0, 1, 1, 0);  // 内側
  }
  const t0 = tan(th0).map(v => -v), t1 = tan(th1);
  quad(P(r0, th0, y0), P(r0, th0, y1), P(r1, th0, y1), P(r1, th0, y0), t0, 0, 1, 1, 0);   // 始めの端
  quad(P(r0, th1, y0), P(r1, th1, y0), P(r1, th1, y1), P(r0, th1, y1), t1, 0, 0, 1, 1);   // 終わりの端
  endShape();
  pop();
  if (!withStroke) return;
  push();
  noFill();
  stroke(0);   // 呼ばれたときの線の設定（影の下準備では線なし）に左右されないよう、ここで決める
  beginShape(LINES);
  const L = (u, v) => { vertex(u[0], u[1], u[2]); vertex(v[0], v[1], v[2]); };
  for (let j = 0; j < segs; j++) {
    const a = th0 + D * j / segs, b = th0 + D * (j + 1) / segs;
    for (const r of [r0, r1]) for (const y of [y0, y1]) L(P(r, a, y), P(r, b, y));
  }
  for (const th of [th0, th1]) {
    for (const y of [y0, y1]) L(P(r0, th, y), P(r1, th, y));
    for (const r of [r0, r1]) L(P(r, th, y0), P(r, th, y1));
  }
  endShape();
  pop();
}

// オーバルの踊り場0・1と段（buildGeometry の中で呼ぶ）
function ovalStairs(p, withStroke, landingsOnly) {
  for (let k = 0; k <= 1; k++) {
    const top = k * p.step - p.H / 2;
    if (p.W >= 0.5) {
      push();
      translate(0, top + p.H / 2, sideOf(k) * p.rc);
      box(p.W, p.H, p.tw);
      pop();
    }
    if (landingsOnly) continue;
    for (let i = 1; i <= p.steps; i++) ovalWedge(p, k, i, top - i * p.rise, top - i * p.rise + p.rise, withStroke);
  }
}

// STEP_SQUASH 用：扇形の段1つを高さ1（y = -0.5〜0.5）で作ってキャッシュする（横の位置は本物のまま）
const ovalStepGeos = new Map();
function ovalStepGeometry(p, k, i) {
  const par = ((k % 2) + 2) % 2;
  const key = [p.W, p.D, p.steps, p.gap, par, i].join(',');
  let g = ovalStepGeos.get(key);
  if (!g) {
    if (ovalStepGeos.size > 400) { for (const v of ovalStepGeos.values()) freeGeometry(v); ovalStepGeos.clear(); }
    // 最初に作られるのは影の下準備の途中（線なし）のことがあるので、塗りと線をここで決める
    g = buildGeometry(() => { fill(255); stroke(0); ovalWedge(p, par, i, -0.5, 0.5, true); });
    ovalStepGeos.set(key, g);
  }
  return g;
}

// 進み q のボールの、道の上の位置（高さ以外）と外向き。lat：中心線から外側へのずれ。
// g：カーブの上の位置（段の数で数える。0〜steps）。直線の上では 0 以下（カーブの入口までの距離）
function ovalPlace(q, p, L, under, lat = 0) {
  const m = floor(q), f = q - m;
  const n = under ? -m : m;            // いま渡っている踊り場の番号
  const s = sideOf(n);
  const r = p.rc + lat;
  if (f < L) {
    const t = f / L;
    // 表は -s·W/2 → +s·W/2、裏は逆向きに渡る。どちらも渡り終えた所がカーブの入口
    const x = s * p.W / 2 * (under ? 1 - 2 * t : 2 * t - 1);
    return { x, z: s * r, ox: 0, oz: s, g: (t - 1) * p.W / p.arc, n, landing: true };
  }
  const u = (f - L) / (1 - L);
  const sc = under ? -s : s;           // カーブの中心の側
  const th = PI * (under ? 1 - u : u);
  const [x, z] = ovalPt(p, sc, r, th);
  return { x, z, ox: sc * sin(th), oz: sc * cos(th), g: u * p.steps, n, landing: false };
}

// カーブの上の位置 g（段の数）でボールが触れる高さ。表：上面に乗る、裏：底面にぶら下がる。
// 段の角も箱と同じく、半径 R の球が角に触れる高さで乗り越える
function ovalSurfY(g, n, p, under) {
  const R = p.R, T0 = n * p.step - p.H / 2, a = p.arc;
  const segs = [];   // [g の始め, 終わり, 面の高さ]
  if (!under) {
    segs.push([-Infinity, 0, T0]);
    for (let m = 1; m <= p.steps; m++) segs.push([m - 1, m, T0 + m * p.rise]);
    segs.push([p.steps, Infinity, T0 + (p.steps + 1) * p.rise]);
  } else {
    segs.push([-Infinity, 0, T0 + p.H]);
    for (let m = 1; m <= p.steps; m++) segs.push([m - 1, m, T0 - (m - 1) * p.rise]);
    segs.push([p.steps, Infinity, T0 - (p.steps + 1) * p.rise + p.H]);
  }
  let y = under ? -Infinity : Infinity;
  for (const [g0, g1, h] of segs) {
    const d = max(g0 - g, 0, g - g1) * a;
    if (d >= R) continue;
    const c = sqrt(R * R - d * d);
    y = under ? max(y, h + c) : min(y, h - c);
  }
  return y;
}

// 裏の世界では段差を越えるとき、重力（上向き）で放物線を描いて上る／縁から落ちる（ballPosUnder と同じ考え方）
function ovalContactY(g, n, p, under) {
  let y = ovalSurfY(g, n, p, under);
  if (!under) return y;
  const fall = 4 * p.rise;
  for (let d = 0.1; d <= 2.5; d += 0.1) {
    y = max(y, ovalSurfY(g - d, n, p, true) - fall * d * d);
    y = max(y, ovalSurfY(g + d, n, p, true) - fall * d * d);
  }
  return y;
}

// オーバルのボールの位置（折り返しなしの踊り場番号での座標）
function ovalPos(q, p, L, bounce = 0, under = false, lat = 0) {
  const pl = ovalPlace(q, p, L, under, lat);
  let y = ovalContactY(pl.g, pl.n, p, under);
  if (bounce > 0 && !pl.landing && p.steps > 0) {
    // 着地点（入口 → 各段の中央 → 出口）の間を放物線で跳ぶ（ballPos と同じ）
    const g = pl.g;
    let a, b;
    if (g < 0.5) { a = 0; b = 0.5; }
    else if (g > p.steps - 0.5) { a = p.steps - 0.5; b = p.steps; }
    else { a = floor(g - 0.5) + 0.5; b = a + 1; }
    const ya = ovalContactY(a, pl.n, p, under), yb = ovalContactY(b, pl.n, p, under);
    const k = (g - a) / (b - a);
    const h = bounce * p.rise * (b - a);
    y = under ? max(y, lerp(ya, yb, k) + 4 * h * k * (1 - k)) : min(y, lerp(ya, yb, k) - 4 * h * k * (1 - k));
  }
  return { x: pl.x, y, z: pl.z };
}

// ---------------------------------------------------------------------
// 角ばったらせん（SHAPE = SQUARE）
// ---------------------------------------------------------------------
// 踊り場kは四隅の1つ（SQUARE_CORNERS を k の順に回る）にある一辺 W の正方形。
// 踊り場k-1 → k の間は、正方形の1辺に沿ったまっすぐな階段（踊り場kの段 i = 1〜steps。i = 1 が踊り場kのすぐ上）。
// 段は箱なので、ボールの高さは折り返し階段と同じ contactY / contactYUnder で求める
const SQUARE_CORNERS = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
function squareCorner(k, p) {
  const c = SQUARE_CORNERS[((k % 4) + 4) % 4];
  return { x: c[0] * p.h, z: c[1] * p.h };
}

// 踊り場kと、その段（踊り場k-1 の側へ並ぶ）
function squareBoxes(k, p) {
  const P = squareCorner(k, p), Q = squareCorner(k - 1, p);
  const top = k * p.step - p.H / 2;
  const list = [{ x: P.x, z: P.z, top, w: p.W, h: p.H, d: p.W }];
  const dx = Math.sign(Q.x - P.x), dz = Math.sign(Q.z - P.z);   // 踊り場k-1 へ向かう向き（どちらかは0）
  for (let i = 1; i <= p.steps; i++) {
    const c = p.W / 2 + (i - 0.5) * p.run;
    list.push({
      x: P.x + dx * c, z: P.z + dz * c, top: top - i * p.rise,
      w: dx ? p.run : p.tw, h: p.rise, d: dz ? p.run : p.tw,
    });
  }
  return list;
}

// 進み q のボールの、道の上の位置（高さ以外）と外向き。lat：中心線から外側（正方形の外）へのずれ。
// 表：踊り場nで四分円を描いて曲がり、踊り場n+1 へまっすぐ下る。裏：その逆向き（踊り場n → n-1 へ上る）
// g：階段の上の位置（段の数で数える。0〜steps、踊り場nの側が0）。at(g)：階段の上の点
function squarePlace(q, p, L, under, lat = 0) {
  const m = floor(q), f = q - m;
  const n = under ? -m : m;
  const P = squareCorner(n, p), A = squareCorner(n - 1, p), B = squareCorner(n + 1, p);
  const din = { x: Math.sign(P.x - A.x), z: Math.sign(P.z - A.z) };    // 踊り場n-1 → n の向き
  const dout = { x: Math.sign(B.x - P.x), z: Math.sign(B.z - P.z) };   // 踊り場n → n+1 の向き
  const w2 = p.W / 2;
  if (f < L) {
    // 四分円：中心 C = P - din·W/2 + dout·W/2、入口 P - din·W/2 → 出口 P + dout·W/2
    const t = f / L;
    const phi = HALF_PI * (under ? 1 - t : t);
    const cx = P.x - din.x * w2 + dout.x * w2, cz = P.z - din.z * w2 + dout.z * w2;
    const ux = -dout.x * cos(phi) + din.x * sin(phi), uz = -dout.z * cos(phi) + din.z * sin(phi);   // 中心から外向き
    const r = w2 + lat;
    return { x: cx + ux * r, z: cz + uz * r, ox: ux, oz: uz, n, landing: true };
  }
  const u = (f - L) / (1 - L);
  // 表は踊り場nの出口から n+1 へ、裏は踊り場nの入口から n-1 へ
  const d = under ? { x: -din.x, z: -din.z } : dout;
  const s0 = under ? { x: P.x - din.x * w2, z: P.z - din.z * w2 } : { x: P.x + dout.x * w2, z: P.z + dout.z * w2 };
  // 外向き：階段の向きに垂直で、正方形の中心から離れる向き
  const ox = d.z !== 0 ? Math.sign(P.x) : 0, oz = d.x !== 0 ? Math.sign(P.z) : 0;
  const at = g => ({ x: s0.x + d.x * p.gap * (g / p.steps) + ox * lat, z: s0.z + d.z * p.gap * (g / p.steps) + oz * lat });
  const g = u * p.steps;
  return { ...at(g), ox, oz, n, landing: false, g, at };
}

// 角ばったらせんのボールの位置
function squarePos(q, p, L, bounce = 0, under = false, lat = 0) {
  const pl = squarePlace(q, p, L, under, lat);
  const yAt = (x, z) => under ? contactYUnder(x, z, pl.n, p) : contactY(x, z, pl.n, p);
  if (pl.landing) return { x: pl.x, y: yAt(pl.x, pl.z), z: pl.z };
  // 裏の世界では、段差を越えるとき放物線で上る／縁から落ちる（ballPosUnder と同じ）
  const yU = g => { const v = pl.at(g); return yAt(v.x, v.z); };
  const g = pl.g;
  let y = yU(g);
  if (under) {
    const fall = 4 * p.rise;
    for (let d = 0.1; d <= 2.5; d += 0.1) {
      const gb = max(g - d, 0), gf = min(g + d, p.steps);
      y = max(y, yU(gb) - fall * sq(g - gb));
      y = max(y, yU(gf) - fall * sq(gf - g));
    }
  }
  if (bounce > 0 && p.steps > 0) {
    let a, b;
    if (g < 0.5) { a = 0; b = 0.5; }
    else if (g > p.steps - 0.5) { a = p.steps - 0.5; b = p.steps; }
    else { a = floor(g - 0.5) + 0.5; b = a + 1; }
    const ya = yU(a), yb = yU(b);
    const k = (g - a) / (b - a);
    const h = bounce * p.rise * (b - a);
    y = under ? max(y, lerp(ya, yb, k) + 4 * h * k * (1 - k)) : min(y, lerp(ya, yb, k) - 4 * h * k * (1 - k));
  }
  return { x: pl.x, y, z: pl.z };
}

// オーバル・角ばったらせんの位置（形で振り分ける）
function trackPos(q, p, L, bounce = 0, under = false, lat = 0) {
  return p.oval ? ovalPos(q, p, L, bounce, under, lat) : squarePos(q, p, L, bounce, under, lat);
}

function boxesOf(k, p) {
  if (p.square) return squareBoxes(k, p);
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
// bounce：段を跳ねて下りるときの跳ねの高さ（段の高さ rise の何倍か）。0 なら転がる
function ballPos(q, p, L, bounce = 0) {
  const n = floor(q);
  const f = q - n;
  const s = sideOf(n);
  let x, z;

  if (f < L) {
    // 踊り場nでU字に折り返す（奥/手前を入れ替える）
    const t = f / L;
    x = s * (p.gap / 2 + (p.W / 2) * sin(PI * t));
    z = s * p.zc * cos(PI * t);
    return { x, y: contactY(x, z, n, p), z };
  }

  // 踊り場nから踊り場n+1へ階段を進む
  const t = (f - L) / (1 - L);
  x = s * (p.gap / 2 - p.gap * t);
  z = -s * p.zc;
  let y = contactY(x, z, n, p);   // 転がる場合：段の角を乗り越えながら進む

  if (bounce > 0 && p.steps > 0) {
    // 跳ねる場合：着地点（踊り場nの端 → 各段の中央 → 踊り場n+1の端）の間を放物線で跳ぶ。
    // 横の速さは一定のままなので、高さが時間の2次式になり、投げた物と同じ軌跡になる
    const g = t * p.steps;                 // 階段の上での位置（段の数で数える。0〜steps）
    let a, b;                              // 今の跳びの始点・終点（同じ単位）
    if (g < 0.5) { a = 0; b = 0.5; }
    else if (g > p.steps - 0.5) { a = p.steps - 0.5; b = p.steps; }
    else { a = floor(g - 0.5) + 0.5; b = a + 1; }
    const xAt = v => s * (p.gap / 2 - p.run * v);
    const ya = contactY(xAt(a), z, n, p), yb = contactY(xAt(b), z, n, p);
    const k = (g - a) / (b - a);           // 跳びの進み具合（0〜1）
    const h = bounce * p.rise * (b - a);   // 跳ぶ高さ（半分の長さの跳びは半分の高さ）
    // y は下向きなので、上へ跳ぶのは y を減らす方向。床や段の角より下には行かない
    y = min(y, lerp(ya, yb, k) - 4 * h * k * (1 - k));
  }
  return { x, y, z };
}

// 裏の世界のボールの位置（折り返しなしの踊り場番号での座標）。重力が逆向きで、底面を転がる。
// 進み q の整数部 m に対して、踊り場 n = -m の底面でU字に折り返し、
// 踊り場nの段の下（i = 1, 2, ...）を通って踊り場 n-1 の底面へ上る。q が増えるほど上へ進む
function ballPosUnder(q, p, L, bounce = 0) {
  const m = floor(q);
  const f = q - m;
  const n = -m;
  const s = sideOf(n);
  let x, z;

  if (f < L) {
    // 踊り場nの底面でU字に折り返す（下から来た階段の列 → 上へ向かう階段の列）
    const t = f / L;
    x = s * (p.gap / 2 + (p.W / 2) * sin(PI * t));
    z = -s * p.zc * cos(PI * t);
    return { x, y: contactYUnder(x, z, n, p), z };
  }

  // 踊り場nの段の下を、踊り場 n-1 へ向かって進む
  const t = (f - L) / (1 - L);
  x = s * (p.gap / 2 - p.gap * t);
  z = s * p.zc;
  const xAtG = v => s * (p.gap / 2 - p.run * v);   // 階段の上での位置（段の数で数える）→ x
  // 裏の道には、ボールの半径より大きい段差がある（角を転がるだけでは越えられない）：
  //   踊り場の底面 → 最初の段の下：踊り場の厚さ H ぶん（ボールにとって）落ちる
  //   最後の段の下 → 次の踊り場の底面：H が段の高さの2倍より大きいと、その差だけ上る
  // そこで、前後の各位置から放物線を引き、一番ボールにとって高いもの（y が一番大きいもの）を採る。
  // 後ろから引いた線は縁から落ちる軌跡、前から引いた線は段差へ跳び上がる軌跡になる
  const g = t * p.steps;
  const fall = 4 * p.rise;   // 放物線の曲がり具合（段1つぶん進む間に 4 × rise）
  let y = contactYUnder(x, z, n, p);
  for (let d = 0.1; d <= 2.5; d += 0.1) {
    const gb = max(g - d, 0), gf = min(g + d, p.steps);
    y = max(y, contactYUnder(xAtG(gb), z, n, p) - fall * sq(g - gb));
    y = max(y, contactYUnder(xAtG(gf), z, n, p) - fall * sq(gf - g));
  }

  if (bounce > 0 && p.steps > 0) {
    // 表と同じく着地点の間を放物線で跳ぶ。跳ぶ向きは下（y が増える向き）
    let a, b;
    if (g < 0.5) { a = 0; b = 0.5; }
    else if (g > p.steps - 0.5) { a = p.steps - 0.5; b = p.steps; }
    else { a = floor(g - 0.5) + 0.5; b = a + 1; }
    const ya = contactYUnder(xAtG(a), z, n, p), yb = contactYUnder(xAtG(b), z, n, p);
    const k = (g - a) / (b - a);
    const h = bounce * p.rise * (b - a);
    y = max(y, lerp(ya, yb, k) + 4 * h * k * (1 - k));
  }
  return { x, y, z };
}

// 裏の世界：位置 (x, z) のボールが、踊り場nまわりの箱の底面に下から接する高さ。
// 接する高さのうち一番低いもの（y が一番大きいもの）を採用する（めり込み防止）。
// 対象は、このサイクルで触れうる箱だけ：踊り場n と n-1、踊り場nの段（これから下を通る）、
// 踊り場n+1 の段（下から上ってきた階段）。踊り場n+1 は同じ側の2つ下にあり、対象にすると
// 階段の終わりで真下の踊り場に引き寄せられてしまう
function contactYUnder(x, z, n, p) {
  const R = p.R;
  const near = [boxesOf(n - 1, p)[0]].concat(boxesOf(n, p), boxesOf(n + 1, p).slice(1));
  let y = -Infinity;
  for (const b of near) {
    const dx = max(b.x - b.w / 2 - x, 0, x - (b.x + b.w / 2));
    const dz = max(b.z - b.d / 2 - z, 0, z - (b.z + b.d / 2));
    const d2 = dx * dx + dz * dz;
    if (d2 < R * R) {
      y = max(y, b.top + b.h + sqrt(R * R - d2));
    }
  }
  if (y === -Infinity) y = n * p.step + p.H / 2 + R;
  return y;
}

// 位置 (x, z) にあるボールが、踊り場n・n+1まわりの箱の上面に接する高さ。
// 接する高さのうち一番高いものを採用する（めり込み防止）
function contactY(x, z, n, p) {
  const R = p.R;
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
  return y;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}