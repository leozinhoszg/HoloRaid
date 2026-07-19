import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../settings/settings_providers.dart';

/// Emblema HoloRaid: os 3 símbolos de papel (Tank/Heal/DPS) com um anel externo
/// animado — o gradiente holo gira ao redor, trocando de cor continuamente.
/// Respeita "reduzir animações" (anel fica estático).
class HoloEmblem extends ConsumerStatefulWidget {
  const HoloEmblem({super.key, this.size = 112});
  final double size;

  @override
  ConsumerState<HoloEmblem> createState() => _HoloEmblemState();
}

class _HoloEmblemState extends ConsumerState<HoloEmblem> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(seconds: 6))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduce = ref.watch(reduceMotionProvider) || MediaQuery.of(context).disableAnimations;
    final s = widget.size;
    return SizedBox(
      width: s,
      height: s,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // anel externo (animado, ou estático quando "reduzir animações")
          if (reduce)
            CustomPaint(size: Size.square(s), painter: const _RingPainter(0))
          else
            AnimatedBuilder(
              animation: _c,
              builder: (_, _) => CustomPaint(size: Size.square(s), painter: _RingPainter(_c.value)),
            ),
          // símbolos Tank/Heal/DPS (sem anel — o anel é desenhado acima)
          Image.asset(
            'assets/emblem_symbols.png',
            width: s,
            height: s,
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter(this.t);

  /// Fase de rotação do gradiente em [0,1).
  final double t;

  // Gradiente holo (mesmos tons do wordmark), fechado no fim para loop contínuo.
  static const _colors = <Color>[
    Color(0xFF76C8FF),
    Color(0xFF7E7BFF),
    Color(0xFF8CFFB7),
    Color(0xFFFFF29A),
    Color(0xFFFF8B5B),
    Color(0xFFFF5555),
    Color(0xFF76C8FF),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    // geometria alinhada ao PNG dos símbolos (canvas de referência 512, anel r=230, traço=8)
    final radius = size.width * 230 / 512;
    final strokeW = size.width * 8 / 512;
    final rect = Rect.fromCircle(center: center, radius: radius);
    final shader = SweepGradient(
      colors: _colors,
      transform: GradientRotation(2 * math.pi * t),
    ).createShader(rect);

    // glow suave
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeW * 1.5
        ..shader = shader
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, size.width * 0.022),
    );
    // anel nítido
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = strokeW
        ..shader = shader,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.t != t;
}
