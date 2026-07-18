import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/ui/glass_card.dart';
import '../../core/ui/starfield.dart';
import 'login_theme.dart';
import 'widgets/holo_emblem.dart';

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
              Image.asset(hero, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox.shrink()),
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
                      child: _content(context, portrait),
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

  Widget _content(BuildContext context, bool compact) {
    int i = 0;
    Widget stagger(Widget w) {
      final d = (i++ * 80).ms;
      return w.animate().fadeIn(delay: d, duration: 300.ms, curve: Curves.easeOut)
          .slideY(begin: 0.14, end: 0, delay: d, duration: 300.ms, curve: Curves.easeOutCubic);
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        stagger(HoloEmblem(size: compact ? 92 : 116)),
        SizedBox(height: compact ? 14 : 20),
        stagger(Text(
          'HoloRaid',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: compact ? 38 : 44, fontWeight: FontWeight.w800, letterSpacing: 1.5, color: Colors.white,
            shadows: const [Shadow(color: Color.fromRGBO(140, 150, 255, 0.7), blurRadius: 24)],
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
        SizedBox(height: compact ? 22 : 28),
        stagger(_cta(context)),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: const TextStyle(color: Color(0xFFFF8A8A), fontSize: 13)),
        ],
        SizedBox(height: compact ? 22 : 32),
        stagger(_highlights(context)),
        SizedBox(height: compact ? 20 : 28),
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
    final items = <(Color, IconData, String)>[
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
    const link = TextStyle(color: LoginPalette.indigo, fontSize: 12, decoration: TextDecoration.underline);
    return Column(children: [
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        GestureDetector(onTap: () => context.push('/terms'), child: const Text('Terms', style: link)),
        const Text('  ·  ', style: TextStyle(color: LoginPalette.textDim, fontSize: 12)),
        GestureDetector(onTap: () => context.push('/privacy'), child: const Text('Privacy', style: link)),
      ]),
      const SizedBox(height: 8),
      const Text('Not affiliated with BioWare or EA.',
          style: TextStyle(color: LoginPalette.textDim, fontSize: 11)),
    ]);
  }
}
