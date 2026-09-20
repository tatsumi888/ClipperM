# AGENTS.md

ClipperM の作業方針。**プロジェクトを問わない一般論はこのリポジトリに実体化した
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

## この構成について（harnessの実体化）

このプロジェクトは devcontainer 完結型にした（[.devcontainer/](.devcontainer/)）。devcontainer は
ホスト側のワークスペースルートや `~/.claude` にアクセスできないため、本来そちら経由で読み込まれる
harness の playbooks と claude 配線（skills / agents / commands）を、**このリポジトリ自身に実体
ファイルとしてコピー**して持ち込んだ（`/vendor-harness` コマンド）。

- 2026-09-20、harness の `477e7d8` から実体化した
- **submodule ではないので、harness 側の更新を自動追従しない。** 最新化したい場合は、harness へ
  アクセスできる環境（ワークスペースのルートなど）で `/vendor-harness` を再実行する
- 新規プロジェクトの既定は harness を submodule として取り込むことであり、この構成は
  「devcontainer 完結型にする」という要件から来た意図的な例外である
