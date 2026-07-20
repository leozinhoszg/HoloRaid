import 'dart:ui';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import '../ui/holo_palette.dart';

/// Nomes nativos (não traduzidos) de cada idioma suportado.
const Map<String, String> kLanguageNames = {
  'en': 'English',
  'pt': 'Português',
  'de': 'Deutsch',
  'fr': 'Français',
  'es': 'Español',
};

/// Dropdown de seleção de idioma (usado na tela de Perfil). Persiste
/// automaticamente (easy_localization) e troca todos os textos na hora.
class LanguageSelector extends StatelessWidget {
  const LanguageSelector({super.key});

  @override
  Widget build(BuildContext context) {
    final current = context.locale.languageCode;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('${'common.language'.tr()}: '),
        DropdownButton<String>(
          value: kLanguageNames.containsKey(current) ? current : 'en',
          underline: const SizedBox.shrink(),
          icon: const Icon(Icons.language, size: 18),
          items: kLanguageNames.entries
              .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
              .toList(),
          onChanged: (code) {
            if (code != null) context.setLocale(Locale(code));
          },
        ),
      ],
    );
  }
}

/// Seletor de idioma em "pílula" glassmorphism, consistente com o [GlassCard]
/// do app (blur + fill translúcido deixando o fundo aparecer + borda). Ao
/// escolher, `context.setLocale` reconstrói a árvore e traduz todos os textos
/// na hora. Ideal para sobrepor a telas com fundo (ex.: Login).
class GlassLanguageSelector extends StatelessWidget {
  const GlassLanguageSelector({super.key});

  @override
  Widget build(BuildContext context) {
    final current = context.locale.languageCode;
    final code = kLanguageNames.containsKey(current) ? current : 'en';
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: PopupMenuButton<String>(
          initialValue: code,
          tooltip: 'common.language'.tr(),
          position: PopupMenuPosition.under,
          offset: const Offset(0, 6),
          color: const Color(0xF2101430),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: HoloPalette.glassBorderStrong),
          ),
          onSelected: (c) => context.setLocale(Locale(c)),
          itemBuilder: (context) => kLanguageNames.entries.map((e) {
            final selected = e.key == code;
            return PopupMenuItem<String>(
              value: e.key,
              child: Row(
                children: [
                  Icon(
                    selected ? Icons.check : Icons.language,
                    size: 16,
                    color: selected ? HoloPalette.blue : HoloPalette.faint,
                  ),
                  const SizedBox(width: 10),
                  Text(
                    e.value,
                    style: TextStyle(
                      fontFamily: 'Jura',
                      fontSize: 14,
                      color: selected ? HoloPalette.ink : HoloPalette.dim,
                      fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: HoloPalette.glassFill,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: HoloPalette.glassBorder),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.language, size: 16, color: HoloPalette.dim),
                const SizedBox(width: 7),
                Text(
                  kLanguageNames[code]!,
                  style: const TextStyle(
                    fontFamily: 'Jura',
                    fontSize: 13,
                    color: HoloPalette.ink,
                  ),
                ),
                const SizedBox(width: 2),
                const Icon(Icons.arrow_drop_down, size: 18, color: HoloPalette.dim),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
