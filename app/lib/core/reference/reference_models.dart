class CombatStyle {
  final String name;
  final String faccao;
  final String originStory;
  final List<String> allowedRoles;
  CombatStyle({required this.name, required this.faccao, required this.originStory, required this.allowedRoles});
  factory CombatStyle.fromJson(Map<String, dynamic> j) => CombatStyle(
        name: j['name'] as String,
        faccao: j['faccao'] as String,
        originStory: j['originStory'] as String,
        allowedRoles: (j['allowedRoles'] as List).cast<String>(),
      );
}

class Discipline {
  final String name;
  final String combatStyle;
  final String role;
  Discipline({required this.name, required this.combatStyle, required this.role});
  factory Discipline.fromJson(Map<String, dynamic> j) =>
      Discipline(name: j['name'] as String, combatStyle: j['combatStyle'] as String, role: j['role'] as String);
}

class ReferenceData {
  final List<String> factions;
  final List<String> roles;
  final List<CombatStyle> combatStyles;
  final List<Discipline> disciplines;
  ReferenceData({required this.factions, required this.roles, required this.combatStyles, required this.disciplines});
  factory ReferenceData.fromJson(Map<String, dynamic> j) => ReferenceData(
        factions: (j['factions'] as List).cast<String>(),
        roles: (j['roles'] as List).cast<String>(),
        combatStyles: (j['combatStyles'] as List).map((e) => CombatStyle.fromJson((e as Map).cast<String, dynamic>())).toList(),
        disciplines: (j['disciplines'] as List).map((e) => Discipline.fromJson((e as Map).cast<String, dynamic>())).toList(),
      );

  List<CombatStyle> stylesOfFaction(String f) => combatStyles.where((c) => c.faccao == f).toList();
  List<Discipline> disciplinesOfStyle(String s) => disciplines.where((d) => d.combatStyle == s).toList();
}
