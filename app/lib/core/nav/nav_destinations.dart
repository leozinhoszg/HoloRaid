import 'package:flutter/material.dart';
import '../ui/holo_palette.dart';

class NavDestination {
  final String route, label;
  final IconData icon;
  final Color color;
  const NavDestination({required this.route, required this.label, required this.icon, required this.color});
}

List<NavDestination> navDestinations({required bool isAdmin}) => [
      const NavDestination(route: '/home', label: 'Início', icon: Icons.dashboard_outlined, color: HoloPalette.indigo),
      const NavDestination(route: '/characters', label: 'Personagens', icon: Icons.people_alt_outlined, color: HoloPalette.indigo),
      const NavDestination(route: '/raids', label: 'Raids', icon: Icons.calendar_month_outlined, color: HoloPalette.blue),
      const NavDestination(route: '/dashboard', label: 'Dashboard', icon: Icons.bar_chart, color: HoloPalette.heal),
      if (isAdmin) const NavDestination(route: '/admin/users', label: 'Admin', icon: Icons.shield_outlined, color: HoloPalette.red),
    ];

bool isDestinationActive(String route, String location) =>
    route == '/home' ? location == '/home' : location.startsWith(route);

class NavFab {
  final String label;
  final IconData icon;
  final String route;
  const NavFab(this.label, this.icon, this.route);
}

NavFab? fabForLocation(String location) {
  if (location == '/characters') return const NavFab('Novo', Icons.add, '/characters/new');
  if (location == '/raids') return const NavFab('Criar raid', Icons.add, '/raids/new');
  return null;
}

/// Título da seção; usa o primeiro destino cujo route casa (admin incluído p/ resolver /admin/*).
String titleForLocation(String location) {
  for (final d in navDestinations(isAdmin: true)) {
    if (isDestinationActive(d.route, location)) return d.label;
  }
  return 'HoloRaid';
}
