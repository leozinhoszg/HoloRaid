class Character {
  final int id;
  final String nome;
  final String faccao;
  final String classe;
  final String? especializacao;
  final String role;
  final String? originStory;
  final int itemLevel;
  final int totalPoints;
  final int tier;
  final int? pointsToNextTier;

  Character({
    required this.id, required this.nome, required this.faccao, required this.classe,
    this.especializacao, required this.role, this.originStory, required this.itemLevel,
    required this.totalPoints, required this.tier, this.pointsToNextTier,
  });

  factory Character.fromJson(Map<String, dynamic> j) => Character(
        id: j['id'] as int,
        nome: j['nome'] as String,
        faccao: j['faccao'] as String,
        classe: j['classe'] as String,
        especializacao: j['especializacao'] as String?,
        role: j['role'] as String,
        originStory: j['origin_story'] as String?,
        itemLevel: j['item_level'] as int,
        totalPoints: j['total_points'] as int,
        tier: j['tier'] as int,
        pointsToNextTier: j['pointsToNextTier'] as int?,
      );
}
