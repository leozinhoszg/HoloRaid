# HoloRaid — Landing de Login (Home bonita) — Design

- **Data:** 2026-07-18
- **Subsistema:** UI / primeira impressão (login/landing)
- **Depende de:** o app Flutter existente (`login_screen.dart`, tema Material 3), o fluxo de login (`authStateProvider.login()`).
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

O `login_screen.dart` atual é cru — só um `Text('HoloRaid')` + botão "Entrar com Discord". É a
**primeira tela que um visitante deslogado vê**, ou seja, a maior chance de encantar. Esta fatia
transforma essa tela numa **landing de login holográfica**, bonita e atrativa, em **inglês**
(o resto do app segue em PT por ora; o dono adiciona i18n no futuro).

**Avaliação do `design_system.md` (o dono pediu):** ele **não está alinhado com o app** — é uma
lista de desejos (só motion/efeitos: WebGL, Three.js, shaders, holograma, partículas,
glassmorphism) e **quase nada foi implementado**; além disso **falta a fundação** de um design
system (cores, tipografia, espaçamento, tokens). Esta landing honra o **espírito** dele
(holográfico, sci-fi, "console de comando", glow neon, animações discretas ≤400ms) em **Flutter
puro** (sem WebGL/Three.js — que o próprio doc diz ser opcional e "nunca em excesso") e vira a
**semente** da fundação visual que falta.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Tela | **Login/landing** (deslogado), não a home pós-login. |
| Forma | **Hero + 3 destaques** (não é site de marketing). |
| Tech | **Flutter puro**, sem WebGL/Three.js. Nova dep: `flutter_animate` (recomendada pelo próprio `design_system.md`). |
| Fundo | Gradiente espacial + campo de estrelas leve (`CustomPainter`, ≤100 partículas) + glow — **funciona sem imagem**; a imagem do hero é upgrade opcional. |
| Idioma | **Inglês** só nesta tela. |
| Assets | Hero (landscape+portrait) e emblema: **opcionais** com fallback gráfico. Glyphs de role: **bundled** (copiados dos PNGs existentes). Sem elementos de Star Wars com IP nos prompts. |

## Objetivos e critérios de sucesso

- A landing renderiza **linda mesmo sem nenhuma imagem** (gradiente + estrelas + glow em Flutter).
- Com os assets do hero/emblema presentes, fica ainda melhor (sem quebrar se ausentes).
- Entrada em cascata suave (≤400ms, easeOut) via `flutter_animate`.
- Responsiva (web/desktop/mobile).
- O botão continua chamando `authStateProvider.login()` (o fluxo OAuth não muda aqui).
- Copy em inglês; rodapé com Terms · Privacy + disclaimer de fã.
- `flutter analyze` limpo; os widget tests existentes seguem verdes.

## Fora de escopo

- Redesenhar a home pós-login ou outras telas (fatia futura).
- i18n / tradução (o dono faz depois).
- Consertar o fluxo OAuth (trabalho à parte, em andamento no deploy).
- WebGL/Three.js/shaders reais.
- Tornar a landing um site de marketing (seções extras, screenshots).

## Seção 1 — Fundação visual (semente do design system)

- **Fundo:** gradiente radial/linear `#070810 → #0b0d1a → #1b1e3a`; camada de estrelas
  (`CustomPainter`, pontos com opacidades variadas + leve twinkle/deriva); glows suaves nos
  cantos.
- **Paleta:** primária **índigo/violeta** (`#6C7BFF`/`#8EA2FF` sobre near-black); **tríade neon
  de acento** — índigo (tank `#7C6CFF`), verde-limão (heal `#B6FF7A`), laranja (dps `#FF8A3D`).
- **Superfícies:** glassmorphism (fundo translúcido `#14172B` @ ~70% + `BackdropFilter` blur +
  borda `#2A2E52` com glow).
- **Tipografia:** wordmark grande com glow (text-shadow); corpo `bodyMedium`/`titleMedium` do
  tema. Constantes de cor/spacing centralizadas num `login_theme.dart` (semente reutilizável).

## Seção 2 — Layout & componentes (responsivo)

