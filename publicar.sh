#!/bin/bash
# Publica o SOFTWARE de verdade: envia para a main (é a main que o GitHub Pages mostra) e confere no GitHub.
# Só diga "publicado" ao Klebson depois que este script terminar com "PUBLICADO E CONFERIDO".
cd "$(dirname "$0")" || exit 1
RAMO=$(git branch --show-current)
if [ -n "$(git status --porcelain)" ]; then echo "FALHOU: tem mudança sem commit. Faça o commit antes."; exit 1; fi
V_LOCAL=$(grep -m1 -o "meus-apps-v[0-9]*" service-worker.js)
V_APP=$(grep -m1 -o "NV_APP = .meus-apps-v[0-9]*" app-boost.js | grep -o "meus-apps-v[0-9]*")
if [ "$V_APP" != "$V_LOCAL" ]; then echo "FALHOU: a versão no app-boost.js ($V_APP) tem que ser igual à do service-worker.js ($V_LOCAL)."; exit 1; fi
# Github NÃO é mais obrigatório (Plano, Passo 7, 02/11/2026): o código mora no R2 (atuais/software). Falha no Github vira só aviso.
V_MAIN_ANTES=""
git fetch -q origin main 2>/dev/null && V_MAIN_ANTES=$(git show origin/main:service-worker.js 2>/dev/null | grep -m1 -o "meus-apps-v[0-9]*")
if [ -n "$V_MAIN_ANTES" ] && [ "$V_LOCAL" = "$V_MAIN_ANTES" ] && [ -n "$(git diff origin/main HEAD --stat)" ]; then
  echo "FALHOU: tem mudança nova mas a versão do cache continua $V_LOCAL. Suba o número em service-worker.js e faça commit."; exit 1
fi
echo "cache desta publicação: $V_LOCAL"
# endereço novo (apps.v4cless.com): o mesmo código vai para a Cloudflare; a chave vem de NV_CF_TOKEN (nunca gravada aqui)
if [ -z "$NV_CF_TOKEN" ]; then echo "ATENÇÃO: sem NV_CF_TOKEN, o endereço novo (apps.v4cless.com) NÃO foi atualizado."; exit 1; fi
(cd servidor && CLOUDFLARE_API_TOKEN="$NV_CF_TOKEN" npx -y wrangler@4.40.0 deploy 2>&1 | grep -q "Current Version ID") || { echo "FALHOU: a Cloudflare recusou o envio (endereço novo não atualizado)."; exit 1; }
echo "endereço novo atualizado: apps.v4cless.com"
# código na Cloudflare R2 (cópia que não depende do Github)
R2S=""; for c in "$(dirname "$0")/../Claude/.claude/scripts/software-r2.py" "$HOME/Claude/.claude/scripts/software-r2.py" /home/user/Claude/.claude/scripts/software-r2.py; do [ -f "$c" ] && R2S="$c" && break; done
if [ -n "$R2S" ]; then python3 -I "$R2S" enviar "$(pwd)" || { echo "FALHOU: o código não chegou ao R2."; exit 1; }; else echo "ATENÇÃO: software-r2.py não achado, código NÃO guardado no R2."; exit 1; fi
# Github: só aviso (cópia extra enquanto o repositório existir)
[ -n "$RAMO" ] && git push -q origin "HEAD:$RAMO" >/dev/null 2>&1; git push -q origin HEAD:main >/dev/null 2>&1 || echo "AVISO: Github não atualizado (não é mais obrigatório)."
echo "PUBLICADO E CONFERIDO (o app aberto se atualiza sozinho ao voltar para a tela)"
