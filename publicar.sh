#!/bin/bash
# Publica o SOFTWARE de verdade: envia para a main (é a main que o GitHub Pages mostra) e confere no GitHub.
# Só diga "publicado" ao Klebson depois que este script terminar com "PUBLICADO E CONFERIDO".
cd "$(dirname "$0")" || exit 1
RAMO=$(git branch --show-current)
if [ -n "$(git status --porcelain)" ]; then echo "FALHOU: tem mudança sem commit. Faça o commit antes."; exit 1; fi
V_LOCAL=$(grep -m1 -o "meus-apps-v[0-9]*" service-worker.js)
V_APP=$(grep -m1 -o "NV_APP = .meus-apps-v[0-9]*" app-boost.js | grep -o "meus-apps-v[0-9]*")
if [ "$V_APP" != "$V_LOCAL" ]; then echo "FALHOU: a versão no app-boost.js ($V_APP) tem que ser igual à do service-worker.js ($V_LOCAL)."; exit 1; fi
git fetch -q origin main || { echo "FALHOU: não consegui falar com o GitHub."; exit 1; }
V_MAIN_ANTES=$(git show origin/main:service-worker.js | grep -m1 -o "meus-apps-v[0-9]*")
if [ "$V_LOCAL" = "$V_MAIN_ANTES" ] && [ -n "$(git diff origin/main HEAD --stat)" ]; then
  echo "FALHOU: tem mudança nova mas a versão do cache continua $V_LOCAL. Suba o número em service-worker.js e faça commit."; exit 1
fi
[ -n "$RAMO" ] && git push -q origin "HEAD:$RAMO" 2>&1 | grep -v "moved\|github.com/\|^remote: *$"
git push origin HEAD:main 2>&1 | grep -E "rejected|error|fatal" && { echo "FALHOU: o GitHub recusou o envio para a main."; exit 1; }
git fetch -q origin main
[ -n "$RAMO" ] && git fetch -q origin "+$RAMO:refs/remotes/origin/$RAMO"
L=$(git rev-parse HEAD); R=$(git rev-parse origin/main)
V_MAIN=$(git show origin/main:service-worker.js | grep -m1 -o "meus-apps-v[0-9]*")
if [ "$L" != "$R" ]; then echo "FALHOU: a main do GitHub ($R) não é igual à minha ($L)."; exit 1; fi
echo "main do GitHub = minha versão ($L)"
echo "cache no ar: $V_MAIN"
echo "PUBLICADO E CONFERIDO (o app aberto se atualiza sozinho ao voltar para a tela)"
