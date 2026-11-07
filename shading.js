// =====================================================================
// シェーディング（階段とボールの塗り方）と影
// ---------------------------------------------------------------------
// 形（ジオメトリ）は sketch.js が p5 で作り、塗り方と影はこのファイルが担当する。
// SHADINGS に1エントリ足すだけで、新しい塗り方をパネルから選べるようになる。
// 色は「紙（uPaper）」と「インク（uInk）」の2色だけを使う。
//
// 影はシャドウマップで計算する：毎フレーム、光源から見た奥行きを画面外のバッファに
// 描き（shadowPass）、本番の描画で「このピクセルは光源から隠れているか」を調べる。
// 階段・踊り場・ボールのすべてが、互いに影を落とし合う。
//
// 各エントリ：
//   stair  : 階段のフラグメントシェーダー（共通ヘッダ FRAG_HEAD の後ろに連結）
//   ball   : ボールのフラグメントシェーダー。省略すると sketch.js の通常描画になる
//   stroke : 階段の輪郭線を描くか
//   shadow : 影を計算するか（false なら shadowPass を省略して軽くなる）
//   params : シェーダーに渡す値（uniform名: 値）
//   base   : 別エントリを継承して params だけ上書きする場合に、その名前
//
// フラグメントシェーダーで使える値（共通ヘッダで宣言済み）：
//   vNormal    面の法線（階段ローカル座標。yは下向きなので上面は (0,-1,0)）
//   vPos       階段ローカル座標での位置（スクロール前）
//   vVert      箱の側面の縦方向の位置：0 = 面の上端、1 = 面の下端
//   uLightDir  光源へ向かう単位ベクトル
//   uPaper / uInk  2色（COLOR_A / COLOR_B）、uMid その中間色
//   uIsInk     ボール用：1 = インクのボール（黒）、0 = 紙のボール（白）
//   lambert()  面が光の方を向いている度合い（0〜1、背を向けた面は0）
//   shadows()  光が届く割合 vec2(ボールの影, 階段の影)（0 = 影の中、1 = 日なた）
//   withShadows(plainTone, ballTone, sh) 明るさに2種類の影をかける
//   grain(tone) 明るさ tone（0〜1）を、紙とインクの粒の密度に置き換えた色
// =====================================================================

// 光源へ向かう方向（階段ローカル座標、yは下向き）。LIGHT = FIXED のときに使う。
// LIGHT = CAMERA のときは sketch.js がカメラから計算した向き（ctx.lightDir）を使う
const LIGHT_DIR = [0.5, -1.0, -0.3];

const SHADOW_RES = 2048;   // シャドウマップの解像度（正方形）

const SHADE_VERT = `
precision highp float;
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform vec3 uOffset;      // 階段：踊り場kぶんのずれ / ボール：中心
uniform float uObjScale;   // 階段：1 / ボール：半径（sphere() は半径1の形を拡大して描くため）
varying vec3 vNormal;
varying vec3 vPos;
varying float vVert;

void main() {
  // buildGeometry() は箱の拡大縮小を法線に反映するだけで、長さを1に戻さない
  vNormal = normalize(aNormal);
  vPos = aPosition * uObjScale + uOffset;
  // box() の側面は、面によって縦方向がuかvかが違う
  // （-x面と+z面はv、+x面と-z面はu。どちらも0が上端）
  bool useV = vNormal.x < -0.5 || vNormal.z > 0.5;
  vVert = useV ? aTexCoord.y : aTexCoord.x;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}
`;

// シャドウマップ用：光源から見た位置に描くだけ（奥行きはバッファに自動で残る）
const DEPTH_VERT = `
precision highp float;
attribute vec3 aPosition;
uniform mat4 uLightVP;
uniform vec3 uOffset;
uniform float uObjScale;
void main() {
  gl_Position = uLightVP * vec4(aPosition * uObjScale + uOffset, 1.0);
}
`;
const DEPTH_FRAG = `
precision highp float;
void main() { gl_FragColor = vec4(1.0); }
`;
// ボール用：奥行きに加えて、ボールの中心の高さ（y）を色として書き込む
const DEPTH_BALL_FRAG = `
precision highp float;
uniform float uBallY;
void main() { gl_FragColor = vec4(uBallY, 0.0, 0.0, 1.0); }
`;

