# Home Command Center — Redesign holográfico + base visual do app

**Data:** 2026-07-18
**Status:** aprovado (mockup validado pelo dono — "se ficar igual isso tá perfeito")
**Mockup de referência:** `scratchpad/home_mockup.html` (Artifact publicado)

## Objetivo

Repaginar a Home de um launcher Material claro para um **command center holográfico** ("console de comando de uma nave"), alinhado ao `design_system.md`. No caminho, estabelecer a **base visual global** do app (tema dark + camada de UI compartilhada + tipografia), hoje presa só na feature de login. A Home é a tela-vitrine; as demais telas passam a **herdar o tema dark** (some o contraste gritante do Material claro), mas o redesign detalhado delas fica fora deste escopo.

## Escopo

**Dentro:**
- Tema global dark holográfico (`ThemeData`) com as 4 fontes.
- Camada `core/ui` compartilhada: paleta, wordmark, starfield, glass, fundo holográfico (+ fragment shader), background wrapper.
- Home reescrita como command center consumindo endpoints existentes.
- Correção do avatar do usuário (renderiza avatar real do Discord com fallback) — resolve o "retângulo cinza".
- Toggle "reduzir animações" (acessibilidade do design_system) via provider + respeito a `MediaQuery.disableAnimations`.
- Widget test da Home (estados: com próxima raid, sem raid, loading).

**Fora (follow-up):** redesign detalhado de Personagens/Raids/Dashboard/Perfil/Admin (só herdam o tema dark agora); efeitos sonoros; shaders por-tela além do fundo da Home.

## Linguagem visual (do JSON do dono + design_system)

**Paleta (`HoloPalette`):**
- Fundo radial: `#080816 → #0B0F28 → #050509`
- Espectro de papéis (acentos): blue `#76C8FF`, indigo/tank `#7E7BFF`, heal `#8CFFB7`, gold `#FFF29A`, dps `#FF8B5B`, red `#FF5555`
- Texto: `#EAECF7` (ink), `#9AA0C3` (dim), `#6B7099` (faint)
- Glass: `rgba(14,18,40,.55)`, borda `rgba(120,140,255,.14–.28)`
- Discord: `#5865F2`
- Unifica/absorve a `LoginPalette` atual (tank/heal/dps já batem aproximadamente).

**Tipografia (fontes em `backend/src/assets/fonts` → copiar p/ `app/assets/fonts/`):**
- **Audiowide** → wordmark "HoloRaid" (gradiente linear dos 6 tons + outline branco sutil + outer glow multicolor, via `ShaderMask` + `shadows`/drop-shadow).
- **Orbitron** (Medium/SemiBold/Bold/Black) → títulos de seção, números, countdown.
- **Aldrich** → labels, eyebrows, botões (uppercase + letter-spacing).
- **Jura** (Regular/Medium/SemiBold) → texto corrido / descrições.

**Movimento (dentro do design_system: 150/200/250ms, easeOut/easeInOut):**
- Starfield leve (CustomPainter, ~100 estrelas) + glow ambiente radial.
- Fragment shader de fundo (gradiente/glow animado) em `assets/shaders/holo_bg.frag`, com **fallback** para gradiente estático.
- `flutter_animate`: stagger de entrada dos blocos (fadeIn+slideY), pulso no "ao vivo", hover/scale 0.97 nos tiles/CTA.
- **Dark-only deliberado.** "Reduzir animações" desliga starfield, shader e animações contínuas.

## Arquitetura

### 1. Fontes + tema global
- Copiar os 4 `.ttf` para `app/assets/fonts/` (Audiowide-Regular; Aldrich-Regular; Orbitron static Medium/SemiBold/Bold/Black; Jura static Regular/Medium/SemiBold). Declarar `fonts:` no `pubspec.yaml`.
- `core/ui/holo_theme.dart`: `ThemeData` dark (Material3) com `scaffoldBackgroundColor` transparente/deep, `colorScheme` derivado da paleta, `fontFamily: 'Jura'`, `textTheme` mapeando Orbitron/Aldrich onde faz sentido. Aplicado em `main.dart` (substitui o `colorSchemeSeed: Colors.indigo`).

### 2. Camada `core/ui` compartilhada (extração + generalização)
Mover de `features/login/widgets` e generalizar:
- `HoloPalette` (de `login_theme.dart`, expandida com os tons do JSON).
- `Starfield` (já existe; mover p/ `core/ui`).
- `GlassCard`/`GlassPanel` (já existe; mover p/ `core/ui`).
- `HoloWordmark` (novo): "HoloRaid" em Audiowide com `ShaderMask` (gradiente 6 tons) + glow; `size` parametrizável. Reusado no login e na Home.
- `HoloBackground` (novo): Stack de gradiente base + `Starfield` + shader (com fallback) + glow. Respeita "reduzir animações". Login e Home usam.
- `HoloEmblem` fica no login (ou move junto — decisão do plano).
- Atualizar imports do `login_screen.dart` para a nova camada (sem mudar o visual do login).

### 3. Fragment shader
- `assets/shaders/holo_bg.frag` (GLSL via `FragmentProgram`): gradiente/glow animado por `uTime` + resolução. Declarado em `pubspec` (`shaders:`). Carregado async; enquanto não carrega ou se indisponível/reduzir-animações → gradiente estático. Custo baixo, cross-platform (web/desktop/mobile).

