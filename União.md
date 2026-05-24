# PROMPT DE UNIÃO — SoftDelivery
> Este prompt é usado UMA ÚNICA VEZ, no final, quando todos os módulos HTML já estiverem prontos.
> Leia tudo antes de executar qualquer coisa.

---

## OBJETIVO

Você vai receber vários arquivos HTML — cada um é um módulo independente do sistema **SoftDelivery**. Sua missão é unir todos em um **único arquivo HTML completo**, funcional, sem bugs, sem duplicações e sem conflitos.

---

## O QUE É O SOFTDELIVERY

Sistema de gestão completo para estabelecimentos de alimentação (pizzarias, hamburguerias, lanchonetes, açaíterias e similares). Cada estabelecimento tem seu próprio Firebase isolado. O sistema roda no GitHub Pages sem servidor próprio.

**Tecnologias:**
- HTML5 + CSS3 + JavaScript ES6+ vanilla
- Firebase (Firestore + Authentication)
- Google Fonts: `Inter` + `Poppins`
- Zero frameworks externos

---

## PADRÃO VISUAL OBRIGATÓRIO

O arquivo final deve seguir exatamente este padrão — use como referência para resolver conflitos entre módulos:

```css
:root {
  --primary:        #FF6B35;
  --primary-dark:   #E85520;
  --primary-light:  #FFF0EB;
  --secondary:      #2D3748;
  --bg:             #F7F8FC;
  --surface:        #FFFFFF;
  --border:         #E2E8F0;
  --text-primary:   #1A202C;
  --text-secondary: #718096;
  --success:        #38A169;
  --warning:        #D69E2E;
  --danger:         #E53E3E;
  --sidebar-w:      240px;
}
```

**Fontes:**
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700&display=swap" rel="stylesheet">
```

---

## ESTRUTURA DO ARQUIVO FINAL

O arquivo unido deve ter exatamente esta estrutura:

```
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <!-- Meta tags -->
  <!-- Google Fonts -->
  <!-- Firebase SDK -->
  <!-- CSS unificado de todos os módulos (sem duplicações) -->
</head>
<body>
  <!-- Tela de loading (splash) -->
  <!-- Tela de Login / Auth -->
  <!-- Layout principal (sidebar + conteúdo) -->
    <!-- Sidebar com navegação entre módulos -->
    <!-- Área de conteúdo onde cada módulo renderiza -->
      <!-- Módulo: Dashboard / Visão geral -->
      <!-- Módulo: Pedidos -->
      <!-- Módulo: Cardápio / Produtos -->
      <!-- Módulo: Caixa / PDV -->
      <!-- Módulo: Delivery -->
      <!-- Módulo: Relatórios / Financeiro -->
      <!-- Módulo: Clientes / CRM -->
      <!-- Módulo: Configurações -->
  <!-- Toast container (único, global) -->
  <!-- Modais globais -->
  <!-- JavaScript unificado de todos os módulos -->
