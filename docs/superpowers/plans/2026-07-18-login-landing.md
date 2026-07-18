# Landing de Login holográfica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o `login_screen.dart` numa landing holográfica bonita (hero espacial + wordmark + tagline + CTA + 3 destaques), em inglês, linda mesmo sem imagem e melhor com os assets do dono.

**Architecture:** Flutter puro (sem WebGL). `Stack` full-bleed: gradiente espacial → starfield (`CustomPainter`) → hero image (opcional, por orientação) → scrim → conteúdo com entrada em cascata (`flutter_animate`). Widgets de apoio isolados + um `login_theme` que vira a semente da fundação visual.

**Tech Stack:** Flutter (Riverpod, go_router, **flutter_animate** [dep nova]). Zero backend.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-18-login-landing-design.md`.
- **Só a landing de login** muda; nenhuma outra tela, zero backend.
- **Copy em INGLÊS** (tagline "Command your SWTOR Operations.", CTA "Continue with Discord", etc.). O botão continua chamando `authStateProvider.login()` — o fluxo OAuth não muda.
- **Linda sem imagem:** gradiente + starfield + glow são o fallback; hero/emblema entram se presentes (`errorBuilder` → sem quebra).
- **Assets pesados:** reduzir os heroes (17 MB → ~1920/1080px JPG) via PowerShell; sem ImageMagick.
- **Cores neon (acento):** tank `#7C6CFF`, heal `#B6FF7A`, dps `#FF8A3D`; primária índigo `#8EA2FF`/`#6C7BFF`; fundo `#070810→#0B0D1A→#1B1E3A`.
- **Motion:** entrada em cascata fade+slide, durações ≤300ms, `easeOut`; **sem animação infinita** (glow do emblema é estático via BoxShadow — evita jank e hang de teste).
- **Sem cor com `.withOpacity`** (deprecada) — usar `Color.fromRGBO(...)` para alfa.
- **Verificação:** `flutter analyze` limpo; `flutter test` (os 10 existentes + 1 novo) verdes; **screenshot headless** para olhar o resultado.
- **Commits:** autor `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>`. **NUNCA** `Co-Authored-By: Claude`.
- Flutter em `app/`. Comandos Flutter **pelo PowerShell** (git-bash mangla path — ver memória); testes `cd app && flutter test`.

---

### Task 1: Dependência + assets (reduzir + declarar)

**Files:**
- Modify: `app/pubspec.yaml` (dep `flutter_animate` + bloco `assets:`)
- Create: `app/assets/hero_bg.jpg`, `app/assets/hero_bg_portrait.jpg`, `app/assets/emblem.png`

**Interfaces:**
- Produces: os 3 assets em `app/assets/` (nomes limpos) e a dep `flutter_animate`.

- [ ] **Step 1: Adicionar flutter_animate**

Run (PowerShell): `cd D:\HoloRaid\app; flutter pub add flutter_animate`
Expected: `pubspec.yaml` ganha `flutter_animate: ^4.x`; `pub get` ok.

- [ ] **Step 2: Reduzir e converter os 3 assets (PowerShell + System.Drawing)**

Os originais estão em `backend/src/assets/brand/` (com espaços no nome). Reduza para `app/assets/`:

Run (PowerShell):
```powershell
Add-Type -AssemblyName System.Drawing
$dst = "D:\HoloRaid\app\assets"; New-Item -ItemType Directory -Force -Path $dst | Out-Null
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
function Resize($in, $out, $maxW, $maxH, [bool]$jpeg) {
  $src = [System.Drawing.Image]::FromFile($in)
  $ratio = [Math]::Min([Math]::Min($maxW / $src.Width, $maxH / $src.Height), 1.0)
  $tw = [int]($src.Width * $ratio); $th = [int]($src.Height * $ratio)
  $bmp = New-Object System.Drawing.Bitmap $tw, $th
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($src, 0, 0, $tw, $th)
  if ($jpeg) {
    $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]85)
    $bmp.Save($out, $jpegCodec, $ep)
  } else { $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png) }
  $g.Dispose(); $bmp.Dispose(); $src.Dispose()
  Write-Output ("{0}: {1}x{2}, {3:N0} bytes" -f (Split-Path $out -Leaf), $tw, $th, (Get-Item $out).Length)
}
Resize "D:\HoloRaid\backend\src\assets\brand\hero landscape.png" "$dst\hero_bg.jpg" 1920 1080 $true
Resize "D:\HoloRaid\backend\src\assets\brand\hero portrait.png" "$dst\hero_bg_portrait.jpg" 1080 1920 $true
Resize "D:\HoloRaid\backend\src\assets\brand\holo_logo.png" "$dst\emblem.png" 640 640 $false
```
Expected: 3 linhas de saída; `hero_bg.jpg` ~1920×1071 (~200–450 KB), `hero_bg_portrait.jpg` ~1071×1920, `emblem.png` 640×640 (~200–400 KB). **Se algum ficar > 1,5 MB, reduza a qualidade JPEG para 80 e re-rode.**