const FRAG_HEAD = `
precision highp float;
varying vec3 vNormal;
varying vec3 vPos;
varying float vVert;
uniform vec3 uLightDir;
uniform float uZoom;        // 1ワールド単位あたりの画面ピクセル数
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uMid;          // 中間色（インクと紙を STAIR_SHADOW の割合で混ぜた色。混ぜ方は MIX）
uniform float uGrain;       // 粒の大きさ（画面ピクセル）
uniform float uIsInk;
uniform sampler2D uBallMap;   // ボールだけを描いたシャドウマップ（奥行き）
uniform sampler2D uBallInfo;  // 同じマップの色：そのボールの中心の高さ y
uniform float uBallReach;     // ボールの影が届く高さの範囲（ボール中心からの上下の距離）
uniform sampler2D uStairMap;  // 階段・踊り場だけを描いたシャドウマップ
uniform float uUseStairShadow;
uniform float uStairShadowTone; // 階段の影の中の明るさ（1 = 階段の影なし）
uniform mat4 uLightVP;      // 階段ローカル座標 → 光源から見た座標
uniform vec2 uShadowBlurUV; // 影のふちのぼかし半径（シャドウマップ上の大きさ）
uniform float uBlurWorld;   // 同じ半径のワールド単位での大きさ
uniform float uTexelWorld;  // シャドウマップ1画素のワールド単位での大きさ
uniform float uDepthPerWorld; // ワールド単位1 → シャドウマップの奥行きの値
uniform float uUseShadow;

float hash3(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
bool isTop()    { return vNormal.y < -0.5; }
bool isBottom() { return vNormal.y >  0.5; }
bool isSide()   { return abs(vNormal.y) < 0.5; }

float lambert() { return max(dot(vNormal, uLightDir), 0.0); }

// 影の判定。シャドウマップを8点調べ、光が届く割合を返す
//   x = ボールの影（0 = ボールの影の中）
//   y = 階段・踊り場の影（0 = 階段の影の中）
// ボールの影は、影を受ける面がボールと同じ階にあるとき（高さの差が uBallReach 以内）だけ数える。
// ボールが乗っている床を突き抜けて、下の階に影が落ちるのを防ぐため。
// 上に踊り場があってもボールの影は消さず、階段の影より優先して暗くする。
// 調べる点の並びをピクセルごとに回転させ、ふちを粒っぽくぼかす
vec2 shadows() {
  if (uUseShadow < 0.5) return vec2(1.0);
  // 自分自身に影を落とさないための許容量（バイアス）
  // 光に対して斜めの面ほど、周りを調べたときの奥行きの差が大きいので許容量を増やす
  float ndl = max(dot(vNormal, uLightDir), 0.1);
  float slope = min(sqrt(1.0 - ndl * ndl) / ndl, 10.0);
  float bias = (uTexelWorld * (1.0 + slope) + uBlurWorld * slope) * uDepthPerWorld;

  vec3 p = vPos + vNormal * uTexelWorld * 1.5;
  vec4 c = uLightVP * vec4(p, 1.0);
  vec3 s = c.xyz * 0.5 + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) return vec2(1.0);
  float z = s.z - bias;
  float ang = hash3(floor(vPos * uZoom * 0.5)) * 6.2831853;
  float ballLit = 0.0, stairLit = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = ang + float(i) * 2.3999632;
    float r = sqrt((float(i) + 0.5) / 8.0);
    vec2 uv = s.xy + vec2(cos(a), sin(a)) * r * uShadowBlurUV;
    float db = texture2D(uBallMap, uv).r;   // 光源に一番近いボールの奥行き
    float by = texture2D(uBallInfo, uv).r;  // そのボールの中心の高さ
    float ds = uUseStairShadow > 0.5 ? texture2D(uStairMap, uv).r : 1.0;
    bool stairOcc = z > ds;
    bool ballOcc = z > db && abs(vPos.y - by) <= uBallReach;
    ballLit  += ballOcc  ? 0.0 : 1.0;
    stairLit += stairOcc ? 0.0 : 1.0;
  }
  return vec2(ballLit, stairLit) / 8.0;
}

// 階段の影とボールの影をかけた明るさを返す
//   plainTone：影なしの明るさ / ballTone：ボールの影の中での明るさ / sh：shadows() の結果
// 階段の影の中では uStairShadowTone より明るくならず、ボールの影はそれより優先して暗くする
float withShadows(float plainTone, float ballTone, vec2 sh) {
  float t = mix(min(plainTone, uStairShadowTone), plainTone, sh.y);
  return mix(min(t, ballTone), t, sh.x);
}

// 明るさを粒の密度に置き換える（ワールド座標に貼りついた乱数を使う）
vec4 grain(float tone) {
  float n = hash3(floor(vPos * uZoom / uGrain));
  return vec4(n < tone ? uPaper : uInk, 1.0);
}
`;

