# Kagefumi

無限に続く折り返し階段を、白と黒のボールが一定の距離を保ったまま下り続ける p5.js（WEBGL）作品。

## 動かし方

ローカルサーバーで配信して `index.html` を開く（p5.js は CDN から読み込むのでネット接続が必要）。

```bash
python3 -m http.server 8765
```

ブラウザで http://localhost:8765 を開く。

- `H` キー：パラメータパネルの表示・非表示
- `SPACE` キー：PLAY / PAUSE

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | p5.js を CDN から読み込み、各スクリプトを実行 |
| `sketch.js` | 形と動き（階段・ボール・カメラ・パネル）。階段の形は `buildGeometry` でキャッシュ |
| `shading.js` | 塗り方と影（シェーダー）。`SHADINGS` に項目を足すと塗り方を追加できる |
| `style.css` | キャンバスを全画面に表示 |
