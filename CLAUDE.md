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
- O gesto V foi removido (24/10/2026, pedido dele): a ida ao menu é só pela faixa da base e pelo zigue-zague.
- Dois dedos tocando juntos (o "dois cliques" dele): desfaz a conexão do app atual; o próximo zigue-zague volta ao menu.
- Faixa transparente no LADO DIREITO, só na metade de baixo da altura (50% a 100%; pedido dele 25/10/2026: a de cima ficou livre) (48 px de largura, `#alterna-base`, por cima de tudo, o toque não passa; a rolagem vertical continua): UM toque (pedido dele, 24/10/2026; arrastar para rolar não conta) vai ao menu; o app guarda onde estava (`alterna.volta`, vale 1 hora, uma vez) e o menu abre ele no mesmo lugar ao tocar nele. Todo app novo com app-boost já ganha.
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
- Nomes e textos não podem aparecer "carregando": Rico esconde a página até os textos do aparelho entrarem nos campos (`rico-esconde` solto por `__ricoRevela`); Tapete, Meu CRM e ADM escondem (`alterna-quieto`) até o DOM ficar quieto 160 ms depois do load (limite 1,2 s). App novo com dados em IndexedDB: mesmo cuidado.
- Rico grava uma cópia síncrona (`ricoc_*` no localStorage) além do IndexedDB, porque sair rápido pela faixa de baixo podia perder a gravação assíncrona e os nomes voltavam da nuvem (piscando).
- Faixa de saída (`#alterna-base`): fica no lado direito, no meio da altura, NUNCA na base (24/10/2026, pedido dele: na base ela tirava a sensibilidade dos botões de baixo e segurar ali saía do app). A base da tela fica 100% livre: o menu inferior do Tapete (Registra/Hoje) e os botões dos outros apps recebem o toque direto, sem camada por cima.
- A primeira tela do Tapete (Registra) monta antes de esperar a nuvem (`loadConfig`), senão ficava a tela inicial vazia/errada. O passo do Registra só volta quando a saída foi por troca de app.
- Rico ao voltar: a página só aparece depois do DOM ficar quieto 160 ms e da rolagem estar no lugar (`__ricoExtra`); nada de reposicionar depois de aparecer (era a "mexidinha" para cima e para baixo).
- Tapete, Registra: tocar na área vazia abaixo da pergunta não reabre o teclado; só tocar dentro da pergunta reabre (o teclado continua abrindo sozinho a cada passo).
- Tapete, Registra: qualquer toque fora da pergunta (vazio, menu de baixo) tira o foco do campo, para o teclado não subir; só dentro da pergunta ele reabre.
- Rico, mapa mental: dois toques no círculo abrem a leitura limpa (`#rdOv`, função `abrirLeitura`): título = nome da célula (cápsula sem fundo, linha fina), subtítulos centralizados, texto em Inter itálico 16 (escolha dele, 24/10/2026; títulos e números seguem DM Sans; `__itálico__` dentro do texto vira normal) com marcadores do editor (número em círculo bege, traço, bolinha, check). Segurar mostra o lápis e o X; o lápis edita ali mesmo, no mesmo desenho (título, subtítulos e texto editáveis; barra de baixo: negrito, itálico, T título, check, número, bolinha, traço, + novo texto, pronto; salva sozinho; nunca fechar a leitura para abrir outro editor); dois toques no vazio fecham. Sem dourado e sem azul nos títulos (preto do texto).
- Rico, leitura/edição: segurar entra e sai da edição (sem pílula de lápis; a seleção nativa de texto é segurada por 1,2 s para não abrir o modo copiar). Barra de baixo com botões de 44: `Aa` (abre o leque negrito, itálico, check), T, número, bolinha, traço, +, pronto. Ferramenta se arma (fica preta): tocar na linha aplica ali (T divide o texto naquela linha e cria o título); tocar de novo na ferramenta desarma. Espaços entre textos e linhas em branco cortados pela metade.
- Rico, leitura (24/10/2026, ajustes dele): título e texto em Inter normal (sem itálico; títulos em negrito). Ao segurar, a seleção nativa (balãozinho copiar) é impedida com `rd-hold` (user-select none enquanto o dedo está embaixo). Na edição a faixa de saída some (`html.rd-editando`) e a barra de baixo usa a largura toda, alinhada à direita. Segurar liga a edição SEM cursor, teclado nem alça azul (o fim do toque é cancelado no elemento antigo). Barra de baixo: botões 44, `Aa` troca o grupo T/número/bolinha/traço/+ pelo grupo negrito/itálico/check (no mesmo lugar, nunca em cima); ferramenta armada não abre teclado (o toque é tratado no touchend). `+` = citação: o trecho selecionado vira bloco de citação como no estudo (cartão com barra vinho, DM Sans 15, `m.q`), espaçamento automático; selecionar de novo desfaz. A barra respeita os 54 px da direita porque a faixa de saída cobre o lado direito (botão ali sairia do app).
- Rico, leitura/edição (24/10/2026, regras dele): entrar na edição = SEGURAR; sair = DOIS TOQUES rápidos no texto (segurar na edição não faz nada, deixa copiar/selecionar do jeito nativo). `+` = citação: toca nele (fica preto), arrasta o dedo na vertical sobre as linhas (ficam marcadas) e ao soltar viram citação (`m.q`); espaçamento da citação igual ao entre textos (9 px; citações coladas 4 px). Teclado: a barra sobe junto (`--rd-kb`, visualViewport) e a linha do cursor vai para ~30% da altura visível, com folga embaixo (`rd-col` ganha 55vh de padding na edição).
- Rico, leitura/edição, regra do teclado (24/10/2026): na edição NÃO há cursor nem teclado por padrão (qualquer foco é desfeito). O botão lápis dentro do leque `Aa` liga o modo digitar (fica preto): aí tocar no texto põe o cursor e abre o teclado; desligar volta ao sem teclado. Ferramentas armadas e o leque aberto usam `inputmode=none`. Dois toques saem da edição só com o digitar desligado. Bolinha do check marca/desmarca na leitura e na edição (grava na hora). Numeração continua entre pedaços (`m.n`). Cuidado que já deu bug: a flag `segurou` precisa zerar em TODO touchstart, senão todos os toques da edição são cancelados (sem cursor e sem clique).
- Voltar do celular = abrir do começo; só a faixa de baixo guarda a posição (regra dele, 24/10/2026).
- Abrir o app instalado sem logo do Chrome nem barra: manifest com id, scope, display standalone e background_color igual à cor do menu (#020719). Se ainda aparecer, o atalho foi criado fora do app instalado: remover e instalar de novo pelo Chrome (Instalar app).

## 4A. APARECER DE UMA VEZ, "TELETRANSPORTE" (permanente, 24/10/2026, gosto dele)
- Janelas, folhas de baixo, balões, avisos, menus e pílulas aparecem e somem de uma vez (plim), sem subir de baixo, sem descer, sem deslizar e sem esmaecer. Nada de `transform: translate` nem `opacity` com transição para surgir. Se um teclado vai abrir, a janela já nasce na altura final dele (altura do teclado guardada em `ui.kbh`), sem pulo.
- Vale em todo app e HTML novo ou editado. Rico já foi todo ajustado (keyframes cicloEntra, habPickSobe, rcmConfIn, rcmCardIn viraram sem movimento; toast, #tip, .rcm-scrim e .rcm-sheet sem transição).

## 4B. PUBLICAR DE VERDADE (permanente, 24/10/2026, erro repetido várias vezes)
- O app mostra a branch main do SOFTWARE (GitHub Pages). Commit ou push na branch de trabalho NÃO publica: já deixei mudanças de fora por isso.
- Para publicar: subir o número do cache em service-worker.js, fazer commit e rodar `bash publicar.sh`. Ele envia para a main e confere no GitHub.
- Nunca dizer "publicado" antes de o script mostrar "PUBLICADO E CONFERIDO". Se falhar, dizer que falhou e o motivo. Se o Pages não puder ser aberto daqui, dizer "não confirmei no ar".
- Toda mudança pedida pelo Klebson neste repositório termina com esse script, na mesma resposta, sem esperar ele cobrar.

## 5. Como trabalhar
- Mudança de design: mostrar imagem antes e esperar o "pode fazer". Função e correção: fazer.
- Antes de publicar: rodar a checagem de sintaxe dos scripts, abrir o app no teste sem erros novos, testar o fluxo mexido e subir a versão do cache. Publicar na main do SOFTWARE e conferir que o GitHub tem o mesmo commit.
- Responder em árvore (CLAUDE.md do repositório Claude), sem emoji, sem caminhos nem código, dizendo o que foi testado e o que não foi confirmado.

## 6. Dados só do aparelho
- Todo dado novo que ficar só no aparelho (localStorage, cache) tem que entrar na cópia automática do app-boost (`AparelhoBackup`: coleções aparelho_rico, aparelho_plano, aparelho_menu, aparelho_backup no Firestore, só acrescenta e atualiza, limite de 900 mil caracteres por documento). App novo com dado local: acrescentar a chave na função `coleta()`.
- Backup de verdade: branch backup-codigo-AAAA-MM-DD (SOFTWARE) e backup-firebase-AAAA-MM-DD (Claude), nunca apagar; ver MDS/SYSTEM/Backup.md.

## 7. Velocidade máxima (permanente, 24/10/2026, pedido dele)
- Em todo HTML ou app, novo ou editado, qualquer edição: fazer sempre com a velocidade máxima possível, sem perguntar. Abertura e volta no menor tempo que mantém a tela firme: esperas mínimas (DOM quieto 60 ms; reposicionar em 80 ms), nada de espera por nuvem antes de montar a primeira tela, dados do aparelho primeiro, escondido só até estar pronto, sem reposicionar depois de aparecer, imagens leves, cache do service worker. Medir o tempo até aparecer e dizer o resultado.

---

# Erros que já aconteceram (leia antes de mexer)

Lista do que deu errado ao deixar os apps rápidos, firmes e sem piscar, e a solução que funcionou. Ler antes de mexer em app ou HTML. Cada item: o erro, o porquê, o que fazer.

## Piscar, pular e tremer
- Rolagem que desliza sozinha ao voltar: o CSS tinha scroll-behavior smooth, então scrollTo animava. Usar sempre scrollTo({top, behavior:'instant'}).
- Tela aparecia no topo e depois pulava para o lugar guardado: mostrava antes de posicionar. Esconder (visibility:hidden) até a página montar e a rolagem estar no alvo; soltar depois de load e fontes; limite de segurança de 1,5 s.
- Animação de entrada das células repetia a cada redesenho (dois piscos): durante a volta usar animation-delay negativo (-5s). Nunca usar animation:none e remover depois: ao remover a animação recomeça. O override só sai depois de passar a duração.
- Seta que mudava de tamanho depois de abrir (pulo de 46 px): nascer no tamanho típico no HTML e só redesenhar se a diferença passar de 3 px.
- Reposicionar a rolagem várias vezes (300, 800, 1800 ms) puxava a tela de volta enquanto o usuário já rolava (tremida para cima e para baixo): parar no primeiro toque.
- O navegador mexe na rolagem sozinho quando o conteúdo cresce (scroll anchoring) e dava pulinho ao restaurar: overflow-anchor:none enquanto restaura, voltar ao normal no primeiro toque.
- Conteúdo que monta depois (HTML do Plano como o Leads): tirar a foto do estado e restaurar só quando o DOM parar de mudar (MutationObserver quieto por 140 ms) e mostrar só quando a rolagem alvo é alcançável.
- Lista mostrava "Sem processos" e depois descia quando os dados chegavam: esconder a lista até os dados do aparelho carregarem.
- Firebase onSnapshot redesenhava a cada envio, mesmo igual (piscar na abertura): comparar assinatura (ids e updatedAt, ou JSON pequeno) e não redesenhar se nada mudou. Feito no Plano, Tapete CRM, Meu CRM, ADM e Rico.
- Puxar para atualizar recarregava a página e piscava: overscroll-behavior-y:contain em todos os apps.
- Ouvinte de touchstart ou touchmove não passivo no document faz TODA rolagem esperar o app (travadas). Só ligar enquanto a ação precisa (seletor aberto, arrastando). Pinça já é bloqueada por touch-action:pan-x pan-y.

## Gestos e alternar apps
- Em iframe com sandbox sem allow-same-origin o toque não chega à página de fora e o armazenamento fica bloqueado: injetar o gesto dentro do HTML e avisar o pai por postMessage. O Rico abre como página, não como iframe, senão não grava dados.
- Troca com location.replace deixava passos fantasmas no histórico (voltar não chegava ao menu): cada pushState leva a profundidade em history.state._d e a troca desfaz com history.go(-d) antes (Voltar.sai).
- Flag de troca pendente reabria o Rico ao entrar pelo menu: a flag só é criada pelo gesto, consumida ao chegar e apagada pelo menu.
- Dois lugares para o mesmo app (Rico no menu e no Plano) compartilhavam o estado de tela (pino, mapa aberto): chaves por instância (?i=plano) para a tela; os dados continuam os mesmos.
- A posição dentro do Processo (nível, caminho) estava dentro dos dados compartilhados: passou para chave própria da instância.
- Gesto não deve ser bloqueado só por tocar num input (ADM tem input em toda a tela): bloquear só com o input focado.
- Gesto novo: testar com toque simulado contra rolagem vertical, só ida, diagonal e tremida pequena.
- "Dois cliques" para ele é tocar com dois dedos juntos (o gesto antigo), não toque duplo. Quando um termo for ambíguo, usar a palavra dele ou perguntar.

## Barra do celular e cores
- theme-color do Rico dizia escuro e a página é creme: ler a cor real do fundo (CorBarra) em vez do aviso. O menu mantém a cor com data-fixa.

## Service worker e HTML enviado
- HTML enviado pelo menu fica no cache apps-enviados; o service worker injeta o app-boost nele. Usar caches.match(..., {ignoreSearch:true}) para endereços com ?i=plano.
- Sempre subir o número do cache a cada publicação.

## Dados
- Os mapas do Rico (rico.proc.* e rico.mapa.*), a lista de HTMLs do Plano e as versões enviadas pelo menu ficam só no aparelho (localStorage e cache). O Firebase guarda respostas, metas, áreas, hábitos e ciclo. Perder o celular perde o resto, a menos que seja exportado.
- Chaves ui.* guardam estado de tela e ficam fora de rico.* para não entrar no desfazer nem na nuvem.

## Como testei (repetir)
- Playwright com 412x915, Firebase simulado, toque por CDP (Input.dispatchTouchEvent), gravação de quadros (Page.startScreencast) para contar telas diferentes na volta, amostragem de rolagem e visibilidade a cada 40 ms.
- Teste que só diz "abre sem erro" não pega piscada: gravar a volta.

## Erros meus de processo
- Ao refatorar cortando blocos por posição apaguei uma função usada por outra parte (salvaEstadoPlano). Depois de refatorar: procurar as funções usadas e rodar o fluxo.
- Não confirmar no celular dele: dizer "não medi no celular", pedir para fechar e abrir o app duas ou três vezes por causa do cache.
- Mudança de design só com imagem antes e o "pode fazer".

## AO VIVO PONTA A PONTA (regra do Klebson, 2026-10-27, vale em todo app e HTML, atual e futuro)
- 100% do que o app guarda sincroniza entre aparelhos em menos de 1 s, sem recarregar, sem piscar e sem sair do lugar. Nunca ligar só uma parte.
- SERVIDOR ÚNICO (2026-10-27): os dados vivem na Cloudflare (Worker `nv-dados` com Durable Object, pasta `servidor/`, endereço nv-dados.meusapps.workers.dev). Cada mudança ganha um número de ordem dado só pelo servidor e todos os aparelhos recebem na mesma ordem (por isso ficam iguais). Canal do aparelho: `nv-canal.js` (uma conexão ao vivo por página, reenvia o que não foi confirmado quando a internet volta). `dados.js` (d3), `nuvem-rico.js` (r11) e o caderno do Rico usam esse canal. O Firebase ficou como reserva (a cópia inicial veio de lá; o login continua nele). Publicar o servidor: `npx wrangler deploy` na pasta `servidor/` (chave da Cloudflare só em arquivo temporário). Conferência: o servidor grava um retrato (contagem por coleção e diagnóstico dos aparelhos) em `cf_estado/agora` no Firebase a cada 30 min.
- Antes de mexer: listar TODO dado que o app grava (localStorage, IndexedDB, Firestore, campos, escolhas, listas, textos, configurações) e ligar cada um.
- Listas de itens (contatos, clientes, pedidos, lançamentos, processos): camada única `dados.js` (`<script src="dados.js">` depois do app-boost). `Dados.liga({ nome, area, ler: () => lista, escrever: (lista) => { trocar a lista, salvar local, AoVivo.pinta(...) } })` e, depois de cada salvamento local, `Dados.mudou(nome)` (`Dados.mudou(nome, true)` só em "apagar tudo" de propósito). Coleção no servidor: `v2_<nome>`, um documento por item, campo a campo. Opções: `semMidia` (fotos data: ficam no aparelho), `ignora`, `novoNoInicio`, `padrao(item)` (item de fábrica não sobe). O app não grava mais direto na nuvem.
- Chaves do aparelho (localStorage): motor `nuvem-rico.js?col=NOME&k=chave1,prefixo*` (r11) e `window.nvTela.NOME = function(chaves){ redesenhar no lugar }`. Outros apps só recebem com `&so=1` (app-boost). O motor junta por partes (célula com célula) e guarda conflitos em `v2_conflitos`.
- Economia da cota grátis da Cloudflare (100 mil pedidos por dia; mensagens ao vivo contam menos): envio 0,4 s depois da última letra e no máximo 1 por segundo digitando; ao abrir, só desce o que mudou (número de ordem `st`); diagnóstico em `diag`, só quando muda. Nunca gravar a cada letra.
- Redesenho sempre por `AoVivo.pinta(nome, fn)` (mantém rolagem da página e dos painéis; espera só enquanto a pessoa digita de verdade; o campo em edição volta com texto, foco e cursor).
- HTML aberto dentro do Plano: guarda em `ph:*` pelo Plano e se atualiza montando a versão nova por trás.
- Service worker: código (html, js, json) vem da rede primeiro (até 1,5 s), cache só sem rede; imagens do cache. Subir o número do cache a cada publicação.
- Testes: servidor local (`npx wrangler dev` na pasta `servidor/`, com `.dev.vars` só no teste) e dois navegadores (scripts de teste na sessão), campo por campo, com tempo medido; depois conferir no retrato `cf_estado/agora` que cada celular gravou.
