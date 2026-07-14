import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() => runApp(const ProviderScope(child: RaidSyncApp()));

class RaidSyncApp extends StatelessWidget {
  const RaidSyncApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'RaidSync',
        theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo),
        home: const Scaffold(body: Center(child: Text('RaidSync — bootstrap'))),
      );
}