- [ ] **Step 3: Declarar os assets no pubspec**

Em `app/pubspec.yaml`, no bloco `flutter:`, troque a linha comentada `# assets:` (ou adicione) por:
```yaml
  assets:
    - assets/
```

- [ ] **Step 4: pub get + analyze**

Run (PowerShell): `cd D:\HoloRaid\app; flutter pub get; flutter analyze`
Expected: `No issues found!`.

- [ ] **Step 5: Commit**

```bash
git add app/pubspec.yaml app/pubspec.lock app/assets/hero_bg.jpg app/assets/hero_bg_portrait.jpg app/assets/emblem.png
git commit -m "assets(app): brand hero+emblem (reduzidos) e dep flutter_animate"
```

---

### Task 2: Fundação (tema) + widgets de apoio

**Files:**
- Create: `app/lib/features/login/login_theme.dart`
- Create: `app/lib/features/login/widgets/starfield.dart`
- Create: `app/lib/features/login/widgets/glass_card.dart`
- Create: `app/lib/features/login/widgets/holo_emblem.dart`

**Interfaces:**
- Produces:
  - `LoginPalette` (cores estáticas).
  - `Starfield({int starCount})` — `CustomPaint` de estrelas determinístico (seed fixa).
  - `GlassCard({Widget child, EdgeInsets padding})`.
  - `HoloEmblem({double size})` — `assets/emblem.png` com fallback desenhado + glow estático.

- [ ] **Step 1: login_theme.dart**

```dart
import 'package:flutter/material.dart';

class LoginPalette {
  static const bgTop = Color(0xFF070810);
  static const bgMid = Color(0xFF0B0D1A);
  static const bgBottom = Color(0xFF1B1E3A);
  static const indigo = Color(0xFF8EA2FF);
  static const indigoDeep = Color(0xFF6C7BFF);
  static const tank = Color(0xFF7C6CFF);
  static const heal = Color(0xFFB6FF7A);
  static const dps = Color(0xFFFF8A3D);
  static const glassFill = Color(0xB314172B); // ~70% opaco
  static const glassBorder = Color(0xFF2A2E52);
  static const discord = Color(0xFF5865F2);
  static const textDim = Color(0xFF9AA0C3);
}
```
> Para alfa, os widgets usam `Color.fromRGBO(r, g, b, a)` com literais (evita a deprecação de `.withOpacity`).

- [ ] **Step 2: starfield.dart**

```dart
import 'dart:math';
import 'package:flutter/material.dart';

class Starfield extends StatelessWidget {
  const Starfield({super.key, this.starCount = 90});
  final int starCount;
  @override
  Widget build(BuildContext context) =>
      CustomPaint(painter: _StarPainter(starCount), size: Size.infinite);
}

class _Star {
  const _Star(this.x, this.y, this.r, this.o);
  final double x, y, r, o;
}

class _StarPainter extends CustomPainter {
  _StarPainter(int count) : _stars = _gen(count);
  final List<_Star> _stars;

  static List<_Star> _gen(int count) {
    final rnd = Random(42); // seed fixa -> determinístico, sem piscar
    return List.generate(count, (_) => _Star(
          rnd.nextDouble(), rnd.nextDouble(),
          rnd.nextDouble() * 1.4 + 0.3, rnd.nextDouble() * 0.6 + 0.15,
        ));
  }

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint();
    for (final s in _stars) {
      p.color = Color.fromRGBO(255, 255, 255, s.o);
      canvas.drawCircle(Offset(s.x * size.width, s.y * size.height), s.r, p);
    }
  }

  @override
  bool shouldRepaint(covariant _StarPainter oldDelegate) => false;
}
```

- [ ] **Step 3: glass_card.dart**

