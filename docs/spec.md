# 勤怠管理アプリ 仕様

React(TS) / Hono の学習を目的とした勤怠管理アプリ。
実務で必ず出てくる面倒な部分（日跨ぎ勤務、状態遷移、承認フロー、排他制御）を
あえて残すことで学習題材としての密度を上げる。

## 技術構成

```
apps/
  web/        React + Vite + TypeScript + TanStack Query + react-hook-form
  api/        Hono + @hono/node-server + Drizzle ORM
packages/
  shared/     Zod スキーマ / 状態機械 / ドメイン型（web・api 双方から参照）
docker-compose.yml   PostgreSQL
```

- パッケージ管理: pnpm workspaces
- DB: PostgreSQL（Docker Compose）、マイグレーションは Drizzle Kit
- 型共有: Hono RPC (`hc<AppType>`) + Zod。API の入出力型を web 側へ自動伝播させる
- 認証: 自前セッション（HttpOnly Cookie + サーバサイドセッション）
- テスト: Vitest / `hono/testing` / Testing Library / MSW、CI は GitHub Actions

### オリジン方針（重要）

**web と API は常に同一オリジンとして扱う。**

- 開発時: Vite dev server の proxy で `/api` を API サーバへ転送する
- 本番: 同一ドメインで配信し、`/api` をリバースプロキシする

クロスオリジンにすると `SameSite=Lax` の Cookie が送信されないため、
`SameSite=None; Secure` + CORS + CSRF トークンが芋づる式に必要になる。
同一オリジンに寄せることで **CORS 設定も CSRF トークンも不要**になる。

## スコープとフェーズ

| Phase | 内容 |
|---|---|
| 1 | 認証、打刻（出退勤・休憩）、自分の月次一覧・日次詳細 |
| 2 | 修正申請 → 管理者承認フロー、ロール分離、管理者によるメンバー勤怠閲覧 |
| 3 | 月次締め、集計（残業・深夜割増）、休暇申請、CSV 出力、有給残管理 |

Phase 1 の時点でも DB スキーマは Phase 2 を前提に設計しておく（後からの破壊的変更を避ける）。

## ドメインモデル

```
User ──< TimeEntry (打刻イベント)
  ├──< WorkSchedule (勤務体系の適用履歴)
  └──< Request (申請) ──< CorrectionRequestDetail ──< CorrectionRequestItem
                       └─< LeaveRequestDetail            (Phase 3)
DailyRecord (User × 勤務日)
```

### 中核となる考え方

打刻は **イベント列** (`time_entries`) として保持し、「1日の勤怠」はそこから **導出** する。
日次レコードに直接 `start_at` / `end_at` を持たせる設計はしない。

理由:
- 修正申請の差分を素直に表現できる（どの打刻をどう変えるか）
- 打刻漏れ・不整合な状態を「データとして表現できる」
- 状態を二重に持たないため、集計とデータがずれない

集計値（実働・残業）は Phase 1 〜 2 では都度計算し、
Phase 3 の月次締めで確定スナップショットとして `daily_records` に保存する。

## 主要ルール

### 勤務日（work_date）の定義

**一連の勤務は、出勤打刻（`clock_in`）した日付に紐づく。**

```
23:00 clock_in    work_date = 09-19
01:00 break_start work_date = 09-19
07:00 clock_out   work_date = 09-19   ← 実働 8h を 09-19 の1日として集計
```

暦日で区切らないため深夜勤務を自然に扱える。
代わりに「退勤打刻が閉じていない勤務」の検出が必須になる（下記）。

### 打刻の状態機械

```
NOT_STARTED ──clock_in──> WORKING ──clock_out──> FINISHED
                            │  ▲
                 break_start│  │break_end
                            ▼  │
                          ON_BREAK
```

- 許可された遷移以外はサーバ側で 409 を返す
- 遷移テーブルは `packages/shared` に置き、**React のボタン出し分けと Hono のバリデーションで同一の定義を使う**
- クライアント側の制御はあくまで UX のためで、正しさの担保はサーバ側に置く（二重防御）

### バリデーション