`Stack` full-bleed: [fundo espacial] → [estrelas `CustomPaint`] → [hero image opcional] →
[conteúdo centralizado]. Conteúdo numa coluna com `ConstrainedBox(maxWidth: 520)` (full no
mobile), com `SingleChildScrollView` para telas baixas:
- **Emblema** (asset 1:1 opcional; fallback = "H" holográfico desenhado com glow) — glow
  pulsante discreto.
- **Wordmark "HoloRaid"** — grande, glowing.
- **Tagline:** "Command your SWTOR Operations."
- **Sub-linha:** "Organize raids, sync with Discord, and track your PvE progression — in real
  time."
- **CTA:** "Continue with Discord" — botão glassmorphic com glow (accent blurple `#5865F2` +
  índigo), micro-interação scale 0.97 (mantém a existente); estados loading/erro preservados.
- **3 destaques** (`Wrap`/`Row` responsivo): cada um um card glass com um **glyph neon de role**
  + label: **Organize raids** · **Sync with Discord** · **Track PvE progression**.
- **Rodapé:** links `Terms` (`/terms`) · `Privacy` (`/privacy`) + texto pequeno
  "Not affiliated with BioWare or EA.".

## Seção 3 — Motion (fiel ao doc: ≤400ms, easeOut)

Entrada em cascata (fade + slide-up, stagger ~80ms) via `flutter_animate`: emblema → wordmark →
tagline → sub-linha → CTA → destaques. Glow pulsante lento no emblema (`.animate(onPlay: repeat)`
com `ScaleEffect`/`ShimmerEffect` sutil). Curvas `easeOut`/`easeOutCubic`; nenhuma animação
> 400ms. **Fallback "reduzir animações":** um `bool reduceMotion` (por ora `false`, com TODO de
ligar a uma futura pref de acessibilidade) que, se `true`, corta partículas e stagger.

## Seção 4 — Assets & prompts (≈1024 caracteres, com proporção)

A tela é linda **sem imagem**; os assets abaixo são **upgrades opcionais** (fallback gráfico se
ausentes). Prompts sem IP de Star Wars (espaço-ópera genérico).

**A — Hero background, paisagem (16:9, 1920×1080)** → `app/assets/hero_bg.png`:
```
Cinematic deep-space nebula backdrop for a sci-fi holographic app login screen, ultra-wide 16:9, 1920x1080. A vast dark void in near-black navy fading to deep indigo, filled with a slow swirling nebula of electric indigo and blue-violet, accented by faint neon lime-green and warm orange energy wisps in the distance. Scattered tiny stars and soft bokeh light particles, subtle volumetric glow, gentle chromatic shimmer like a hologram projection. A faint futuristic hexagonal grid and thin glowing scan-lines drift across the lower third, barely visible. Center-dark composition with negative space in the middle so overlaid UI text stays readable; brightest glow toward the edges and corners. No text, no letters, no logos, no characters, no spaceships, no planets. Premium, moody, esports command-console vibe, crisp, high dynamic range, 4k detail.
```

**B — Hero background, retrato mobile (9:16, 1080×1920)** → `app/assets/hero_bg_portrait.png`:
```
Vertical 9:16 sci-fi nebula backdrop for a mobile app login, 1080x1920, portrait. Deep near-black navy-to-indigo void with a slow swirling nebula of electric indigo and blue-violet, faint neon lime-green and orange energy wisps far away, scattered fine stars and soft light-particle bokeh. Subtle holographic shimmer and volumetric glow. A barely-visible futuristic hexagonal grid and thin glowing scan-lines near the bottom. Keep the vertical center darker and calm as negative space for overlaid title and button; concentrate the brighter glow toward the top and bottom edges. Cohesive with a landscape variant of the same scene. No text, no letters, no logos, no characters, no ships, no planets. Premium, cinematic, moody command-console aesthetic, crisp, HDR, 4k detail.
```

**C — Emblema/logo (1:1, 1024×1024, fundo transparente/near-black)** → `app/assets/emblem.png`:
```
App emblem for a sci-fi raid organizer named HoloRaid, square 1:1, 1024x1024, on a transparent or near-black background. A glowing holographic badge: a bold minimalist shield outline fused with a subtle raid-role triad — a targeting crosshair and a stacked heal glyph — around a bright glowing core. Clean thin neon strokes with intense glow and soft bloom, faint holographic scan-lines and light chromatic aberration, as if projected as a hologram. Color palette: electric indigo and blue-violet as the base, with small accents of neon lime-green and warm orange. High contrast, crisp vector-like edges, readable at small sizes. No text, no letters, no wordmark, no characters. Premium guild/esports emblem feel, centered, symmetrical, glowing on dark.
```