const SHADINGS = {
  // 白い箱＋輪郭線（シェーディング・影なし）
  NONE: {
    stair: `
      void main() { gl_FragColor = vec4(uPaper, 1.0); }
    `,
    stroke: true,
    shadow: false,
    params: { uPaper: [1, 1, 1], uInk: [0, 0, 0] },
  },

  // 3値：面の明るさ（光への向き）で 白 / 中間色 / 黒 に塗り分ける。
  // 中間色は紙とインクを STAIR_SHADOW の割合で混ぜた色。
  // 階段の影の中は中間色まで暗くなり、ボールの影は常に黒
  FLAT: {
    stair: `
      uniform vec2 uLevels;  // 光への向き（0〜1）の境目：x 以下は黒、y より上は白、その間は中間色
      void main() {
        float lam = lambert();
        float level = lam > uLevels.y ? 2.0 : (lam > uLevels.x ? 1.0 : 0.0);
        vec2 sh = shadows();
        if (sh.y < 0.5) level = min(level, 1.0);  // 階段の影
        if (sh.x < 0.5) level = 0.0;              // ボールの影
        vec3 col = level > 1.5 ? uPaper : (level > 0.5 ? uMid : uInk);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    stroke: true,
    params: { uPaper: [1, 1, 1], uInk: [0, 0, 0], uLevels: [0.15, 0.55], uShadowBlur: 0 },
  },

  // 粒子のグラデーション。面の明るさ＝光の当たり具合×影（＋側面の縦グラデーション）
  GRAIN: {
    stair: `
      uniform float uAmbient;    // 光が当たらない面の明るさ
      uniform float uExposure;   // 光の強さ（大きいほど、斜めに当たる面も白く飛ぶ）
      uniform float uGradient;   // 側面の縦グラデーションの幅（上端が暗く、下端が明るい）

      float toneOf(float lit) {
        float tone = uAmbient + (1.0 - uAmbient) * clamp(lit * uExposure, 0.0, 1.0);
        if (isSide()) tone += uGradient * (vVert - 0.5);
        return clamp(tone, 0.0, 1.0);
      }

      void main() {
        float lam = lambert();
        float plainTone = toneOf(lam);   // 影なし
        float ballTone = toneOf(0.0);    // ボールの影の中（光が届かない）
        gl_FragColor = grain(withShadows(plainTone, ballTone, shadows()));
      }
    `,
    ball: `
      uniform float uExposure;
      uniform vec2 uBallTone;     // 紙のボール：明るさの範囲（影側 〜 光を受けた側）
      uniform vec2 uInkBallTone;  // インクのボール：明るさの範囲

      void main() {
        // 階段の影の中では、直接の光が uStairShadowTone の割合まで弱まる
        vec2 sh = shadows();
        float stairLight = mix(uStairShadowTone, 1.0, sh.y);
        float lit = clamp(lambert() * sh.x * stairLight * uExposure, 0.0, 1.0);
        float tone = uIsInk > 0.5
          // インクのボール：光を正面から受けた所だけ、粒のハイライトが出る。
          // 階段の影の中ではハイライトが消えてほぼベタになり、グレーの影と見分けがつく
          ? mix(uInkBallTone.x, uInkBallTone.y, lit * lit)
          // 紙のボール：大部分を白く保ち、影側だけ粒が詰まる。
          // 階段の影の中でも、周りのグレーより明るく残る
          : mix(uBallTone.x, uBallTone.y, sqrt(lit));
        gl_FragColor = grain(tone);
      }
    `,
    stroke: false,
    params: {
      uPaper: [1, 1, 1], uInk: [0, 0, 0],
      uGrain: 1.0, uAmbient: 0.06, uExposure: 1.4, uGradient: 0.35,
      uShadowBlur: 5,   // 影のふちのぼかし（ワールド単位）
      uBallTone: [0.12, 1.0], uInkBallTone: [0.0, 0.3],
    },
  },
};
// 紙（uPaper）とインク（uInk）は、パネルの COLOR_A / COLOR_B（INVERT で入れ替え）が
// どのシェーディングにも上書きで使われる（ctx.paper / ctx.ink）。params の値はその予備。
// 中間色（uMid）は、インクと紙を STAIR_SHADOW の割合で混ぜた色。混ぜ方は MIX で選ぶ

// ---------------------------------------------------------------------
// 中間色の計算（色はすべて 0〜1 の sRGB）
//   SRGB   ：画面の RGB 値をそのまま混ぜる。暗めに寄り、補色どうしだと濁る
//   LINEAR ：光の強さ（リニア）で混ぜる。物理的な光の混ざり方で、明るめに寄る
//   OKLAB  ：人の見た目に合わせた色空間で混ぜる。明るさが見た目どおり真ん中に来る
// ---------------------------------------------------------------------
const toLinear = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const toSrgb = c => {
  c = Math.min(1, Math.max(0, c));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
};
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}
function oklabToLinear([L, a, b]) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
// 色 a と b を t（0 = a、1 = b）で混ぜる
function mixColor(a, b, t, mode) {
  const lerp3 = (x, y) => x.map((v, i) => v + (y[i] - v) * t);
  if (mode === 'SRGB') return lerp3(a, b);
  const la = a.map(toLinear), lb = b.map(toLinear);
  if (mode === 'LINEAR') return lerp3(la, lb).map(toSrgb);
  return oklabToLinear(lerp3(linearToOklab(la), linearToOklab(lb))).map(toSrgb);
}

// ---------------------------------------------------------------------
// 以下は仕組み部分（通常は触らなくてよい）
// ---------------------------------------------------------------------
const shaderCache = {};
const shadowFb = {};   // { ball, stair }：シャドウマップ用のバッファ

// 名前からシェーディング設定を解決する（base があれば継承）
function resolveShading(name) {
  const s = SHADINGS[name];
  if (!s.base) return { shadow: true, ...s, key: name };
  const b = resolveShading(s.base);
  return { ...b, ...s, params: { ...b.params, ...s.params } };
}

function getShader(id, vert, frag) {
  if (!shaderCache[id]) shaderCache[id] = createShader(vert, frag);
  return shaderCache[id];
}

function lightDirOf(ctx) {
  const L = createVector(...(ctx.lightDir || LIGHT_DIR)).normalize();
  return L;
}

// 光源から見た正射影の行列を作る（列優先の16要素）
// bounds：影を受ける範囲 { x:[min,max], y:[min,max], z:[min,max] }
// casterY：影を落とす物の y 範囲（光源側にはみ出した物も奥行きに収めるため）
function lightMatrix(L, bounds, casterY) {
  const ref = abs(L.y) > 0.99 ? createVector(1, 0, 0) : createVector(0, 1, 0);
  const r = p5.Vector.cross(L, ref).normalize();
  const u = p5.Vector.cross(r, L).normalize();

  const corners = (ys) => {
    const out = [];
    for (const x of bounds.x) for (const y of ys) for (const z of bounds.z) out.push(createVector(x, y, z));
    return out;
  };
  const recv = corners(bounds.y);
  const all = recv.concat(corners(casterY));
  const range = (pts, axis) => {
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { const v = p.dot(axis); lo = min(lo, v); hi = max(hi, v); }
    return [lo, hi];
  };
  const [x0, x1] = range(recv, r);
  const [y0, y1] = range(recv, u);
  const [z0, z1] = range(all, L);
  const hx = (x1 - x0) / 2 + 1, cx = (x0 + x1) / 2;
  const hy = (y1 - y0) / 2 + 1, cy = (y0 + y1) / 2;
  const hz = (z1 - z0) / 2 + 1, cz = (z0 + z1) / 2;

  // 行：X = (p·r - cx)/hx, Y = (p·u - cy)/hy, Z = -(p·L - cz)/hz（光源に近いほど小さい）
  const rows = [
    [r.x / hx, r.y / hx, r.z / hx, -cx / hx],
    [u.x / hy, u.y / hy, u.z / hy, -cy / hy],
    [-L.x / hz, -L.y / hz, -L.z / hz, cz / hz],
    [0, 0, 0, 1],
  ];
  const m = [];
  for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) m.push(rows[rr][c]);
  return { m, hx, hy, hz };
}

// 影の下準備。光源から見た奥行きをシャドウマップに描く
// ボールの影と階段の影を別々の濃さで塗れるよう、マップを2枚に分けて描く
// drawStairs(depthShader) / drawBalls(depthShader)：影を落とす物を描く関数。
//   物ごとに uOffset / uObjScale を渡して描く
// ctx.stairShadowTone：階段の影の中の明るさ（1 なら階段の影を計算しない）
function shadowPass(name, ctx, bounds, casterY, drawStairs, drawBalls) {
  const s = resolveShading(name);
  ctx.useShadow = s.shadow;
  if (!s.shadow) return;
  ctx.useStairShadow = (ctx.stairShadowTone ?? 1) < 1;

  const L = lightDirOf(ctx);
  const lm = lightMatrix(L, bounds, casterY);
  ctx.light = lm;

  // ボールのマップは色にボールの高さ（y）を書くので、色も小数で持てる形式にする
  renderDepth('ball', lm, drawBalls, DEPTH_BALL_FRAG, FLOAT);
  if (ctx.useStairShadow) renderDepth('stair', lm, drawStairs, DEPTH_FRAG, UNSIGNED_BYTE);
}

function renderDepth(which, lm, draw, frag, format) {
  if (!shadowFb[which]) {
    shadowFb[which] = createFramebuffer({
      width: SHADOW_RES, height: SHADOW_RES, density: 1, format,
      depthFormat: FLOAT, textureFiltering: NEAREST, antialias: false,
    });
  }
  const fb = shadowFb[which];
  const dsh = getShader('depth:' + which, DEPTH_VERT, frag);
  fb.begin();
  clear();
  shader(dsh);
  noStroke();
  dsh.setUniform('uLightVP', lm.m);
  draw(dsh);
  resetShader();
  fb.end();
}

// 全シェーダー共通の値を渡す
function setCommonUniforms(sh, s, ctx) {
  const L = lightDirOf(ctx);
  sh.setUniform('uLightDir', [L.x, L.y, L.z]);
  sh.setUniform('uZoom', ctx.zoom * pixelDensity());
  sh.setUniform('uGrain', 1.0);
  for (const [k, v] of Object.entries(s.params)) {
    if (k !== 'uShadowBlur') sh.setUniform(k, v);
  }
  if (ctx.ink) sh.setUniform('uInk', ctx.ink);
  if (ctx.paper) sh.setUniform('uPaper', ctx.paper);
  sh.setUniform('uMid', midColor(s, ctx));

  const lm = ctx.light;
  sh.setUniform('uUseShadow', ctx.useShadow && lm ? 1 : 0);
  if (ctx.useShadow && lm) {
    const texelWorld = max(lm.hx, lm.hy) * 2 / SHADOW_RES;
    const blur = s.params.uShadowBlur || 0;
    sh.setUniform('uBallMap', shadowFb.ball.depth);
    sh.setUniform('uBallInfo', shadowFb.ball.color);
    sh.setUniform('uBallReach', ctx.ballReach ?? 1e9);
    sh.setUniform('uUseStairShadow', ctx.useStairShadow ? 1 : 0);
    sh.setUniform('uStairShadowTone', ctx.stairShadowTone ?? 1);
    if (ctx.useStairShadow) sh.setUniform('uStairMap', shadowFb.stair.depth);
    else sh.setUniform('uStairMap', shadowFb.ball.depth);  // 使わないが、何か渡しておく
    sh.setUniform('uLightVP', lm.m);
    sh.setUniform('uShadowBlurUV', [blur / (2 * lm.hx), blur / (2 * lm.hy)]);
    sh.setUniform('uBlurWorld', blur);
    sh.setUniform('uTexelWorld', texelWorld);
    sh.setUniform('uDepthPerWorld', 1 / (2 * lm.hz));
  }
}

// 階段を描く前に呼ぶ。戻り値のシェーダーに、コピーごとに uOffset を渡して描く
function beginShading(name, ctx) {
  const s = resolveShading(name);
  const sh = getShader(s.key + ':stair', SHADE_VERT, FRAG_HEAD + s.stair);
  shader(sh);
  setCommonUniforms(sh, s, ctx);
  sh.setUniform('uObjScale', 1.0);
  if (s.stroke) stroke(inkColor255(ctx)); else noStroke();
  return sh;
}

// 階段を描き終えたら呼ぶ
function endShading(ctx) {
  resetShader();
  stroke(inkColor255(ctx));
}

// ボールをシェーダーで描く。このシェーディングにボール用の塗りがなければ false を返す
function shadeBalls(name, ctx) {
  const s = resolveShading(name);
  if (!s.ball) return false;
  const sh = getShader(s.key + ':ball', SHADE_VERT, FRAG_HEAD + s.ball);
  shader(sh);
  setCommonUniforms(sh, s, ctx);
  noStroke();
  for (const b of ctx.balls) {
    sh.setUniform('uOffset', [b.x, b.y, b.z]);
    sh.setUniform('uObjScale', b.r);
    sh.setUniform('uIsInk', b.ink ? 1 : 0);
    push();
    translate(b.x, b.y, b.z);
    sphere(b.r, 32, 24);
    pop();
  }
  resetShader();
  stroke(inkColor255(ctx));
  return true;
}

// インク色・紙の色（0〜255）。シェーダーを使わずに描くもの（背景・輪郭線・通常描画のボール）用
function inkColor255(ctx) {
  return (ctx.ink || [0, 0, 0]).map(c => c * 255);
}
function paperColor255(ctx) {
  return (ctx.paper || [1, 1, 1]).map(c => c * 255);
}

// 中間色：インクと紙を STAIR_SHADOW の割合で混ぜる（0 でインク、1 で紙）
function midColor(s, ctx) {
  const ink = ctx.ink || s.params.uInk || [0, 0, 0];
  const paper = ctx.paper || s.params.uPaper || [1, 1, 1];
  return mixColor(ink, paper, ctx.stairShadowTone ?? 0.5, ctx.mixMode || 'OKLAB');
}
