# 題目カウンター — Codex 引き継ぎ資料

## 1. プロジェクト概要

創価学会員向けの題目カウンターアプリ。従来の「分数から推定」ではなく、**音声認識で「南無妙法蓮華経」の実数をカウント**する。

- **リポジトリ**: https://github.com/yoshi0703/daimoku-counter
- **ブランチ**: `feat/initial-implementation`（mainへのPR #1が未マージ）
- **技術スタック**: React Native + Expo SDK 54 + TypeScript + expo-router
- **バックエンド**: Supabase（既存クチトルプロジェクト `yydkvjaytggaqbhcookk`）
- **デザイン思想**: 「最もシンプルに、最も賢く」

---

## 2. 現在のステータスと未解決の問題

### 動作しているもの
- タブナビゲーション（カウンター / 履歴 / 設定）
- 手動タップカウンター
- セッション保存（Supabase）
- 履歴・統計画面
- 目標設定
- APIキー保存（SecureStore + AsyncStorage フォールバック）
- Supabase Edge Function（deepgram-token）デプロイ済み

### 未解決の問題（優先度順）

#### P0: 録音が動かない（Expo Go）
- `expo-audio` の `useAudioRecorder` + `prepareToRecordAsync()` が `Failed to prepare recorder` エラー
- `RecordingPresets.HIGH_QUALITY` に変更済みだが未検証
- `setAudioModeAsync({ allowsRecording: true })` を `prepareToRecordAsync` 直前に移動済み
- **次のアクション**: Expo Go で実際にテストし、まだ失敗する場合は `expo-av` の `Audio.Recording.createAsync()` に戻すか、別のアプローチを検討

#### P1: Deepgram トークン認証が403
- Edge Function の `/v1/auth/grant` 呼び出しが `Insufficient permissions` で失敗
- ユーザーのDeepgramキー（`05fe80...`）にトークン発行権限がない
- 現在は直接キー認証にフォールバックする設計
- **次のアクション**: Deepgram ダッシュボードで「Admin」権限のキーを作成するか、Edge Functionを音声プロキシ方式に変更

#### P2: APIキー設定後も「APIキーが設定されていません」が表示される報告
- Context Provider + AsyncStorage フォールバック + Ref ベース stale closure 修正を適用済み
- 最新コミットで修正済みだが、ユーザーによる動作確認がまだ

---

## 3. アーキテクチャ

### ディレクトリ構造
```
daimoku-counter/
├── app/
│   ├── _layout.tsx          # Root（ApiKeysProvider）
│   └── (tabs)/
│       ├── _layout.tsx      # タブナビゲーション
│       ├── index.tsx        # カウンター画面
│       ├── explore.tsx      # 履歴画面
│       └── settings.tsx     # 設定画面
├── src/
│   ├── components/
│   │   ├── counter/         # CounterDisplay, Controls, Timer, GoalProgressRing, RecognitionStatus
│   │   ├── history/         # DailyChart, SessionList, StatsSummary
│   │   └── settings/        # GoalSetting, ApiKeySettings
│   ├── hooks/
│   │   ├── useApiKeys.ts    # APIキー管理（Context Provider）
│   │   ├── useDaimokuRecognition.ts  # 音声認識コアロジック
│   │   ├── useSessionManager.ts      # セッションCRUD
│   │   ├── useGoal.ts       # 目標CRUD
│   │   └── useStats.ts      # 統計クエリ
│   ├── lib/
│   │   ├── daimokuCounter.ts        # 2層カウントアルゴリズム
│   │   ├── transcriptionService.ts  # Deepgram/OpenAI API
│   │   ├── supabase.ts              # Supabaseクライアント
│   │   └── dateUtils.ts             # 日付ユーティリティ
│   ├── constants/theme.ts   # デザイントークン
│   └── types/index.ts       # 型定義
└── supabase/
    └── functions/deepgram-token/  # Edge Function
```

### 3モードの音声認識（useDaimokuRecognition.ts）

```
モード判定:
  expo-speech-recognition 利用可能? → native（Dev Build向け）
  DeepgramキーまたはOpenAIキーあり? → cloud（Expo Go向け）
  どちらもなし → manual（タップのみ）
```

| モード | エンジン | 環境 | 状態 |
|--------|---------|------|------|
| native | Apple SFSpeechRecognizer（expo-speech-recognition） | Dev Build | 未テスト（EAS Build未完了） |
| cloud | expo-audio録音 → Deepgram Nova-3 / OpenAI | Expo Go | **録音エラーで動作せず** |
| manual | ユーザータップ | どこでも | 動作する |

### Deepgram API設定（transcriptionService.ts）

