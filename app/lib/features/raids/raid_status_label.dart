import 'package:easy_localization/easy_localization.dart';

/// Traduz o status cru da raid (OPEN/RUNNING/FINISHED/CANCELLED) para o rótulo
/// localizado. Faz fallback para o valor cru se for um status desconhecido.
String raidStatusLabel(String status) {
  switch (status.toUpperCase()) {
    case 'OPEN':
      return 'raid_status.open'.tr();
    case 'RUNNING':
      return 'raid_status.running'.tr();
    case 'FINISHED':
      return 'raid_status.finished'.tr();
    case 'CANCELLED':
      return 'raid_status.cancelled'.tr();
    default:
      return status;
  }
}
