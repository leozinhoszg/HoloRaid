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
    // Transparente: o HoloBackground global (MaterialApp.builder) aparece atrás de toda tela.
    scaffoldBackgroundColor: Colors.transparent,
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
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      foregroundColor: HoloPalette.ink,
      centerTitle: false,
      titleTextStyle: TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, fontSize: 20, color: HoloPalette.ink),
      iconTheme: IconThemeData(color: HoloPalette.ink),
    ),
    cardTheme: CardThemeData(
      color: HoloPalette.glassFill,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: HoloPalette.glassBorder),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: HoloPalette.glassFill,
      side: const BorderSide(color: HoloPalette.glassBorderStrong),
      labelStyle: const TextStyle(fontFamily: 'Aldrich', fontSize: 11, letterSpacing: 1, color: HoloPalette.indigo),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
    listTileTheme: const ListTileThemeData(iconColor: HoloPalette.dim, textColor: HoloPalette.ink),
    dividerTheme: const DividerThemeData(color: HoloPalette.glassBorder, thickness: 1),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: HoloPalette.blue),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: HoloPalette.blue,
      foregroundColor: Color(0xFF0A0D1C),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0x66101430),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      labelStyle: const TextStyle(fontFamily: 'Jura', color: HoloPalette.dim),
      floatingLabelStyle: const TextStyle(fontFamily: 'Aldrich', color: HoloPalette.blue, letterSpacing: 1),
      hintStyle: const TextStyle(fontFamily: 'Jura', color: HoloPalette.faint),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: HoloPalette.glassBorderStrong)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: HoloPalette.glassBorderStrong)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: HoloPalette.blue, width: 1.6)),
    ),
    dropdownMenuTheme: const DropdownMenuThemeData(
      menuStyle: MenuStyle(backgroundColor: WidgetStatePropertyAll(Color(0xFF11162E))),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? HoloPalette.blue : HoloPalette.dim),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? const Color(0x5576C8FF) : const Color(0x22FFFFFF)),
      trackOutlineColor: const WidgetStatePropertyAll(HoloPalette.glassBorderStrong),
    ),
  );
}
