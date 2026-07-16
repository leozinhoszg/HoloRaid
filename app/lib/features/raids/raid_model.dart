class RosterEntry {
  final int usuarioId;
  final String username;
  final int personagemId;
  final String nome;
  final String classe;
  final String role;
  final int itemLevel;
  final int totalPoints;
  final int tier;
  final String status;
  RosterEntry({
    required this.usuarioId, required this.username, required this.personagemId, required this.nome,
    required this.classe, required this.role, required this.itemLevel, required this.totalPoints,
    required this.tier, required this.status,
  });
  factory RosterEntry.fromJson(Map<String, dynamic> j) => RosterEntry(
        usuarioId: j['usuario_id'] as int,
        username: j['username'] as String? ?? '',
        personagemId: j['personagem_id'] as int,
        nome: j['nome'] as String,
        classe: j['classe'] as String,
        role: j['role'] as String,
        itemLevel: j['item_level'] as int,
        totalPoints: j['total_points'] as int,
        tier: j['tier'] as int,
        status: j['status'] as String,
      );
}

class Raid {
  final int id;
  final String codigo;
  final String operation;
  final String difficulty;
  final int size;
  final String faction;
  final int minimumTier;
  final bool checkComposition;
  final int slotsTank, slotsHeal, slotsDps;
  final String? notes;
  final DateTime startAt;
  final String status;
  final int createdBy;
  final List<RosterEntry> roster;

  Raid({
    required this.id, required this.codigo, required this.operation, required this.difficulty,
    required this.size, required this.faction, required this.minimumTier, required this.checkComposition,
    required this.slotsTank, required this.slotsHeal, required this.slotsDps, this.notes,
    required this.startAt, required this.status, required this.createdBy, this.roster = const [],
  });

  int get confirmedCount => roster.where((r) => r.status == 'confirmed').length;

  factory Raid.fromJson(Map<String, dynamic> j) => Raid(
        id: j['id'] as int,
        codigo: j['codigo'] as String,
        operation: j['operation'] as String,
        difficulty: j['difficulty'] as String,
        size: j['size'] as int,
        faction: j['faction'] as String,
        minimumTier: j['minimum_tier'] as int,
        checkComposition: (j['check_composition'] as bool?) ?? false,
        slotsTank: j['slots_tank'] as int,
        slotsHeal: j['slots_heal'] as int,
        slotsDps: j['slots_dps'] as int,
        notes: j['notes'] as String?,
        startAt: DateTime.parse(j['start_at'] as String),
        status: j['status'] as String,
        createdBy: j['created_by'] as int,
        roster: (j['roster'] as List?)?.map((e) => RosterEntry.fromJson((e as Map).cast<String, dynamic>())).toList() ?? const [],
      );
}
