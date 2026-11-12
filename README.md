# Kagefumi

無限に続く折り返し階段を、白と黒のボールが一定の距離を保ったまま進み続ける p5.js（WEBGL）作品。
表の世界では黒が先を下り、白が追いかける。階段の裏側には重力が逆向きの「裏の世界」があり、
そこでは黒が白を追いかけながら上っていく。

## 動かし方

ローカルサーバーで配信して `index.html` を開く（p5.js は CDN から読み込むのでネット接続が必要）。

```bash
python3 -m http.server 8765
```

ブラウザで http://localhost:8765 を開く。

- `H` キー：パラメータパネルの表示・非表示
- `SPACE` キー：PLAY / PAUSE
- パネル下の `RESET`：すべての項目を初期値に戻す

## パネル

パネルは大きく2つに分かれている。**Kagefumi**（p5 側：形と動き）と **LOOK**（シェーダー側：見た目）。
選んだ項目に関係する行だけが表示される。

### Kagefumi（形と動き）

| セクション | 主な項目 |
|---|---|
| LANDING | 踊り場の大きさ（`W` `D` `H`）と上下の間隔 `V_GAP`。`V_GAP_ANIM` で間隔がサイン波で呼吸する |
| STAIRS | 段数 `STEPS`、向かい合う踊り場の間隔 `GAP`（`GAP_ANIM` あり）。`STEP_SQUASH` で段がボールの近くにだけ伸びて現れ、去ると縮んで消える（`STEP_FADE` で変化の長さ） |
| BALL | 大きさ・速さ・踊り場での折り返し（`L_A` `L_B`）・ときどき止まる（`STOP_PROB` `STOP_LEN`）。`TOP_BALLS` / `UNDER_BALLS` で表・裏の世界のボールの表示、`BOUNCE` で段を跳ねて下りる、`PARTICLES` で着地のたびに粒が飛び散る、`FOOTPRINTS` で通った跡が残り `TRAIL_LIFE` 秒で消える（`TRAIL_SIZE` で跡の大きさ） |
| CAMERA | 仰角 `ELEV`（マイナスで下から＝裏の世界。`ELEV_ANIM` で往復）、`ROLL`、`PROJECTION`（`ORTHO` / `PERSPECTIVE`。PERSPECTIVE は `FOV` で遠近感の強さ）、`ZOOM`、周回の速さ `ORBIT_SPEED` |
| LAYOUT | 階段を横に並べる `COLUMNS`。2列以上のとき、間隔・列ごとの進む向き（`FLOW`）・周回の向き（`ORBIT_FLOW`）・アニメーションの位相のずれ（`ANIM_PHASE`）を設定できる |

アニメーション（`_ANIM`）を付けた項目は、チェックを入れると `_MIN` `_MAX` `_SPEED`（1秒あたりの往復回数）が出て、
元のスライダーは操作できなくなる。

### LOOK（見た目）

| セクション | 主な項目 |
|---|---|
| SHADING | 塗り方（下の表）。`STROKE` `STROKE_WEIGHT` で箱の輪郭線、粒で描く塗り方では `DITHER`（`RANDOM` / `BAYER` / `HALFTONE` / `HATCH`）と模様の大きさ |
| COLOR | 2色 `COLOR_A`（紙）`COLOR_B`（インク）、`INVERT`、中間色の計算方法 `MIX`。TRI では3色目 `COLOR_C` とボールの色。`BG_SEPARATE` で背景色を別に決められる |
| LIGHT | 光源 `CAMERA`（カメラの少し上から）/ `FIXED`（太陽が円周軌道を回る）。階段の影の濃さ `SHADOW_TONE` |
| POST | 描き終えた画面を中央で折り返す `MIRROR_X` / `MIRROR_Y`（`MIRROR_U` / `MIRROR_V` で折り返す元の位置） |

| SHADING | 塗り方 |
|---|---|
| NONE | 白い箱とワイヤーフレーム |
| FLAT | 面の明るさで紙・中間色・インクの3値に塗り分ける（初期値） |
| GRAIN | 明るさを粒（ディザ）の密度で表す |
| POSTER | 面の向きと高さで決まるグラフィックなグラデーションを粒で描く |
| TRI | 3色のベタ塗り（上面・x 向きの側面・それ以外）。ボールはセル調の2色 |

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | p5.js を CDN から読み込み、各スクリプトを実行 |
| `sketch.js` | 形と動き（階段・ボール・裏の世界・粒・カメラ・パネル）。階段の形は `buildGeometry` でキャッシュ |
| `shading.js` | 塗り方と影（シェーダー）、画面の折り返し。`SHADINGS` に項目を足すと塗り方を追加できる |
| `style.css` | キャンバスを全画面に表示 |