### 4. Dados (endpoints existentes, zero backend novo)
- `meProvider` (`FutureProvider<Map<String,dynamic>>`) → `authService.loadMe()` (`GET /me`: username, role, avatar, discord_id). Avatar Discord: `https://cdn.discordapp.com/avatars/{discord_id}/{avatar}.png` com fallback (inicial).
- `myRaidsProvider` (`FutureProvider<List<MyRaid>>`) → novo model `MyRaid` + repo lendo `GET /me/raids` (campos: id, codigo, operation, difficulty, size, faction, `start_at`, status, created, my_status). Substitui o `List<dynamic>` cru que o Perfil usa hoje (Perfil pode migrar p/ o mesmo provider — opcional).
- **Próxima raid** = menor `start_at` no futuro com status `OPEN`/`RUNNING`. Contadores derivados da mesma lista (ativas, confirmações).
- `charactersProvider` (já existe) → contagem + split facção.

### 5. Home (`features/home/home_screen.dart` reescrita) — componentes isolados
- `HomeTopBar`: `HoloWordmark` + chip do usuário (avatar Discord + username + papel) + logout.
- `NextRaidHero`: card glass com faixa lateral gradiente; operation, código, chips (dificuldade/tamanho/facção), status do usuário, countdown ao vivo (Orbitron), barras de slots tank/heal/dps. **Empty-state** quando não há raid futura ("Nenhuma operation agendada" + CTA "Criar raid"/"Ver raids").
- `StatTiles`: 3 tiles (Raids ativas / Personagens / Confirmações) com sparkline decorativa e número em Orbitron.
- `NavGrid`: tiles Personagens, Raids, Dashboard, Perfil, Admin (Admin só se `role==admin`), com ícone colorido por papel, hover lift, seta.
- Envolvido por `HoloBackground`; entrada em stagger.

### 6. Estados (design_system: skeleton, nunca só spinner)
- Loading: **skeleton** do hero + tiles (shimmer sutil), não `CircularProgressIndicator`.
- Erro: mensagem inline discreta + retry, sem quebrar o layout.
- Empty (sem raids): empty-state do hero descrito acima.

## Responsividade (Android / iOS / web)

O app **buildará para Android e iOS** — a Home precisa ser mobile-first, sem overflow horizontal (a verificação do mockup HTML mostrou que layout com tamanhos fixos estoura em ~≤420px). Regra: **nada de largura fixa que exceda a tela**; tudo flui por constraints.

**Breakpoint único** via `LayoutBuilder` na Home: `compact = maxWidth < 720`.

Comportamento por bloco:
- **TopBar:** `compact` → wordmark menor (~26 vs ~34), chip do usuário mostra avatar + username truncado (`TextOverflow.ellipsis`, `Flexible`) e **oculta o papel**; logout permanece. Usar `Row` com `Expanded`/`Flexible` para o wordmark não empurrar o chip.
- **NextRaidHero:** wide → duas colunas (`Row` com `Expanded`); compact → **uma coluna** (`Column`): detalhes em cima, countdown/slots/CTA embaixo. Título da operation com `maxLines: 2` + `TextOverflow.ellipsis`. Chips num `Wrap` (nunca `Row` sem wrap). CTA `width: double.infinity` no compact.
- **StatTiles:** wide → 3 colunas; compact → coluna única empilhada (ou 1 por linha). Números em Orbitron com `FittedBox` se necessário. Sparkline pode ocultar no compact.
- **NavGrid:** `GridView`/`Wrap` responsivo — wide 5 col, tablet 3, phone **2 col** (`crossAxisCount` por breakpoint); largura mínima do tile respeitando `minmax(0,1fr)` equivalente (usar `Expanded`/`childAspectRatio`, nunca largura fixa).
- Tudo dentro de `SafeArea` + `SingleChildScrollView` (notch/gestos iOS/Android). Respeitar `MediaQuery.textScaler` (acessibilidade) sem quebrar — preferir `Flexible`/`FittedBox` a alturas fixas.

**Verificação obrigatória:** rodar/checar em tamanho de celular (≈390–430 de largura) **e** desktop, sem corte horizontal em nenhum bloco. Widget test cobre um viewport estreito.

## Testes
- Widget test `home_screen_test.dart` com `ProviderScope` overrides:
  - Com próxima raid → renderiza wordmark, operation, countdown, 3 tiles, 5 tiles de nav (Admin oculto p/ user).
  - Sem raid futura → empty-state visível.
  - **Viewport estreito** (ex.: 390×840) → renderiza sem exceção de overflow (o teste falha se houver `RenderFlex overflow`).
  - Drena timers de `flutter_animate`/starfield (`pump(2s)`), como nos testes existentes.
- `flutter analyze` limpo; `flutter test` verde.

## Riscos / decisões
- **Shader no web:** CanvasKit suporta `FragmentProgram`; se algum ambiente falhar, o fallback estático cobre. Sem Three.js/WebGL externo (decidido).
- **Peso das fontes:** 4 famílias; usar só os pesos necessários (estáticos) para não inchar o bundle.
- **Herança do tema:** ao trocar o tema global p/ dark, telas ainda não repaginadas podem ter pequenos ajustes de contraste — aceitável agora, redesign detalhado é follow-up.