| ケース | 扱い |
|---|---|
| 出勤前の `break_start` | 拒否（409） |
| 休憩中の `break_start` | 拒否（409） |
| 休憩中でないときの `break_end` | 拒否（409） |
| 休憩中の `clock_out` | 拒否（409）。先に休憩を終了させる |
| 二重打刻（連打・複数タブ） | 状態機械で拒否。加えて直近の同種打刻を短時間で弾く |
| 前回の勤務が閉じていないまま新規 `clock_in` | **許可する**（下記） |

### 退勤忘れ（incomplete）の扱い

**未完了の勤務があっても、新しい `clock_in` はブロックしない。**
打刻できないと勤怠アプリとして本末転倒になるため。

- `clock_in` 自体は成功させ、レスポンスに未完了勤務の警告を含める
- 打刻画面・月次一覧で「09-18 の退勤打刻がありません」と表示し、修正申請へ導線を張る

incomplete は **DB に状態として持たない**。打刻列から導出する:

```
clock_in があり、clock_out がなく、work_date < 今日 → incomplete
```

`daily_records.status` は承認・締め系に専念させ、状態の二重管理を避ける。
日次バッチも不要になる。

### 所定労働時間

所定労働時間は「現在の値」ではなく **その日に適用されていた値** を引く。
`users` に現在値を1つだけ持つ設計はしない。

管理画面から変更できるようにすると、単純な UPDATE では **過去の勤怠の集計が書き換わる**。

```
9月の所定 9:00-18:00 (8h) → 9/15 に 10h 勤務 → 残業 2h
10/1 から 9:00-17:30 (7.5h) に変更（users を UPDATE した場合）
  → 9月の勤怠を開くと 9/15 の残業が 2.5h に化ける
```

そのため `work_schedules` に **適用開始日つきの履歴** として積む。
集計ロジックからは必ず `getScheduleFor(userId, workDate)` 越しに引く。

```sql
SELECT * FROM work_schedules
 WHERE user_id = $1 AND effective_from <= $2   -- $2 = work_date
 ORDER BY effective_from DESC LIMIT 1
```

- ユーザー作成時に `effective_from = hired_on` の行を必ず1件作る。
  `getScheduleFor` が値を返せないケースを作らないため
- `effective_from` には **未来日を指定できる**。「11/1 から適用」の予約が自然にできる
- **月次一覧では N+1 に注意。** 30日分を1日ずつ引くとクエリが30回走る。
  月内に関係する履歴行をまとめて取得し、日付への割り当てはメモリ上で行う
- 履歴行は追加のみを基本とする。誤設定の訂正としてのみ管理者が削除できる

### 集計（Phase 3）

```
実働時間 = (clock_out - clock_in) - 休憩合計
残業時間 = max(0, 実働時間 - 所定労働時間)
深夜時間 = 勤務時間帯と 22:00-05:00 の重なり
```

## DB スキーマ

```sql
-- ユーザー
users
  id              uuid        PK
  email           citext      UNIQUE NOT NULL
  password_hash   text        NOT NULL          -- argon2id
  name            text        NOT NULL
  role            text        NOT NULL          -- 'employee' | 'admin'
  hired_on        date        NOT NULL          -- 入社日。初回の勤務体系の適用開始日になる
  created_at      timestamptz NOT NULL
  updated_at      timestamptz NOT NULL

-- 勤務体系の適用履歴。所定労働時間は「その日に適用されていた値」を引く
work_schedules
  id              uuid        PK
  user_id         uuid        FK users NOT NULL
  effective_from  date        NOT NULL          -- この日から適用
  scheduled_start time        NOT NULL          -- 所定始業
  scheduled_end   time        NOT NULL          -- 所定終業
  created_by      uuid        FK users NOT NULL -- 設定した管理者
  created_at      timestamptz NOT NULL
  UNIQUE (user_id, effective_from)
  INDEX (user_id, effective_from DESC)
  -- ユーザー作成時に effective_from = hired_on の行を必ず1件作る

-- セッション（Cookie のトークンはハッシュ化して保存）
sessions
  id                   text        PK           -- sha256(token)
  user_id              uuid        FK users NOT NULL
  expires_at           timestamptz NOT NULL     -- アイドル期限（7日）
  absolute_expires_at  timestamptz NOT NULL     -- 絶対期限（30日）
  created_at           timestamptz NOT NULL
  user_agent           text
  ip                   inet

-- 打刻イベント
time_entries
  id              uuid        PK
  user_id         uuid        FK users NOT NULL
  work_date       date        NOT NULL          -- 出勤打刻の日付
  type            text        NOT NULL          -- clock_in|clock_out|break_start|break_end
  recorded_at     timestamptz NOT NULL
  source          text        NOT NULL          -- 'self' | 'correction'
  created_at      timestamptz NOT NULL
  INDEX (user_id, work_date)

-- 日次の状態。楽観ロックの対象であり、Phase 3 の締めの確定値置き場
daily_records
  user_id         uuid        FK users
  work_date       date
  status          text        NOT NULL          -- 'open' | 'locked'（Phase 3 で使用）
  version         integer     NOT NULL DEFAULT 0  -- 楽観ロック
  work_minutes    integer                        -- Phase 3: 締め時の確定値
  break_minutes   integer
  overtime_minutes integer
  night_minutes   integer
  PRIMARY KEY (user_id, work_date)
  -- 初回の打刻時に upsert で行を作る（承認時のロック対象にするため）
```

