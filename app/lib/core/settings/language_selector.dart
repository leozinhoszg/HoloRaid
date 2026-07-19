import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

/// Nomes nativos (não traduzidos) de cada idioma suportado.
const Map<String, String> kLanguageNames = {
  'en': 'English',
  'pt': 'Português',
  'de': 'Deutsch',
  'fr': 'Français',
  'es': 'Español',
};

/// Dropdown de seleção de idioma. Persiste automaticamente (easy_localization).
class LanguageSelector extends StatelessWidget {
  const LanguageSelector({super.key, this.compact = false});

  /// Quando true, renderiza sem label (para uso discreto no login).
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final current = context.locale.languageCode;
    final dropdown = DropdownButton<String>(
      value: kLanguageNames.containsKey(current) ? current : 'en',
      underline: const SizedBox.shrink(),
      icon: const Icon(Icons.language, size: 18),
      items: kLanguageNames.entries
          .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
          .toList(),
      onChanged: (code) {
        if (code != null) context.setLocale(Locale(code));
      },
    );
    if (compact) return dropdown;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('${'common.language'.tr()}: '),
        dropdown,
      ],
    );
  }
}
