# STEP 一覧

作業単位の一覧と進捗。各 STEP の詳細は `docs/logs/` のログを参照。
ログの書き方は [../CLAUDE.md](../CLAUDE.md) を参照。

## 粒度の方針

- 1 STEP = おおむね 1〜2 セッションで終わる量
- 基盤づくり（STEP 01〜03）以外は**縦切り**にする。API とそれを使う画面をセットにして、
  STEP を終えるたびに「動いて目に見える」状態を作る
- 完了の定義は「テストが通り、ブラウザで動作を確認できること」

## 環境整備（アプリ本体以外）

| # | 内容 | 状態 | ログ |
|---|---|---|---|
| setup-01 | Claude Code のセキュリティ設定。`permissions` / PreToolUse フック / `.gitignore` | 完了 | [log](logs/setup-01-claude-security.md) |

## Phase 1 — 打刻と閲覧

| STEP | 内容 | 状態 | ログ |
|---|---|---|---|
| 00 | 仕様設計 | 完了 | [log](logs/step-00-spec-design.md) |
| 01 | モノレポ基盤。pnpm workspaces / Vite / Hono の疎通、Vite proxy、RPC の型が web に通ることの確認 | 完了 | [log](logs/step-01-monorepo.md) |
| 02 | DB 基盤。Docker Compose の Postgres / Drizzle / `users` + `work_schedules` / マイグレーション / seed | 完了 | [log](logs/step-02-database.md) |
| 03 | テスト基盤。Vitest / `hono/testing` / テスト用 DB の作り直し / GitHub Actions の骨組み | 未着手 | |
| 04 | 認証 API。セッション発行・検証、`login` / `logout` / `me`、`requireAuth` ミドルウェア | 未着手 | |
| 05 | ログイン画面。ルーティング / TanStack Query / RPC クライアント / 認証ガード | 未着手 | |
| 06 | 状態機械を `packages/shared` に実装。純粋関数 + テスト | 未着手 | |
| 07 | 打刻 API。`POST /api/time-entries`、状態遷移バリデーション、二重打刻防止 | 未着手 | |
| 08 | 打刻画面。現在の状態表示、遷移可能なボタンのみ出す、未完了勤務の警告 | 未着手 | |
| 09 | 勤怠取得 API。日次集計ロジック、`getScheduleFor()`、月次一覧、日次詳細、`incomplete` の導出 | 未着手 | |
| 10 | 月次一覧・日次詳細画面 ← **Phase 1 完了** | 未着手 | |

## Phase 2 — 申請と承認

| STEP | 内容 | 状態 | ログ |
|---|---|---|---|
| 11 | 申請スキーマ。`requests` / `correction_request_details` / `correction_request_items` | 未着手 | |
| 12 | 修正申請 API。作成 / 一覧 / 取消 | 未着手 | |
| 13 | 承認 API。トランザクション適用 / 楽観ロック / 自己承認禁止 | 未着手 | |
| 14 | 申請画面。日次詳細からの申請フォーム、自分の申請一覧 | 未着手 | |
| 15 | 管理者画面。承認待ち一覧、メンバー勤怠閲覧、代理修正、所定労働時間の変更 ← **Phase 2 完了** | 未着手 | |

## Phase 3 — 集計と運用

| STEP | 内容 | 状態 | ログ |
|---|---|---|---|
| 16 | 残業・深夜の集計ロジック | 未着手 | |
| 17 | 月次締め。確定スナップショット、締め後の編集制御 | 未着手 | |
| 18 | 休暇申請。`leave_request_details`、有給残の管理 | 未着手 | |
| 19 | CSV 出力 | 未着手 | |

Phase 3 は Phase 2 完了時点で改めて見直す。
[docs/spec.md](spec.md) の未決事項がここに集中しているため、
実装してみてから判断した方がよいものが多い。
