# Bandeiras no seletor de idioma (web + app)

**Data:** 2026-07-20
**Branch:** feat/flags-language-selector

## Problema

O seletor de idioma usa um ícone de globo genérico para todos os idiomas — nas
páginas legais (`app/web/terms|privacy/index.html`) e no `GlassLanguageSelector`
do app (login). Além disso, a tela de Perfil usa um `DropdownButton` Material
simples (`LanguageSelector`) que destoa do visual glass do login.

## Objetivo

Cada idioma exibe sua **bandeira** (retangular, cantos arredondados, borda sutil)
no seletor — na web e no app. O seletor do Perfil passa a usar a mesma pílula
glass do login (agora com bandeira), substituindo o dropdown antigo.

Mapeamento fixo (pelos arquivos fornecidos): `en→us` · `pt→br` · `de→de` ·
`fr→fr` · `es→es`.

## Escopo

As bandeiras existem em `backend/src/assets/flags/{us,br,de,fr,es}.png` (PNG flat
~512px, proporção 3:2, fundo transparente). O backend **não serve estáticos** e
nada as referencia lá, então precisam ir para onde são consumidas.

### 1. Realocação dos assets

São dois bundles distintos (app Flutter e site estático) → duas cópias:

- `app/assets/flags/*.png` — declarada no `pubspec.yaml` (`- assets/flags/`),
  consumida via `Image.asset`.
- `app/web/flags/*.png` — arquivos estáticos servidos junto do build web
  (`/flags/us.png`), referenciados pelas páginas legais por caminho relativo
  (`../flags/us.png`, pois as páginas ficam em `/terms/` e `/privacy/`).
- Remover `backend/src/assets/flags/` (não é usada lá).

### 2. Web — `app/web/terms/index.html` e `app/web/privacy/index.html`

As duas páginas têm o seletor idêntico; ambas recebem a mesma mudança.

- **CSS**: nova classe `.flag` — `width:21px; height:15px; border-radius:3px;
  object-fit:cover;` borda `1px solid rgba(255,255,255,.14)` e sombra leve
  (`box-shadow: 0 1px 2px rgba(0,0,0,.35)`); `flex:none`. Remover as regras
  `.lang-opt .i-globe` / `.lang-opt[aria-selected] .i-globe`.
- **Botão** (`.lang-btn`): substituir o `<svg>` globo por
  `<img class="flag" id="langFlag" src="../flags/us.png" alt="">` (o `src` inicial
  evita flash; o JS o ajusta em `apply`, tal como já faz com o `#langLabel` que vem
  com "English"), mantendo label + seta.
- **Itens** (`.lang-opt`): cada opção vira `[bandeira] Nome … [✓]`. A bandeira
  (`<img class="flag">`) fica sempre visível à esquerda; o SVG de check migra
  para a direita via `.i-check { margin-left:auto; display:none }` e
  `.lang-opt[aria-selected="true"] .i-check { display:inline }`. Remover os
  `<svg class="i-globe">`.
- **JS**: adicionar `var FLAG = { en:'us', pt:'br', de:'de', fr:'fr', es:'es' };`
  e, em `apply(lang)`, atualizar `document.getElementById('langFlag').src =
  '../flags/' + FLAG[lang] + '.png'` (a lista de opções já tem a `src` fixa por
  idioma no HTML). Restante da lógica (abertura, teclado, persistência) inalterado.

### 3. App — `app/lib/core/settings/language_selector.dart`

- Adicionar `const Map<String,String> kLanguageFlags = { 'en':'us', 'pt':'br',
  'de':'de', 'fr':'fr', 'es':'es' }`.
- Helper `_flagBox(String code, {double w = 22})`: `Image.asset(
  'assets/flags/${kLanguageFlags[code] ?? 'us'}.png', width:w, height:w*15/22,
  fit:BoxFit.cover, cacheWidth:64, errorBuilder:…)` dentro de um `Container` com
  `borderRadius:3` + borda fina (`Colors.white24`) e `clipBehavior:antiAlias`.
  O `errorBuilder` devolve um `SizedBox` do mesmo tamanho (placeholder se o asset
  faltar / em testes sem bundle).
- **`GlassLanguageSelector` — botão**: trocar `Icon(Icons.language, …)` (o da
  pílula) pela bandeira do idioma ativo. Manter a seta `arrow_drop_down`.
- **`GlassLanguageSelector` — itens do `PopupMenuButton`**: cada item vira
  `Row([ _flagBox(e.key), SizedBox(width:10), Text(nome), if (selected) …check à
  direita ])`. O check (`Icon(Icons.check, color: blue)`) fica à direita; o
  realce por cor/negrito do texto selecionado é mantido. Como o `PopupMenuItem`
  encolhe ao conteúdo, o item usa largura fixa (`SizedBox(width: 168)`) para o
  check alinhar à direita de forma consistente.

### 4. App — `app/lib/features/profile/profile_screen.dart`

- Substituir `LanguageSelector()` por `Align(alignment: Alignment.centerLeft,
  child: GlassLanguageSelector())` (a pílula glass sozinha, como no login, sem
  esticar na largura do `ListView`). O import de `language_selector.dart` já existe.

### 5. Limpeza + teste

- Remover a classe `LanguageSelector` (dropdown Material) — órfã após o Perfil
  migrar para o glass. Manter `kLanguageNames`.
- Atualizar `app/test/language_selector_test.dart`: exercitar `GlassLanguageSelector`
  (pump → tap no widget → `pumpAndSettle` → esperar os 5 nomes nativos no menu).
  O `errorBuilder` das bandeiras evita ruído por assets ausentes no ambiente de teste.

## Verificação

- `flutter analyze` sem novos avisos.
- `flutter test test/language_selector_test.dart` (menu abre e lista os 5 idiomas).
- Build web local (ver `z_run.md`) e conferir visualmente as bandeiras no seletor
  das páginas `/terms/index.html` e `/privacy/index.html`, e a troca do idioma
  atualizando a bandeira do botão.

## Fora de escopo

- Otimizar/reduzir a resolução das PNGs (usa-se `cacheWidth` no app; a web serve
  os arquivos como estão). Pode virar tarefa futura se o peso incomodar.
- Trocar `en→us` por outra bandeira (ex.: Reino Unido) — mantém-se o arquivo
  fornecido (`us.png`).
- Qualquer mudança de contrato/endpoint ou de lógica de i18n (chaves de tradução).
