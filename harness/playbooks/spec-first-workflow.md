# 仕様先行(spec-first)の開発ワークフロー

仕様を先に固め、それを正典として実装へ進めるプロセス。**この内容の正典は本ファイルである。**
各プロジェクトのルート直下の `AGENTS.md` / `CLAUDE.md` からはここを指し、内容を書き写さない。

実行の配線(skills / agents / commands)は `harness/claude/` にある。これらが使える状態
(`~/.claude/` かプロジェクトの `.claude/` に配置済み)であることが前提。

## 1. 永続ドキュメント(`docs/`)

専用スキルで生成し、そのプロジェクトの正典とする。前の成果物を入力として次を詳細化する。
**この順番はそのまま依存順であり、番号はそれを表す。**

| 順番 | スキル | 生成物(新規プロジェクト) |
|---|---|---|
| 1 | `prd-writing` | `docs/01-product-requirements.md` |
| 2 | `functional-design` | `docs/02-functional-design.md` |
| 3 | `architecture-design` | `docs/03-architecture.md` |
| 4 | `repository-structure` | `docs/04-repository-structure.md` |
| 5 | `development-guidelines` | `docs/05-development-guidelines.md` |
| 6 | `glossary-creation` | `docs/06-glossary.md` |

**既存プロジェクトは番号なしのファイル名(`docs/product-requirements.md` 等)のままでよい。**
リネームしない。各スキルは `docs/` を一覧し、番号の有無を問わず同種のドキュメントを見つけて
そのパスのまま更新する(新しいファイルを作らない)。番号は**新規プロジェクトにのみ**適用する。

**既存の開発ガイドライン(`docs/development-guidelines.md` / `docs/05-development-guidelines.md`
等)がスキルの汎用ガイドより優先する。** 検証コマンド(テスト・lint・型チェック)の正はここに
書かれており、スキル側の一般論(Conventional Commits / Git Flow / TDD)は不在時のフォールバック。

## 2. 作業単位のステアリング(`.steering/`)

`steering` スキルが `.steering/[YYYYMMDD]-[NN]-[機能名]/` に `requirements.md` / `design.md` /
`tasklist.md` を作る(`NN` はその日の連番、既存の最大値+1)。

**ステアリングの鉄則:**

- `tasklist.md` が進捗の正。TodoWrite は補助メモにすぎない。`[ ]` → `[x]` は Edit で
  **1タスクずつ即時**更新し、まとめて更新しない
- 全タスクが `[x]` になるまで作業は終わっていない。スキップは技術的理由がある場合のみ
  `- [x] ~~タスク~~ (理由: ...)` で記録する。「後でやる」「別タスクにする」は禁止
- タスクが大きすぎる場合は `tasklist.md` 内でサブタスクに分割し、それぞれ完了させる
- 完了後に振り返り(完了日・計画との差分・学び・改善案)を `tasklist.md` に追記する

## 3. コマンドとサブエージェント

- `/add-feature <機能名>` — ステアリング作成 → `CLAUDE.md`・`docs/` 読解 → `src/` の既存パターン
  調査 → 実装ループ → `implementation-validator` による検証 → 検証コマンドがグリーンになるまで
  修正 → 振り返りと `docs/` 更新、までを**ユーザーに確認せず一気通貫で**実行する設計
- `/review-docs <パス>` — `doc-reviewer` で完全性・具体性・一貫性・測定可能性をレビューし要約する
- サブエージェント: `implementation-validator`(仕様との整合と品質)、`doc-reviewer`
  (ドキュメントレビュー)、`ui-ux-reviewer`(React/TSX・CSSのモバイルUI/UXをコードベースで
  評価、実描画はしない)
