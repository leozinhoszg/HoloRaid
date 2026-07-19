import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

/// Achata um mapa aninhado em chaves com ponto: {"a":{"b":1}} -> {"a.b"}.
Set<String> _flatKeys(Map<String, dynamic> m, [String prefix = '']) {
  final out = <String>{};
  m.forEach((k, v) {
    final key = prefix.isEmpty ? k : '$prefix.$k';
    if (v is Map<String, dynamic>) {
      out.addAll(_flatKeys(v, key));
    } else {
      out.add(key);
    }
  });
  return out;
}

Set<String> _keysOf(String lang) {
  final raw = File('assets/translations/$lang.json').readAsStringSync();
  return _flatKeys(json.decode(raw) as Map<String, dynamic>);
}

void main() {
  test('todos os idiomas têm exatamente as mesmas chaves que en', () {
    final en = _keysOf('en');
    for (final lang in ['pt', 'de', 'fr', 'es']) {
      final other = _keysOf(lang);
      final missing = en.difference(other);
      final extra = other.difference(en);
      expect(missing, isEmpty, reason: '$lang está SEM as chaves: $missing');
      expect(extra, isEmpty, reason: '$lang tem chaves A MAIS: $extra');
    }
  });
}
