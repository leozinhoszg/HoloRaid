import 'package:flutter/material.dart';
import 'holo_palette.dart';

/// Tema dark holográfico global do HoloRaid.
ThemeData holoTheme() {
  const scheme = ColorScheme.dark(
    primary: HoloPalette.indigo,
    secondary: HoloPalette.blue,
    surface: HoloPalette.bgMid,
    error: HoloPalette.red,
    onPrimary: Color(0xFF0A0D1C),
    onSurface: HoloPalette.ink,
  );
  const label = TextStyle(fontFamily: 'Aldrich', letterSpacing: 2, color: HoloPalette.dim);
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: HoloPalette.bgMid,
    fontFamily: 'Jura',
    textTheme: const TextTheme(
      displaySmall: TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, color: HoloPalette.ink),
      headlineSmall: TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, color: HoloPalette.ink),
      titleLarge: TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w600, color: HoloPalette.ink),
      titleMedium: TextStyle(fontFamily: 'Aldrich', color: HoloPalette.ink),
      labelLarge: label,
      labelMedium: label,
      labelSmall: label,
      bodyMedium: TextStyle(fontFamily: 'Jura', color: HoloPalette.ink),
      bodySmall: TextStyle(fontFamily: 'Jura', color: HoloPalette.dim),
    ),
    iconTheme: const IconThemeData(color: HoloPalette.dim),
  );
}
