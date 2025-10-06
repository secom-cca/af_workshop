# Adaptation UI

Reactで構築されたUIアプリケーションです。

## セットアップ

### 必要な環境
- Node.js (v14以上推奨)
- npm または yarn

### インストール

```bash
npm install
```

### 開発サーバーの起動

```bash
npm start
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてアプリケーションを確認できます。

### ビルド

```bash
npm run build
```

本番用のビルドファイルが `build` フォルダに生成されます。

### テスト

```bash
npm test
```

## プロジェクト構造

```
adaptation/
├── public/
│   ├── index.html
│   └── manifest.json
├── src/
│   ├── App.jsx
│   ├── App.css
│   ├── index.js
│   └── index.css
├── package.json
└── README.md
```

## 開発について

このプロジェクトは [Create React App](https://github.com/facebook/create-react-app) の設定に基づいて構築されています。

詳細な情報については、[Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started) を参照してください。