```dart
import 'dart:ui';
import 'package:flutter/material.dart';
import '../login_theme.dart';

class GlassCard extends StatelessWidget {
  const GlassCard({super.key, required this.child, this.padding = const EdgeInsets.all(16)});
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: LoginPalette.glassFill,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: LoginPalette.glassBorder),
          ),
          child: child,
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: holo_emblem.dart**

```dart
import 'package:flutter/material.dart';
import '../login_theme.dart';

class HoloEmblem extends StatelessWidget {
  const HoloEmblem({super.key, this.size = 112});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        boxShadow: [BoxShadow(color: Color.fromRGBO(140, 150, 255, 0.35), blurRadius: 48, spreadRadius: 4)],
      ),
      child: Image.asset(
        'assets/emblem.png',
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => _fallback(),
      ),
    );
  }

  Widget _fallback() => Container(
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [LoginPalette.indigoDeep, Color(0x00000000)]),
        ),
        alignment: Alignment.center,
        child: Text('H', style: TextStyle(fontSize: size * 0.5, fontWeight: FontWeight.w800, color: Colors.white)),
      );
}
```

- [ ] **Step 5: Analyze + commit**

Run (PowerShell): `cd D:\HoloRaid\app; flutter analyze`
Expected: `No issues found!` (se o helper `alpha` do tema reclamar, remova-o).

```bash
git add app/lib/features/login/login_theme.dart app/lib/features/login/widgets/starfield.dart app/lib/features/login/widgets/glass_card.dart app/lib/features/login/widgets/holo_emblem.dart
git commit -m "feat(app): tema + widgets da landing (starfield, glass, emblema)"
```

---

### Task 3: Reescrever a `login_screen.dart`

**Files:**
- Modify (substituir inteiro): `app/lib/features/login/login_screen.dart`

**Interfaces:**
- Consumes: `LoginPalette`, `Starfield`, `GlassCard`, `HoloEmblem` (Task 2); `authStateProvider` (existente); `go_router` (rodapé Terms/Privacy).
- Produces: a landing.

- [ ] **Step 1: Substituir o arquivo inteiro**

Substitua **todo** `app/lib/features/login/login_screen.dart` por:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_providers.dart';
import 'login_theme.dart';
import 'widgets/glass_card.dart';
import 'widgets/holo_emblem.dart';
import 'widgets/starfield.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _loading = false;
  bool _pressed = false;
  String? _error;

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authStateProvider.notifier).login();
    } catch (_) {
      if (mounted) setState(() => _error = 'Login failed. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: LoginPalette.bgMid,
      body: LayoutBuilder(
        builder: (context, c) {
          final portrait = c.maxHeight >= c.maxWidth;
          final hero = portrait ? 'assets/hero_bg_portrait.jpg' : 'assets/hero_bg.jpg';
          return Stack(
            fit: StackFit.expand,
            children: [
              // base gradiente (fallback quando não há hero)
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter, end: Alignment.bottomCenter,
                    colors: [LoginPalette.bgTop, LoginPalette.bgMid, LoginPalette.bgBottom],
                  ),
                ),
              ),
              // estrelas (aparecem quando não há hero; ficam atrás dele quando há)
              const Starfield(),
              // hero (some sem quebra se ausente)
              Image.asset(hero, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox.shrink()),
              // scrim radial escuro para legibilidade do texto
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment.center, radius: 0.95,
                    colors: [Color.fromRGBO(7, 8, 16, 0.72), Color.fromRGBO(7, 8, 16, 0.0)],
                  ),
                ),
              ),
              SafeArea(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 520),
                      child: _content(context),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _content(BuildContext context) {
    int i = 0;
    Widget stagger(Widget w) {
      final d = (i++ * 80).ms;
      return w.animate().fadeIn(delay: d, duration: 300.ms, curve: Curves.easeOut)
          .slideY(begin: 0.14, end: 0, delay: d, duration: 300.ms, curve: Curves.easeOutCubic);
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        stagger(const HoloEmblem(size: 116)),
        const SizedBox(height: 20),
        stagger(const Text(
          'HoloRaid',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 44, fontWeight: FontWeight.w800, letterSpacing: 1.5, color: Colors.white,
            shadows: [Shadow(color: Color.fromRGBO(140, 150, 255, 0.7), blurRadius: 24)],
          ),
        )),
        const SizedBox(height: 10),
        stagger(const Text(
          'Command your SWTOR Operations.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Color(0xFFE7E9F5)),
        )),
        const SizedBox(height: 8),
        stagger(const Text(
          'Organize raids, sync with Discord, and track your PvE progression — in real time.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 14, height: 1.5, color: LoginPalette.textDim),
        )),
        const SizedBox(height: 28),
        stagger(_cta(context)),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: const TextStyle(color: Color(0xFFFF8A8A), fontSize: 13)),
        ],
        const SizedBox(height: 32),
        stagger(_highlights(context)),
        const SizedBox(height: 28),
        stagger(_footer(context)),
      ],
    );
  }

  Widget _cta(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: const Duration(milliseconds: 150),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            boxShadow: const [BoxShadow(color: Color.fromRGBO(88, 101, 242, 0.5), blurRadius: 28, spreadRadius: 1)],
          ),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: LoginPalette.discord,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 18),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
              textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            onPressed: _loading ? null : _login,
            icon: _loading
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.discord),
            label: Text(_loading ? 'Connecting…' : 'Continue with Discord'),
          ),
        ),
      ),
    );
  }

  Widget _highlights(BuildContext context) {
    final items = [
      (LoginPalette.tank, Icons.event_available, 'Organize raids'),
      (LoginPalette.indigo, Icons.forum, 'Sync with Discord'),
      (LoginPalette.dps, Icons.military_tech, 'Track PvE progression'),
    ];
    return Wrap(
      spacing: 12, runSpacing: 12, alignment: WrapAlignment.center,
      children: items.map((it) => SizedBox(
        width: 150,
        child: GlassCard(
          child: Column(children: [
            Icon(it.$2, color: it.$1, size: 26),
            const SizedBox(height: 8),
            Text(it.$3, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: Color(0xFFCDD2EE))),
          ]),
        ),
      )).toList(),
    );
  }

  Widget _footer(BuildContext context) {
    final link = TextStyle(color: LoginPalette.indigo, fontSize: 12, decoration: TextDecoration.underline);
    return Column(children: [
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        GestureDetector(onTap: () => context.push('/terms'), child: Text('Terms', style: link)),
        const Text('  ·  ', style: TextStyle(color: LoginPalette.textDim, fontSize: 12)),
        GestureDetector(onTap: () => context.push('/privacy'), child: Text('Privacy', style: link)),
      ]),
      const SizedBox(height: 8),
      const Text('Not affiliated with BioWare or EA.',
          style: TextStyle(color: LoginPalette.textDim, fontSize: 11)),
    ]);
  }
}
```