```
URL: https://api.deepgram.com/v1/listen
パラメータ:
  model=nova-3
  language=ja
  keyterm=南無妙法蓮華経          # Nova-3 キーターム認識ブースト
  keyterm=なんみょうほうれんげきょう
  keyterm=なむみょうほうれんげきょう
  search=南無妙法蓮華経           # 音響パターンマッチング
  utterances=true                # 発話セグメント化
  punctuate=true
```

認証フォールバック: JWT トークン → 永続キー → OpenAI

### カウントアルゴリズム（daimokuCounter.ts）

- **14バリアント**をサポート（漢字・ひらがな・カタカナ・長音記号等）
- **2層カウント**: `finalizedCount`（確定、減少しない） + `interimDelta`（暫定）
- **テキストマッチ** + **音響マッチング（searchHits）**の2方式

### Supabase

- **プロジェクト**: yydkvjaytggaqbhcookk（クチトル共用）
- **テーブル**: `daimoku_sessions`, `daimoku_goals`
- **RLS**: 有効（匿名アクセスポリシー付き）
- **Edge Function**: `deepgram-token`（デプロイ済み、ただし403エラー）
- **Secret**: `DEEPGRAM_API_KEY` = `05fe80510ddcaa6337663d9bdd0e396ed1088828`

---

## 4. 重要なコードパターン

### APIキー管理（useApiKeys.ts）
```
ApiKeysProvider（Context）→ 全タブで共有
  ↓
storageGet/Set/Delete（抽象化）
  ↓
SecureStore（優先） → AsyncStorage（フォールバック）
```

### 録音フロー（cloud mode）
```
start() → requestRecordingPermissionsAsync()
       → setAudioModeAsync({ allowsRecording: true })
       → startCloudChunk()
           → recorder.prepareToRecordAsync()  ← ここでエラー
           → recorder.record()
           → 15秒待機
           → recorder.stop()
           → processChunk(uri)
               → getDeepgramToken()（Edge Function経由）
               → transcribeAudio(uri, key, token)
               → countOccurrences(transcript)
           → 次のチャンクへ（再帰）
```

### Stale Closure 対策
- `deepgramKeyRef`, `openaiKeyRef`, `getDeepgramTokenRef` で最新値を保持
- `processChunk` は `useCallback([], [])` で安定化、Ref 経由で最新キーを取得

---

## 5. 環境情報

```
Node: 22.16.0
npm: 10.9.2
Expo SDK: 54
Supabase CLI: 2.62.10
GitHub: yoshi0703
Apple Developer: 未登録（Expo Go で開発中）
Expo Go 接続: npx expo start --go --tunnel
```

---

## 6. 残タスク

### 必須（MVP）
1. **録音エラーの解消** — cloud mode を Expo Go で動作させる
2. **音声認識→カウント のE2E検証** — 実際に題目を唱えてカウントされることを確認
3. **EAS Build** — `eas init` + `eas build --platform ios` で Dev Build 作成
4. **native mode のテスト** — Dev Build で expo-speech-recognition が動作するか確認

### 推奨
5. Edge Function のトークン認証修正（Admin権限キー or プロキシ方式）
6. エラーハンドリング改善（ユーザーフレンドリーなメッセージ）
7. デバッグ用 `lastTranscript` 表示を本番では非表示にする
8. PR #1 のマージ

### 将来
9. Apple Developer 登録 → TestFlight 配布
10. オフラインモード（ローカルDB同期）
11. ウィジェット・通知
12. 複数ユーザー対応（Supabase Auth）

---

## 7. コミット履歴

```
61f70b4 Fix API key persistence: AsyncStorage fallback + stale closure fix
3753599 Fix API key sharing across tabs with Context Provider
c0fb43e Implement Deepgram best practices and token management
61de033 Switch from expo-av to expo-audio for recording
8cf9731 Add debug transcript display and improve cloud recognition
eb94d8b feat: クラウド音声認識（Deepgram/OpenAI）でExpo Go対応
5edfc14 feat: Expo Go対応 — 手動タップカウンターにフォールバック
9fee7a7 feat: 題目カウンター アプリ実装
46b2bbb Initial commit
```

---

## 8. テスト手順

### Expo Go での確認
```bash
cd ~/daimoku-counter
npx expo start --go --tunnel
```

1. Expo Go アプリでQRコードをスキャン
2. 設定タブ → Deepgram APIキーを入力 → 保存
3. カウンタータブ → 開始ボタン
4. 画面下部のデバッグ表示を確認:
   - 「録音中...」→ 録音成功
   - 「文字起こし中...」→ API送信成功
   - 認識テキスト → Deepgramの応答
   - 「録音エラー: ...」→ まだ修正が必要

### Dev Build での確認
```bash
cd ~/daimoku-counter
eas init  # まだ未実行
eas build --platform ios --profile development
```
