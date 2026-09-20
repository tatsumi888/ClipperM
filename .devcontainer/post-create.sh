#!/bin/sh
set -e

# Windowsホストからのbind mountはgitから見て所有者不一致になり、"detected dubious
# ownership" で全てのgit操作が拒否される。コンテナ内だけの信頼なのでワイルドカードで許可する
# （workspaceFolderの実際のパスに結合させないため）。
git config --global --add safe.directory '*'

# harness submoduleを取得する（.gitmodulesはHTTPS参照でprivate repo。VS Code Dev
# Containersのgit資格情報転送に依存する。それ以外の環境で実行する場合はここで認証が要る）
git submodule update --init --recursive

# harnessのclaude配線をこのプロジェクトの .claude/ へ橋渡しする。コミットはしない
# （.gitignore参照）。symlinkではなくコピーなのは、Claude Codeがsymlink越しに
# .claude/skills を読むかどうかが未検証のため（harness/playbooks/idea-to-implementation.md
# 「未確定の点」）。harnessを更新したら、コンテナを作り直すかこのスクリプトを再実行すること。
rm -rf .claude/skills .claude/agents .claude/commands
mkdir -p .claude
cp -r harness/claude/skills .claude/skills
cp -r harness/claude/agents .claude/agents
cp -r harness/claude/commands .claude/commands

# node_modulesはコンテナ専用のnamed volumeなので、npm ci前にnode所有へ直す
# （ボリュームは既定でroot所有のまま作られる）
sudo chown node:node node_modules

npm ci
