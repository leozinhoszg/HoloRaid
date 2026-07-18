import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/features/home/my_raid_model.dart';

MyRaid _r(int id, String startIso, String status, {String? my}) => MyRaid.fromJson({
      'id': id,
      'codigo': 'R$id',
      'operation': 'Op$id',
      'difficulty': 'veteran',
      'size': 8,
      'faction': 'empire',
      'start_at': startIso,
      'status': status,
      'created': 0,
      'my_status': my,
    });

void main() {
  final now = DateTime.parse('2026-07-18T20:00:00Z');

  test('nextRaid pega a futura mais proxima OPEN/RUNNING', () {
    final list = [
      _r(1, '2026-07-17T20:00:00Z', 'FINISHED'),
      _r(2, '2026-07-19T20:00:00Z', 'OPEN'),
      _r(3, '2026-07-18T22:00:00Z', 'OPEN'),
      _r(4, '2026-07-18T21:00:00Z', 'CANCELLED'),
    ];
    expect(nextRaid(list, now)!.id, 3);
  });

  test('nextRaid null quando nao ha futura ativa', () {
    expect(nextRaid([_r(1, '2026-07-10T20:00:00Z', 'FINISHED')], now), isNull);
  });

  test('contadores', () {
    final list = [
      _r(2, '2026-07-19T20:00:00Z', 'OPEN', my: 'confirmed'),
      _r(3, '2026-07-18T22:00:00Z', 'RUNNING', my: 'waitlist'),
    ];
    expect(activeRaidsCount(list), 2);
    expect(confirmedCount(list), 1);
  });
}
