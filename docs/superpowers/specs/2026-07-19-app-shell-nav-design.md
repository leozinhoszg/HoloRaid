# App Shell — navegação lateral + menu de usuário

**Data:** 2026-07-19
**Status:** aprovado (design validado pelo dono)
**Branch:** `feat/home-command-center` (continuação do overhaul visual)

## Objetivo

Dar ao app uma **navegação persistente** e profissional: sidebar glass no desktop, Drawer no mobile, e um menu de usuário (avatar) acessível de qualquer tela. Elimina a dependência do nav grid da Home para navegar.

## Escopo

**Dentro:** app shell responsivo (`ShellRoute`), sidebar + drawer compartilhando destinos, menu de usuário com Perfil/Reduzir animações/Admin/Sair, refatoração das 4 telas-destino para "body-only", limpeza da Home (sai nav grid + top bar).

**Fora:** redesign das telas de detalhe/formulário (já feitas); busca global; breadcrumbs; múltiplos níveis de menu.

## Navegação — padrão

- **Breakpoint:** `wide = maxWidth >= 900`.
- **Wide:** `Row[ Sidebar (240px) · Expanded(conteúdo) ]`. Topo do conteúdo: barra fina com **título da seção** (Orbitron) + `Spacer` + `HoloUserMenu`. FAB da seção (quando houver) flutua no canto.
- **Narrow:** `Scaffold(appBar: AppBar(leading: hambúrguer, title: HoloWordmark pequeno, actions: [HoloUserMenu]), drawer: HoloDrawer, body: conteúdo, floatingActionButton: fab da seção)`.
- Fundo: o `HoloBackground` global (já existe) aparece atrás; shell e telas usam `Scaffold` transparente.

## Destinos (config única)

`NavDestination { route, label, icon, color, Widget? fabForRoute }` numa lista central:
1. **Início** → `/home` (Icons.dashboard_outlined, indigo) — sem FAB
2. **Personagens** → `/characters` (Icons.people_alt_outlined, indigo) — FAB "Novo" → `/characters/new`
3. **Raids** → `/raids` (Icons.calendar_month_outlined, blue) — FAB "Criar raid" → `/raids/new`
4. **Dashboard** → `/dashboard` (Icons.bar_chart, heal) — sem FAB
5. **Admin** → `/admin/users` (Icons.shield_outlined, red) — **só se `role == admin`** — sem FAB

Item ativo: derivado de `GoRouterState.of(context).matchedLocation` (match por prefixo do `route`). Destaque: fundo `0x1A76C8FF` + faixa/indicador azul à esquerda + ícone/label em azul.

O papel do usuário (para gating do Admin) vem do `meProvider` (já existe). Enquanto carrega, Admin fica oculto.

## Componentes (novos, em `core/nav/`)

- **`app_shell.dart` — `AppShell({required Widget child})`**: decide wide/narrow (`LayoutBuilder`), monta a estrutura acima. Lê `meProvider` (role), `myRaids/…` não. Consome `NavDestinations`.
- **`nav_destinations.dart`**: a lista `navDestinations(bool isAdmin)` + helper `activeIndex(location)` e `fabFor(location, context)`.
- **`holo_sidebar.dart` — `HoloSidebar`**: painel glass 240px; `HoloWordmark` no topo; lista de destinos (`_NavTile`); item ativo destacado. `onSelect(route) => context.go(route)`.
- **`holo_drawer.dart` — `HoloDrawer`**: `Drawer` glass; topo com mini-perfil (`HoloAvatar` + nome + papel); mesma lista de tiles; fecha ao navegar.
- **`holo_user_menu.dart` — `HoloUserMenu`**: `HoloAvatar` como âncora de um `MenuAnchor` (mesmo estilo do `HoloDropdown`): **Perfil** (`context.push('/profile')`), **Reduzir animações** (item com `Switch` ligado ao `reduceMotionProvider`; não fecha ao alternar), **Admin** (se admin → `/admin/users`), **Sair** (`authStateProvider.notifier.logout()`, em vermelho).

`_NavTile` (privado, reutilizado por sidebar e drawer): ícone + label, estado ativo, `onTap`.

## Roteamento (`app_router.dart`)

- Introduz um `ShellRoute(builder: (_, __, child) => AppShell(child: child), routes: [ /home, /characters, /raids, /dashboard, /admin/users ])`.
- Rotas **fora** do shell (full-screen, com back): `/login`, `/characters/new`, `/characters/:id`, `/characters/:id/progression`, `/raids/new`, `/raids/:id`, `/raids/:id/edit`, `/profile`.
- `redirect` de auth e `refreshListenable` permanecem inalterados.
- Navegação entre destinos usa `context.go` (troca no shell); telas de detalhe/form usam `context.push` (empilha full-screen) — como já é hoje.

## Refatoração das telas-destino (body-only)

`CharactersListScreen`, `RaidsListScreen`, `DashboardScreen`, `UsersAdminScreen`: removem o próprio `Scaffold`/`AppBar`/`FloatingActionButton` e retornam **só o corpo** (o conteúdo do `body` atual). Título e FAB passam a ser responsabilidade do `AppShell` (via `NavDestination`).
- `ScaffoldMessenger.of(context)` no Admin continua válido (o `Scaffold` do shell é ancestral).
- Estados loading/error/empty seguem iguais (retornam `Center(...)`/lista, agora sem Scaffold).

**Home:** remove `HomeTopBar` (wordmark/chip/logout — agora no shell) e `NavGrid` + label "NAVEGAÇÃO". Fica: eyebrow "CENTRO DE COMANDO" + `NextRaidHero` + `StatTiles`. O stagger de entrada permanece. `home_top_bar.dart` e `nav_grid.dart` podem ser removidos (ou mantidos se algum teste usar — ajustar).

## Testes

- `app/test/core/nav/app_shell_test.dart`:
  - Wide (≥900): renderiza a sidebar com os destinos; **Admin oculto** para `role user`, **visível** para `admin`.
  - Narrow (<900): renderiza AppBar com hambúrguer; abrir o Drawer mostra os destinos.
  - `HoloUserMenu`: abre e mostra Perfil/Sair; toggle "Reduzir animações" altera o `reduceMotionProvider`.
- Ajustar `home_screen_test.dart`: **testar a Home isolada** (sem shell, como hoje). Remover os asserts que saíram da Home — `find.text('HoloRaid')` (wordmark agora no shell) e os tiles de nav ('Raids'/'Admin'). **Manter**: operation da próxima raid, os 3 stat tiles, empty-state e o teste anti-overflow em viewport estreito.
- `flutter analyze` limpo; `flutter test` verde.

## Responsividade

- Sidebar só em `>= 900`; abaixo, Drawer. Conteúdo sempre rolável (`SingleChildScrollView`/`ListView` das telas), `SafeArea`, sem overflow horizontal.
- Sidebar não rola horizontalmente; em alturas pequenas, a lista de destinos rola vertical.

## Riscos / decisões

- **ShellRoute + go_router:** manter `redirect` funcionando (o shell não interfere no redirect). Testar login→home ainda entra no shell.
- **Duplo Scaffold evitado:** só o shell tem Scaffold; telas-destino são body-only. Telas empilhadas (detalhe/form/perfil) mantêm o próprio Scaffold/AppBar (fora do shell).
- **Home nos testes:** o teste da Home muda (sem wordmark/nav grid) — ajustar asserts, não remover a cobertura de hero/tiles/overflow.
