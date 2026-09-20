---
description: harnessの正典（playbooks・claude配線）を対象プロジェクトへ実体ファイルとしてコピーし、devcontainer等の隔離環境でも単体で有効にする
---

# harnessの実体化 (`/vendor-harness`)

**引数:** 取り込み先のプロジェクトディレクトリ（省略時はカレントディレクトリ）

## いつ使うか

新規プロジェクトの既定は harness を **submodule** として取り込むこと
（[idea-to-implementation.md](../../playbooks/idea-to-implementation.md) Step 0）。**このコマンドはその代替**であり、
既定ではない。次のように submodule が使えない・使わないと決めた場合にだけ使う。

- そのプロジェクトを devcontainer 完結型にした結果、ワークスペースのルートや `~/.claude`
  （harness の submoduleやグローバル配布先）にアクセスできない環境になった
- 既存プロジェクトへ後から harness 運用を載せたいが、submodule 化はまだ決めていない

**このコマンドは harness が置かれているホスト側（ワークスペースのルートなど）で実行する。**
既に隔離済みの devcontainer の中で実行しても、コピー元の harness が見つからない。

**submodule と違い、更新を自動追従しない。** 実体ファイルはコピーした瞬間のスナップショットであり、
harness 側の改善は再度このコマンドを実行するまで反映されない。この非対称性を理解したうえで使うこと。

## 手順

### ステップ1: harness の所在を特定する

対象プロジェクトから見て、次の優先順で harness の実体を探す。

1. 対象プロジェクト自身が既に `harness/` を submodule として持っている → それを使う
2. ワークスペースのルート（対象プロジェクトの親ディレクトリを遡り、`harness/claude/` を持つ
   最初の場所）に harness がある → それを使う
3. どちらも無ければユーザーに harness のパスを尋ねる

見つけたら `git -C <harness> log -1 --format="%H %ad" --date=short` でコミットハッシュと日付を
控えておく（ステップ4で記録する）。

### ステップ2: playbooks をコピーする

対象プロジェクト直下に、harness と同じ相対パスで**実体ファイル**としてコピーする（symlink には
しない。devcontainer が Linux でもホストが Windows でも同じ手順で再現できるようにするため）。

```
<harness>/playbooks/working-principles.md   → <対象>/harness/playbooks/working-principles.md
<harness>/playbooks/spec-first-workflow.md  → <対象>/harness/playbooks/spec-first-workflow.md
```

対象プロジェクトが上記以外の playbook（`idea-to-implementation.md` など）を実際の作業で参照して
いる場合は、それも同様にコピーする。**使っていないものまで機械的に全部持ち込まない**（無差別に
複製すると、何が実際に効いているか分からなくなる）。

### ステップ3: claude 配線をコピーする

```
<harness>/claude/skills/    → <対象>/.claude/skills/
<harness>/claude/agents/    → <対象>/.claude/agents/
<harness>/claude/commands/  → <対象>/.claude/commands/
```

既に `<対象>/.claude/` がある場合は、上書き前に差分を確認する（`harness/sync.ps1` と同じ
「正典 → 配布先の一方向」の原則。配布先側だけで行われた改善を消さないよう、先に正典へ取り込んで
から上書きする）。

### ステップ4: AGENTS.md を用意する

対象プロジェクトに `AGENTS.md` が無ければ、
[playbooks/templates/AGENTS.md.template](../../playbooks/templates/AGENTS.md.template) を元に作成する。

- 一般論への導線は、submodule 前提の `harness/playbooks/...` ではなく、**ステップ2でコピーした
  実体ファイルのパス**（同じ相対パスのはず）を指すようにする
- 末尾に「この構成について」の節を追記し、**いつ・どの harness コミットから実体化したか**を書く
  （例:「2026-09-20 に harness の `e410a5e` から実体化。自動同期は無いので、更新したい場合は
  `/vendor-harness` を再実行する」）
- 対象プロジェクトの `CLAUDE.md`（や `docs/`）に既にプロジェクト概要・検証コマンド・落とし穴が
  書かれている場合、テンプレートの該当項目はそちらへのポインタにし、書き写さない
  （二重管理を作らない）

既に `AGENTS.md` がある場合は、この節をステップ2のパスに合わせて追記・更新するだけにとどめる。

### ステップ5: CLAUDE.md に入口の一文を足す

`CLAUDE.md` の先頭付近に、他のプロジェクトと同じ形で一文を追記する（既存の内容は削らない）。

```
**このプロジェクトの入口は [AGENTS.md](AGENTS.md) である。作業を始める前に必ず読むこと。**
```

すでに同趣旨の記述があれば追記しない。

### ステップ6: ワークスペース側の記録を更新する（該当する場合）

ワークスペースのルートに `projects.md`「ハーネス複製の状況」のような一覧がある場合、対象
プロジェクトを追記する。**その一覧の一般方針（新規には複製を作らない、等）に反する例外を作った
ことになるので、なぜここでは複製を選んだかの理由を一言添える。**

### ステップ7: 変更内容を確認してコミットする

コピーした内容を `git status` / `git diff --stat` で確認し、対象プロジェクトでコミットする。
**`git push` はユーザーの明示的な指示があるまで行わない**（harness・ワークスペース側で変更が
生じた場合も同様）。

## 注意点

- **harness に具体的なプロジェクト名を書き込まない**（[harness/README.md](../../README.md)
  「ここに具体的なプロジェクト名を書かない」）。対象プロジェクト名を書いてよいのは、取り込み先
  である対象プロジェクト自身の `AGENTS.md` だけ
- 対象プロジェクトが公開（public）リポジトリの場合、コピーする playbooks・claude 配線の中身に
  非公開情報が混ざっていないか実行前に確認する
- これは「コピー配布」方式であり、`harness/sync.ps1` の既定の対象外（sync.ps1 は `~/.claude` と、
  既に `.claude/skills` を持つプロジェクトだけを見る）。今回実体化した対象プロジェクトも、
  `.claude/skills` を作った時点から次回の `sync.ps1` 実行で自動的に対象へ入る