### 申請（ワークフロー）

申請は **ヘッダ（共通部分）と明細（種別固有）に分離**する。
承認期限・リマインド・代理承認・通知といった機能は申請種別によらず共通なので、
`requests` に対して一度実装すれば全種別に効く。

```sql
-- ワークフローのヘッダ。申請の共通部分
requests
  id              uuid        PK
  user_id         uuid        FK users NOT NULL   -- 申請者
  type            text        NOT NULL            -- 'correction' | 'leave'
  status          text        NOT NULL            -- pending|approved|rejected|canceled
  reason          text        NOT NULL
  reviewed_by     uuid        FK users
  reviewed_at     timestamptz
  review_comment  text
  created_at      timestamptz NOT NULL

-- type='correction' の本体
correction_request_details
  request_id      uuid        PK FK requests
  work_date       date        NOT NULL

-- 打刻の差分（「この日の打刻はこうあるべき」）
correction_request_items
  id              uuid        PK
  request_id      uuid        FK requests NOT NULL
  action          text        NOT NULL          -- 'add' | 'update' | 'delete'
  target_entry_id uuid        FK time_entries    -- add のときは NULL
  type            text                           -- delete のときは NULL
  recorded_at     timestamptz                    -- delete のときは NULL

-- type='leave' の本体（Phase 3）
leave_request_details
  request_id      uuid        PK FK requests
  leave_type      text        NOT NULL          -- 'paid' | 'special' | ...
  start_date      date        NOT NULL
  end_date        date        NOT NULL
  days            numeric(3,1) NOT NULL         -- 半休を表現するため
```

TypeScript 側は `type` による判別共用体になる。
承認処理は共通部分に対して書き、適用処理だけ種別ごとに分岐する。

```ts
type Request = CorrectionRequest | LeaveRequest   // type で判別
approve(request)           // 共通: 状態遷移・権限・自己承認禁止
applyCorrection(detail)    // 種別固有
```

### 変更履歴の担保

**打刻の変更経路を「申請」に一本化する。**
`time_entries` を直接 update / delete する API は作らない。

- 管理者による代理修正も、`requests` を自動生成して即時承認扱いにする
- これにより「誰が・いつ・何を・なぜ変えたか」が `requests` に必ず残る
- 監査ログテーブルを別に持つ必要がなくなる

### 承認時の処理

管理者が承認すると、`correction_request_items` を `time_entries` へ適用する。
これを **単一トランザクション**で行い、`daily_records.version` で楽観ロックをかける。

```
BEGIN
  daily_records を version チェック付きで取得
  items を action ごとに time_entries へ適用（source = 'correction'）
  適用後の打刻列が状態機械として妥当か検証 ── 不正なら ROLLBACK
  daily_records.version をインクリメント
  requests.status = 'approved', reviewed_by / reviewed_at を記録
COMMIT
```

## 認可

