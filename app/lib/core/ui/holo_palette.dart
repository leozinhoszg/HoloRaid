import 'package:flutter/material.dart';

/// Paleta única do HoloRaid (do JSON do dono). Absorve a antiga LoginPalette.
class HoloPalette {
  static const bgTop = Color(0xFF080816);
  static const bgMid = Color(0xFF0B0F28);
  static const bgBottom = Color(0xFF050509);
  static const blue = Color(0xFF76C8FF);
  static const indigo = Color(0xFF7E7BFF);
  static const tank = Color(0xFF7E7BFF);
  static const heal = Color(0xFF8CFFB7);
  static const gold = Color(0xFFFFF29A);
  static const dps = Color(0xFFFF8B5B);
  static const red = Color(0xFFFF5555);
  static const ink = Color(0xFFEAECF7);
  static const dim = Color(0xFF9AA0C3);
  static const faint = Color(0xFF6B7099);
  static const glassFill = Color(0x8C0E1228); // rgba(14,18,40,.55)
  static const glassBorder = Color(0x247C8CFF); // rgba(120,140,255,.14)
  static const glassBorderStrong = Color(0x477C8CFF); // .28
  static const discord = Color(0xFF5865F2);

  /// Gradiente do wordmark (6 tons, stops 0/.22/.48/.72/.88/1).
  static const wordmark = [blue, indigo, heal, gold, dps, red];
  static const wordmarkStops = [0.0, 0.22, 0.48, 0.72, 0.88, 1.0];
}