> `Icons.discord` existe no Material Icons do Flutter. Se o analyzer não o reconhecer, troque por `Icons.login`.

- [ ] **Step 2: Analyze**

Run (PowerShell): `cd D:\HoloRaid\app; flutter analyze`
Expected: `No issues found!`.

- [ ] **Step 3: Commit**

```bash
git add app/lib/features/login/login_screen.dart
git commit -m "feat(app): landing de login holografica (hero + wordmark + CTA + destaques)"
```

---

### Task 4: Widget test (copy + estrutura) + suíte

**Files:**
- Create: `app/test/features/login/login_screen_test.dart`

**Interfaces:**
- Consumes: `LoginScreen`.

- [ ] **Step 1: Escrever o teste (render + copy EN)**

Crie `app/test/features/login/login_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/features/login/login_screen.dart';

void main() {
  testWidgets('landing renderiza wordmark, tagline, CTA e destaques em ingles', (tester) async {
    tester.view.physicalSize = const Size(1200, 2200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final router = GoRouter(routes: [
      GoRoute(path: '/', builder: (_, _) => const LoginScreen()),
    ]);
    await tester.pumpWidget(ProviderScope(child: MaterialApp.router(routerConfig: router)));
    await tester.pump(); // um frame (NÃO pumpAndSettle — animações de entrada)

    expect(find.text('HoloRaid'), findsOneWidget);
    expect(find.text('Command your SWTOR Operations.'), findsOneWidget);
    expect(find.text('Continue with Discord'), findsOneWidget);
    expect(find.text('Organize raids'), findsOneWidget);
    expect(find.text('Sync with Discord'), findsOneWidget);
    expect(find.text('Track PvE progression'), findsOneWidget);
    expect(find.text('Terms'), findsOneWidget);
    expect(find.text('Privacy'), findsOneWidget);
  });
}
```

