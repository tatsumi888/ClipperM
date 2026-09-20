# AGENTS.md

ClipperM の作業方針。**プロジェクトを問わない一般論は submodule として取り込んだ
[harness/playbooks/](harness/playbooks/) にあり、ここには書き写さない**（同じ内容を2か所に
書くと必ず片方が古くなる）。

| 読むもの                                                                             | 内容                                                                   |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [harness/playbooks/working-principles.md](harness/playbooks/working-principles.md)   | 進め方の方針・言語・情報の役割分担。**作業前に読む**                   |
| [harness/playbooks/spec-first-workflow.md](harness/playbooks/spec-first-workflow.md) | 仕様先行の開発プロセス                                                 |
| [CLAUDE.md](CLAUDE.md)                                                               | このプロジェクトの正典（概要・アーキテクチャ・検証コマンド・落とし穴） |

## このプロジェクトは何か

スマホ内で完結する Clipper。撮影した写真やスクリーンショットを Kindle の実解像度ちょうどに
切り抜き、複数枚をまとめて固定レイアウト EPUB（または PDF）にして Kindle へ送る PWA。
サーバを持たず、全処理がブラウザ内で完結する。詳しくは [CLAUDE.md](CLAUDE.md) の「概要」。

## 公開方針

GitHub の `tatsumi888/ClipperM` は public。個人情報・資産情報の類を扱わないプロジェクトなので、
実データ混入の心配はない。

## 検証コマンド

```powershell
npm run lint && npm run typecheck && npm run format:check && npm test && npm run build
```

単体実行の方法や一括検証スクリプトが無い理由は [CLAUDE.md](CLAUDE.md) の「コマンド」。

## 踏むと事故ること

[CLAUDE.md](CLAUDE.md) の「アーキテクチャ」「注意点」に根拠つきでまとまっている。書き写さない。

## この構成について（harness submodule）

このプロジェクトは devcontainer 完結型にした（[.devcontainer/](.devcontainer/)）。harness は
`git submodule`（[.gitmodules](.gitmodules)）として取り込んでおり、`harness/` の実体は
`tatsumi888/harness`（private）の指定コミットのチェックアウトそのものである。

- `.claude/{skills,agents,commands}` は **Claude Code が `.claude/` 配下しか読まないための橋渡し**
  であり、コミットしない（[.gitignore](.gitignore)参照）。devcontainer作成時に
  `.devcontainer/post-create.sh` が `harness/claude/` からその場でコピーする。symlink ではなく
  コピーなのは、Claude Code が symlink 越しに `.claude/skills` を読むかどうかが未検証のため
- harness は **private リポジトリ**。devcontainer作成時の `git submodule update --init` は、
  VS Code の Dev Containers拡張が持つgit資格情報の自動転送に依存する。それ以外の方法で
  コンテナを作る場合は、別途GitHub認証が要る
- harness の更新を取り込むには、
  ```bash
  git submodule update --remote harness
  cd harness && git log --oneline -5   # 何が入るか見る
  cd .. && git add harness && git commit
  ```
  のあと、コンテナを作り直すか `.devcontainer/post-create.sh` を再実行して `.claude/` を
  更新する（手順の詳細は harness の `playbooks/idea-to-implementation.md`「harnessの更新と還元」）
