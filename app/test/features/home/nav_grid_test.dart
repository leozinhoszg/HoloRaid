import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/features/home/widgets/nav_grid.dart';

Widget _wrap(Widget c) => MaterialApp.router(
    routerConfig: GoRouter(routes: [GoRoute(path: '/', builder: (_, _) => Scaffold(body: c))]));

void main() {
  testWidgets('NavGrid esconde Admin para user', (tester) async {
    await tester.pumpWidget(_wrap(const NavGrid(isAdmin: false, compact: true)));
    expect(find.text('Personagens'), findsOneWidget);
    expect(find.text('Admin'), findsNothing);
  });

  testWidgets('NavGrid mostra Admin para admin', (tester) async {
    await tester.pumpWidget(_wrap(const NavGrid(isAdmin: true, compact: true)));
    expect(find.text('Admin'), findsOneWidget);
  });
}
