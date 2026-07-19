/// Raid do usuário logado (retorno de GET /me/raids).
class MyRaid {
  final int id;
  final String codigo, operation, difficulty, faction, status;
  final int size;
  final DateTime startAt;
  final bool created;
  final String? myStatus;

  MyRaid({
    required this.id,
    required this.codigo,
    required this.operation,
    required this.difficulty,
    required this.faction,
    required this.status,
    required this.size,
    required this.startAt,
    required this.created,
    required this.myStatus,
  });

  factory MyRaid.fromJson(Map<String, dynamic> j) => MyRaid(
        id: j['id'] as int,
        codigo: j['codigo'] as String? ?? '',
        operation: j['operation'] as String? ?? '',
        difficulty: j['difficulty'] as String? ?? '',
        faction: j['faction'] as String? ?? '',
        status: j['status'] as String? ?? '',
        size: (j['size'] as num?)?.toInt() ?? 0,
        startAt: DateTime.parse(j['start_at'] as String).toLocal(),
        created: (j['created'] as num?)?.toInt() == 1 || j['created'] == true,
        myStatus: j['my_status'] as String?,
      );

  bool get isActive => status == 'OPEN' || status == 'RUNNING';
}

/// Próxima raid ativa (OPEN/RUNNING) com início no futuro, mais próxima primeiro.
MyRaid? nextRaid(List<MyRaid> list, DateTime now) {
  final future = list.where((r) => r.isActive && r.startAt.isAfter(now)).toList()
    ..sort((a, b) => a.startAt.compareTo(b.startAt));
  return future.isEmpty ? null : future.first;
}

int activeRaidsCount(List<MyRaid> list) => list.where((r) => r.isActive).length;

int confirmedCount(List<MyRaid> list) => list.where((r) => r.myStatus == 'confirmed').length;