</body>
</html>
```

---

## MÓDULOS QUE VOCÊ VAI RECEBER

Você receberá os seguintes HTMLs. Cole cada um na sua mensagem identificando qual é:

| Módulo | Identificação |
|--------|--------------|
| Base + Auth | `[MÓDULO: BASE]` |
| Pedidos | `[MÓDULO: PEDIDOS]` |
| Cardápio / Produtos | `[MÓDULO: CARDÁPIO]` |
| Caixa / PDV | `[MÓDULO: CAIXA]` |
| Delivery | `[MÓDULO: DELIVERY]` |
| Relatórios / Financeiro | `[MÓDULO: RELATÓRIOS]` |
| Clientes / CRM | `[MÓDULO: CLIENTES]` |
| Configurações | `[MÓDULO: CONFIGURAÇÕES]` |
| Cardápio Online | `[MÓDULO: CARDÁPIO ONLINE]` |

---

## REGRAS DE UNIÃO — LEIA COM ATENÇÃO

### CSS
- Extraia todo o CSS de cada módulo
- Remova duplicações (variáveis `:root`, resets, fontes, componentes repetidos)
- Mantenha apenas uma versão de cada regra — a mais completa
- Organize em seções comentadas:
  ```css
  /* === RESET & BASE === */
  /* === VARIÁVEIS === */
  /* === LAYOUT === */
  /* === SIDEBAR === */
  /* === AUTH === */
  /* === PEDIDOS === */
  /* === CARDÁPIO === */
  /* === CAIXA === */
  /* === DELIVERY === */
  /* === RELATÓRIOS === */
  /* === CLIENTES === */
  /* === CONFIGURAÇÕES === */
  /* === COMPONENTES GLOBAIS === */
  /* === RESPONSIVO === */
  ```

### JavaScript
- Extraia todo o JS de cada módulo
- Remova funções duplicadas (toast, modal, formatadores de moeda, data, etc.)
- Crie funções globais únicas no topo:
  ```javascript
  /* === UTILITÁRIOS GLOBAIS === */
  function showToast(msg, tipo, duracao) { ... }
  function formatMoeda(valor) { ... }
  function formatData(date) { ... }
  function confirmarExclusao(msg, callback) { ... }
  ```
- Organize o restante em seções por módulo:
  ```javascript
  /* === FIREBASE CONFIG === */
  /* === AUTH === */
  /* === ROTEAMENTO === */
  /* === PEDIDOS === */
  /* === CARDÁPIO === */
  /* === CAIXA === */
  /* === DELIVERY === */
  /* === RELATÓRIOS === */
  /* === CLIENTES === */
  /* === CONFIGURAÇÕES === */
  /* === INIT === */
  ```

### HTML
- Cada módulo vira uma `<section>` com `id` e `class="modulo"` e `style="display:none"`
- Apenas o módulo ativo fica visível por vez
- A sidebar controla qual módulo exibir via função `navegarPara(modulo)`
- Exemplo:
  ```html
  <section id="mod-pedidos" class="modulo" style="display:none">
    <!-- conteúdo do módulo de pedidos -->
  </section>
  ```

### Firebase
- Use apenas UMA inicialização do Firebase no topo do JS
- Remova todas as inicializações duplicadas dos módulos individuais
- Mantenha o bloco de comentário indicando onde o usuário cola as credenciais:
  ```javascript
  /* === FIREBASE CONFIG — substitua pelos seus dados === */
  const firebaseConfig = {
    apiKey: "SUA_API_KEY",
    authDomain: "SEU_PROJETO.firebaseapp.com",
    projectId: "SEU_PROJETO_ID",
    storageBucket: "SEU_PROJETO.appspot.com",
    messagingSenderId: "SEU_SENDER_ID",
    appId: "SEU_APP_ID"
  };
  ```

### Auth
- O fluxo de autenticação deve ser global:
  1. Usuário abre o HTML → vê tela de login
  2. Faz login → sistema carrega o módulo padrão (Dashboard ou Pedidos)
  3. Logout → volta para tela de login, limpa todos os estados
- O nível de acesso (role) do usuário define o que aparece na sidebar

### Roteamento
- Função central `navegarPara(nomeModulo)`:
  ```javascript
  function navegarPara(modulo) {
    document.querySelectorAll('.modulo').forEach(m => m.style.display = 'none');
    document.getElementById('mod-' + modulo).style.display = 'block';
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('[data-modulo="' + modulo + '"]').classList.add('active');
  }
  ```

### Dados de teste
- Mantenha os dados fictícios de demonstração de cada módulo
- Eles devem funcionar quando o Firebase não estiver configurado

### Responsivo
- Sidebar vira menu hamburguer em telas < 768px
- Todos os módulos devem funcionar em mobile
- Área mínima de toque: 44x44px

---

## COMO EXECUTAR

1. O usuário vai colar os HTMLs dos módulos identificados com `[MÓDULO: NOME]`
2. Você lê todos antes de começar
3. Confirma quais módulos recebeu
4. Executa a união seguindo todas as regras acima
5. Entrega um único arquivo `.html` completo e funcional
6. Ao final, lista o que foi unido e instrui como configurar o Firebase

---

## MENSAGEM DE CONFIRMAÇÃO

Ao receber este prompt (sem os HTMLs ainda), responda exatamente assim:

```
Pronto para unir o SoftDelivery!

Cole os módulos HTML identificados assim:

[MÓDULO: BASE] → cole o HTML aqui
[MÓDULO: PEDIDOS] → cole o HTML aqui
[MÓDULO: CARDÁPIO] → cole o HTML aqui
[MÓDULO: CAIXA] → cole o HTML aqui
[MÓDULO: DELIVERY] → cole o HTML aqui
[MÓDULO: RELATÓRIOS] → cole o HTML aqui
[MÓDULO: CLIENTES] → cole o HTML aqui
[MÓDULO: CONFIGURAÇÕES] → cole o HTML aqui
[MÓDULO: CARDÁPIO ONLINE] → cole o HTML aqui

⚠️ **Atenção:** O módulo Cardápio Online é um arquivo HTML **separado e independente**. Não entra na sidebar do sistema principal. Entregue-o como um segundo arquivo `cardapio-online.html` além do sistema principal `index.html`. Ele se conecta ao mesmo Firebase do estabelecimento.

Pode enviar todos de uma vez ou um por vez — quando disser "UNIR AGORA", executo a união completa.
```

Aguarde. Só execute a união quando o usuário disser **"UNIR AGORA"**.

---

## CHECKLIST FINAL ANTES DE ENTREGAR

Antes de entregar o HTML unido, verifique mentalmente:

- [ ] Apenas uma importação do Firebase SDK
- [ ] Apenas uma inicialização do Firebase
- [ ] Apenas uma importação do Google Fonts
- [ ] Nenhuma variável CSS duplicada no `:root`
- [ ] Nenhuma função JS duplicada
- [ ] Todos os módulos viram `<section class="modulo">` com `display:none`
- [ ] Função `navegarPara()` funciona corretamente
- [ ] Sidebar mostra/oculta itens conforme o role do usuário
- [ ] Tela de login aparece antes de qualquer módulo
- [ ] Dados fictícios funcionam sem Firebase configurado
- [ ] Sem erros no console do navegador
- [ ] Responsivo em mobile (320px) e desktop (1440px)
- [ ] Toasts funcionam globalmente
- [ ] Modais funcionam globalmente

---

*SoftDelivery — Prompt de União v1.0*
*Use este documento apenas quando TODOS os módulos estiverem prontos*
