import 'package:flutter/material.dart';
import 'holo_palette.dart';

/// Avatar com anel gradiente holográfico. Mostra a imagem (ex.: Discord) com
/// fallback para a inicial. `ringColors` permite tingir por papel/role.
class HoloAvatar extends StatelessWidget {
  const HoloAvatar({super.key, this.url, required this.label, this.size = 40, this.ringColors});
  final String? url;
  final String label;
  final double size;
  final List<Color>? ringColors;

  @override
  Widget build(BuildContext context) {
    final clean = label.replaceAll('.', '').trim();
    final initial = clean.isEmpty ? '?' : clean.substring(0, 1).toUpperCase();
    final fallback = Text(
      initial,
      style: TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, fontSize: size * 0.4, color: HoloPalette.blue),
    );
    return Container(
      width: size,
      height: size,
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: SweepGradient(colors: ringColors ??
            const [HoloPalette.blue, HoloPalette.indigo, HoloPalette.heal, HoloPalette.dps, HoloPalette.red, HoloPalette.blue]),
      ),
      child: ClipOval(
        child: Container(
          color: const Color(0xFF0D1024),
          alignment: Alignment.center,
          child: (url == null || url!.isEmpty)
              ? fallback
              : Image.network(url!, fit: BoxFit.cover, width: size, height: size, errorBuilder: (_, _, _) => fallback),
        ),
      ),
    );
  }
}