> **Não usar `pumpAndSettle`** — as entradas do `flutter_animate` fazem o `pumpAndSettle` esperar; um `pump()` basta (os `Text` já existem na árvore, mesmo mid-fade).

- [ ] **Step 2: Rodar**

Run (PowerShell): `cd D:\HoloRaid\app; flutter test test/features/login/login_screen_test.dart`
Expected: **1 test passed**. Se `find.text('HoloRaid')` achar 2 (wordmark + algo), ajuste para `findsWidgets`. Se um destaque não for encontrado por overflow, o viewport alto (2200) já cobre.

- [ ] **Step 3: Suíte completa + analyze**

Run (PowerShell): `cd D:\HoloRaid\app; flutter test; flutter analyze`
Expected: **All tests passed!** (10 anteriores + 1 novo = 11) e `No issues found!`.

- [ ] **Step 4: Commit**

```bash
git add app/test/features/login/login_screen_test.dart
git commit -m "test(app): widget test da landing de login (copy EN + estrutura)"
```

---

### Task 5: Verificação visual (screenshot headless)

**Files:** nenhum (verificação).

> **Rodar Flutter web pelo PowerShell** (git-bash mangla o path do web SDK — ver memória). O padrão de screenshot desta sessão está em `holoraid-run-gotchas`.

- [ ] **Step 1: Build web**

Run (PowerShell): `cd D:\HoloRaid\app; flutter build web --dart-define=API_BASE_URL=http://localhost:3010`
Expected: `√ Built build\web`, exit 0.

- [ ] **Step 2: Servir + screenshot (landscape e um portrait)**

Reusa o `webserver.js` do scratchpad (ou recria: server node estático simples). Sirva `build/web` na 8899 e capture:

Run (PowerShell):
```powershell
$sp = "C:\Users\LGUIMA~1\AppData\Local\Temp\claude\d--HoloRaid\6d5ede3b-63eb-491c-8650-44fdb964fe69\scratchpad"
Start-Process -FilePath "node" -ArgumentList "$sp\webserver.js","D:\HoloRaid\app\build\web","8899" -WindowStyle Hidden
Start-Sleep -Seconds 2
$chrome = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
Start-Process -FilePath $chrome -ArgumentList @('--headless=new','--disable-gpu','--hide-scrollbars','--no-sandbox','--window-size=1366,900','--virtual-time-budget=15000',"--screenshot=$sp\landing_wide.png",'http://localhost:8899') -NoNewWindow -Wait
Start-Process -FilePath $chrome -ArgumentList @('--headless=new','--disable-gpu','--hide-scrollbars','--no-sandbox','--window-size=430,900','--virtual-time-budget=15000',"--screenshot=$sp\landing_tall.png",'http://localhost:8899') -NoNewWindow -Wait
Get-Item "$sp\landing_wide.png","$sp\landing_tall.png" | ForEach-Object { "$($_.Name): $($_.Length) bytes" }
```
> `virtual-time-budget=15000` dá tempo do Flutter bootar E das animações de entrada assentarem.

- [ ] **Step 3: OLHAR os screenshots**

Use o Read tool em `landing_wide.png` e `landing_tall.png`. **Confira de verdade:** o hero aparece? wordmark/tagline legíveis (scrim funcionando)? CTA e 3 destaques visíveis? emblema no topo? sem overflow/faixa preta? Se algo estiver feio (texto ilegível, hero cortado, overflow), **ajuste e re-rode** antes de seguir.

- [ ] **Step 4: Encerrar o server e commitar (se houve ajuste)**

Run (PowerShell): `taskkill /F /IM node.exe 2>$null; taskkill /F /IM chrome.exe 2>$null`
```bash
git add -A
git commit -m "chore(app): ajustes visuais da landing"
```

---

## Notas de execução

- **Branch:** `feat/login-landing` (já criada, a partir da master). Merge `--no-ff` na master ao final.
- **Ordem:** 1 → 2 → 3 → 4 → 5.
- **Tudo Flutter pelo PowerShell** (não a ferramenta Bash) — path mangling. Ver [[holoraid-run-gotchas]].
- **Zero backend.** Não tocar no fluxo OAuth (em andamento no deploy).
- **Assets originais** (17 MB cada) ficam untracked em `backend/src/assets/brand/`; só os reduzidos entram no repo (`app/assets/`).