**Bundled (não precisam de prompt):** os 3 glyphs neon de role já existem como PNG — copiar para
`app/assets/role_tank.png`, `role_heal.png`, `role_dps.png` (fonte: os `tankicon/HealIcon/DPSIcon`
existentes; extrair da branch onde estão).

## Seção 5 — Copy (inglês)

| Elemento | Texto |
|----------|-------|
| Wordmark | HoloRaid |
| Tagline | Command your SWTOR Operations. |
| Sub-linha | Organize raids, sync with Discord, and track your PvE progression — in real time. |
| CTA | Continue with Discord |
| Destaque 1 | Organize raids |
| Destaque 2 | Sync with Discord |
| Destaque 3 | Track PvE progression |
| Rodapé | Terms · Privacy · "Not affiliated with BioWare or EA." |
| Loading | Connecting… |
| Erro | "Login failed. Try again." |

## Seção 6 — Arquitetura de implementação

- **Dep nova:** `flutter_animate` (via `flutter pub add`).
- **Assets:** bloco `assets:` novo no `pubspec.yaml` (`assets/`), com os arquivos acima.
- **Arquivos:**
  - `login_screen.dart` — reescrito (mantém `_login()`, loading, erro; layout novo).
  - `features/login/widgets/starfield.dart` — `CustomPainter` das estrelas (determinístico via
    seed fixa; sem `Random()` por frame — usar lista pré-gerada).
  - `features/login/widgets/glass_card.dart` — card glass reutilizável (destaques).
  - `features/login/login_theme.dart` — constantes de cor/spacing/glow (a semente).
  - `features/login/widgets/holo_emblem.dart` — emblema com fallback desenhado.
- **Responsividade:** `LayoutBuilder` — coluna centralizada; destaques em `Row` no wide,
  `Column`/`Wrap` no estreito; escolhe `hero_bg` vs `hero_bg_portrait` por orientação.
- **Fallback de asset:** helper que tenta `Image.asset(..., errorBuilder: → SizedBox.shrink())`
  para não quebrar se o arquivo não existir.

## Seção 7 — Verificação

- `flutter analyze` limpo.
- `flutter test` — os 10 testes existentes seguem verdes (não tocamos raid form/detail).
- **Screenshot headless** (padrão desta sessão): `flutter build web` → servir `build/web` →
  `chrome --headless --screenshot` da landing → **olhar** e conferir que ficou bonita e sem
  overflow, com e sem os assets de hero.
- Backend intacto (zero backend).

## Riscos e questões em aberto

- **`flutter_web_auth_2` usa `dart:html`** (visto no wasm dry-run) — mantemos o build JS
  (não-wasm), então ok; nada muda aqui.
- **Estrelas por frame:** usar lista pré-gerada (seed fixa), não `Random()` a cada `paint`,
  para não "piscar" e manter 60fps.
- **Assets ausentes no primeiro run:** por isso o design é lindo sem eles; o dono gera pelo
  Firefly/nano banana e só solta os arquivos em `app/assets/`.
- **Copy EN numa app PT:** intencional (o dono pediu login em inglês primeiro); leve
  inconsistência aceita até o i18n.

## Próximo passo

Transicionar para `writing-plans` (fundação/tema → starfield + glass + emblema → login_screen
reescrito → assets/pubspec → verificação com screenshot).

---

## Apêndice — Contratos (referência)

```dart
// login_theme.dart: cores (bgTop/bgMid/bgBottom, indigo, tank/heal/dps neon), glow, spacing.
// starfield.dart: class Starfield extends CustomPainter (lista pré-gerada de estrelas).
// glass_card.dart: GlassCard({ child }) — BackdropFilter + borda glow.
// holo_emblem.dart: HoloEmblem({ double size }) — asset com fallback desenhado + glow pulsante.
// login_screen.dart: mantém authStateProvider.login(); layout responsivo novo, copy EN.
// pubspec: + flutter_animate; + assets: [assets/].
```