- `role` は**権限の追加**として扱う。`admin` も一般社員と同じように打刻する
- `admin` は全員の勤怠閲覧と申請の承認ができる
- **自己承認の禁止**: `requests.user_id === 承認者の id` の場合は 403
  - seed で `admin` を 2 人作っておく（互いの申請を承認できるようにするため）

## API

Hono の RPC で型を web 側へ通す。認可は `requireAuth` → `requireRole('admin')` の
ミドルウェア2段構成。「自分のデータしか見えない」はハンドラごとに書かず、
リソース取得層で担保する。

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

POST   /api/time-entries                    打刻
GET    /api/attendances?month=YYYY-MM       自分の月次一覧
GET    /api/attendances/:date               日次詳細（打刻列 + 集計）

POST   /api/requests                        申請（type で種別を指定）
GET    /api/requests                        employee=自分 / admin=全員
POST   /api/requests/:id/approve               admin のみ・自己承認は 403
POST   /api/requests/:id/reject                admin のみ・自己承認は 403
POST   /api/requests/:id/cancel                申請者本人のみ

GET    /api/admin/members                   admin のみ
GET    /api/admin/members/:id/attendances   admin のみ
GET    /api/admin/members/:id/schedules     admin のみ・勤務体系の適用履歴
POST   /api/admin/members/:id/schedules     admin のみ・適用開始日つきで追加
DELETE /api/admin/members/:id/schedules/:scheduleId
                                            admin のみ・誤設定の訂正用
```

### エラー設計

| 状況 | ステータス |
|---|---|
| 未認証 | 401 |
| 権限なし / 他人のリソース / 自己承認 | 403（404 に寄せない） |
| 状態遷移として不正な打刻 | 409 |
| 入力値が不正（Zod） | 400（フィールド単位のエラーを返す） |
| 楽観ロック衝突 | 409 |

## 画面

| パス | 内容 | 権限 |
|---|---|---|
| `/login` | ログイン | - |
| `/` | 打刻画面。現在の状態を大きく表示し、遷移可能なボタンのみ出す。未完了勤務の警告もここ | 全員 |
| `/attendances` | 自分の月次一覧。incomplete な日を強調表示 | 全員 |
| `/attendances/:date` | 日次詳細 → ここから修正申請 | 全員 |
| `/requests` | 自分の申請一覧・取消 | 全員 |
| `/admin/requests` | 承認待ち一覧 → 承認 / 却下（自分の申請は操作不可） | admin |
| `/admin/members` | メンバー一覧 → 各人の月次閲覧・代理修正 | admin |
| `/admin/members/:id/schedules` | 所定労働時間の変更。適用開始日を指定して追加し、履歴を一覧表示 | admin |

`admin` も打刻するため、`/` `/attendances` `/requests` は全員が使う。
`/admin/*` のみロールで制限する。

## 認証・セッション

- ログイン成功時にランダムトークンを生成し、Cookie `sid` で返す
  - `HttpOnly`, `SameSite=Lax`, `Secure`（本番のみ）, `Path=/`
- DB には `sha256(token)` を保存する（DB 流出時にセッションを奪われないため）
- パスワードは argon2id でハッシュ化
- 有効期限は二段構え
  - アイドル期限 7 日 — アクセス時に延長する
  - 絶対期限 30 日 — 延長しない。超えたら再ログイン
- 延長は毎リクエストではなく、**残り期限が半分を切ったときのみ** DB を更新する
- ログアウトでセッション行を削除

## テスト方針

| 対象 | 方法 |
|---|---|
| `packages/shared` | 状態機械・集計ロジックを純粋関数として Vitest でテスト |
| `apps/api` | `hono/testing` でハンドラを直接叩く。DB はテスト用スキーマを都度作り直す |
| `apps/web` | Testing Library + MSW。MSW のハンドラは shared の型で縛る |
| CI | GitHub Actions で lint / typecheck / test |

## 未決事項

- パスワード変更時に全セッションを無効化するか
- 申請が出た / 承認されたときの通知をやるか（Phase 2 以降）
- 祝日マスタをどう用意するか（Phase 3）
- 有給の付与・消化ロジックをどこまで作るか（Phase 3）
- 月次締めの単位（全員一括か、個人ごとか）（Phase 3）
