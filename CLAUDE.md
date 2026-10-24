# Comportamento padrão de todo app e HTML do Klebson (permanente, 24/10/2026)

Vale para os 6 apps do menu (Tapete CRM, Meu CRM, Plano/DOA, ADM, Rico, Estudo/LER), para o menu, para todo HTML enviado ao Plano e para todo app ou HTML novo. Quando ele pedir qualquer coisa de forma genérica ("faça isso nos apps", "aplique em todos", "app novo"), aplicar tudo abaixo sem perguntar de novo. Repositório: SOFTWARE (GitHub Pages). Teste sempre em 412x915 e diga que não foi medido no celular dele.

## 1. Estrutura de todo app
- `<script src="app-boost.js">` no `<head>` (sem zoom, sem puxar para atualizar, gestos de alternar, lembrar tela e rolagem). App novo entra na lista do `service-worker.js` e a versão do cache sobe a cada publicação (`meus-apps-vNNN`).
- Viewport com minimum-scale=1, maximum-scale=1, user-scalable=no.
- Dados do aparelho aparecem primeiro; a nuvem só troca se for diferente. Em `onSnapshot`, nunca redesenhar se nada mudou (comparar assinatura: ids + updatedAt, ou JSON pequeno).
- Imagens leves (WebP), sem imagem pesada.
- Cor da barra do celular acompanha o fundo da página (`CorBarra` e `theme-color`); menu fica escuro (`data-fixa`).

## 2. Gestos de alternar (módulo `Alterna` no app-boost.js)
- Zigue-zague horizontal (ir e voltar, uns 40 px, até 2 s, mais horizontal que vertical): app sem par vai ao menu e guarda de onde saiu; no próximo app, outro zigue-zague conecta os dois e já troca; conectados trocam direto entre si. A conexão fica salva (localStorage `alterna.v1`) até desfazer. "App de origem" pendente vale 30 min.
- V ou U solto (desce, vira, sobe): de qualquer app ou HTML do Plano vai ao menu, sem mexer nas conexões.
- Dois dedos tocando juntos (o "dois cliques" dele): desfaz a conexão do app atual; o próximo zigue-zague volta ao menu.
- Rico aberto pelo Plano (`RICO.html?i=plano`) é um app à parte (`ricop`) do Rico do menu (`rico`): mesmos dados, telas separadas (pino, mapa aberto, posição do processo ficam em chaves `ui.m.*` e `ui.p.*`, fora das chaves `rico.*`).
- Dentro de iframes (HTML do Plano, estudo) o toque não chega à página: o gesto é injetado no HTML (`AlternaGestos.*.toString()`) e avisa o pai por `postMessage` (`alternaZig`, `alternaMenu`, `alternaQuebra`).
- Gesto novo: sempre testar com toque simulado (CDP) contra rolagem vertical, só ida, diagonal e tremida pequena, para não disparar sem querer.

## 3. Voltar no mesmo lugar
- Ao trocar de app, cada app guarda onde estava (`Alterna.aoSair`) e a flag `sessionStorage.troca` diz qual app deve restaurar (códigos: DOA, LER, RICO, RICOP, TAPETE, CRM, ADM). O menu apaga a flag ao abrir (entrar pelo menu abre do começo).
- Estudo: pasta, estudo aberto, rolagem da lista e do estudo. Plano: pasta, processo aberto, rolagem, HTML aberto e o estado dele. Rico: rolagem; com o pino, mapa, processo e célula aberta. Tapete, Meu CRM, ADM: tela (screen/page/pnl) e rolagem.
- HTML enviado ao Plano: o Plano injeta `estadoFrame` (cartões abertos por classe, campos, caixas que rolam, details, rolagem) e devolve ao reabrir. Não guarda dados próprios do HTML (sandbox sem armazenamento).
- Botão voltar do celular (módulo `Voltar`): fecha a janela aberta ou volta uma tela; sem nada aberto, volta ao menu. Troca de app usa `Voltar.sai(url)` para não deixar passos fantasmas no histórico.

## 4. Sem piscar, sem tremer
- Ao voltar de uma troca, esconder a página (`visibility:hidden`) até estar montada e na posição; só então mostrar. Animações de entrada nascem terminadas (`animation-delay:-5s` durante a volta). Nunca mostrar o topo e depois pular.
- `scrollTo({top, behavior:'instant'})` sempre (a página usa scroll-behavior smooth). Parar de reposicionar depois do primeiro toque. Desligar `overflow-anchor` enquanto restaura.
- Nunca deixar ouvinte de `touchstart`/`touchmove` não passivo ligado no documento (trava toda rolagem). Só enquanto uma ação precisa dele.
- Layout que depende de medida (seta, margens) já nasce no tamanho típico e só muda se a diferença for visível.
- Sem puxar para atualizar (`overscroll-behavior-y:contain`).

## 5. Como trabalhar
- Mudança de design: mostrar imagem antes e esperar o "pode fazer". Função e correção: fazer.
- Antes de publicar: rodar a checagem de sintaxe dos scripts, abrir o app no teste sem erros novos, testar o fluxo mexido e subir a versão do cache. Publicar na main do SOFTWARE e conferir que o GitHub tem o mesmo commit.
- Responder em árvore (CLAUDE.md do repositório Claude), sem emoji, sem caminhos nem código, dizendo o que foi testado e o que não foi confirmado.
