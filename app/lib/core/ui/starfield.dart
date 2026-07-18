import 'dart:math';
import 'package:flutter/material.dart';

/// Campo de estrelas estático (seed fixa → determinístico, sem piscar).
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
