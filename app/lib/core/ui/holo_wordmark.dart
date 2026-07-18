import 'package:flutter/material.dart';
import 'holo_palette.dart';

/// Wordmark "HoloRaid" em Audiowide com o gradiente de 6 tons + glow (do JSON).
class HoloWordmark extends StatelessWidget {
  const HoloWordmark({super.key, this.size = 34});
  final double size;

  @override
  Widget build(BuildContext context) {
    return ShaderMask(
      blendMode: BlendMode.srcIn,
      shaderCallback: (r) => const LinearGradient(
        colors: HoloPalette.wordmark,
        stops: HoloPalette.wordmarkStops,
      ).createShader(r),
      child: Text(
        'HoloRaid',
        style: TextStyle(
          fontFamily: 'Audiowide',
          fontSize: size,
          letterSpacing: .5,
          height: 1,
          color: Colors.white,
          shadows: const [
            Shadow(color: Color(0x734AB4FF), blurRadius: 20),
            Shadow(color: Color(0x59FF6464), blurRadius: 22),
          ],
        ),
      ),
    );
  }
}
