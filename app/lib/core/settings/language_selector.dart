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

/// Arquivo da bandeira (em `assets/flags/`) de cada idioma. `en` usa a bandeira
/// dos EUA; `pt`, a do Brasil. Mesmo mapeamento das páginas legais (web).
const Map<String, String> kLanguageFlags = {
  'en': 'us',
  'pt': 'br',
  'de': 'de',
  'fr': 'fr',
  'es': 'es',
};

/// Bandeira retangular com cantos arredondados e borda sutil — consistente com
/// o seletor das páginas legais (web). `cacheWidth` evita decodificar o PNG de
/// ~512px à toa; o `errorBuilder` preserva o espaço se o asset faltar (ou em
/// testes de widget, que rodam sem o bundle de assets).
Widget _flagBox(String code, {double width = 22}) {
  final file = kLanguageFlags[code] ?? 'us';
  final height = width * 15 / 22;
  return Container(
    width: width,
    height: height,
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(3),
      border: Border.all(color: Colors.white24, width: 0.5),
    ),
    child: Image.asset(
      'assets/flags/$file.png',
      width: width,
      height: height,
      fit: BoxFit.cover,
      cacheWidth: 64,
      errorBuilder: (_, _, _) => const SizedBox.shrink(),
    ),
  );
}

/// Seletor de idioma em "pílula" glassmorphism, consistente com o [GlassCard]
/// do app (blur + fill translúcido deixando o fundo aparecer + borda). Exibe a
/// bandeira do idioma ativo; ao escolher, `context.setLocale` reconstrói a
/// árvore e traduz todos os textos na hora. Usado no Login e no Perfil.
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
              child: SizedBox(
                width: 168,
                child: Row(
                  children: [
                    _flagBox(e.key),
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
                    if (selected) ...[
                      const Spacer(),
                      const Icon(Icons.check, size: 16, color: HoloPalette.blue),
                    ],
                  ],
                ),
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
                _flagBox(code, width: 20),
                const SizedBox(width: 8),
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
