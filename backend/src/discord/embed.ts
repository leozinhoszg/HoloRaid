import type { RaidDetail } from '../modules/raids/raids.service';

export interface RaidEmbed {
  title: string;
  fields: { name: string; value: string }[];
  joinUrl: string;
}

const DIFF: Record<string, string> = { SM: 'Story Mode', HM: 'Veteran', NiM: 'Master' };

export function buildRaidEmbed(detail: RaidDetail, appPublicUrl: string): RaidEmbed {
  const confirmed = detail.roster.filter((r) => r.status === 'confirmed').length;
  const unix = Math.floor(new Date(detail.start_at).getTime() / 1000);
  return {
    title: 'New Raid — HoloRaid',
    fields: [
      { name: 'Operation', value: detail.operation },
      { name: 'Difficulty', value: DIFF[detail.difficulty] ?? detail.difficulty },
      { name: 'Size', value: `${detail.size} players` },
      { name: 'Faction', value: detail.faction },
      { name: 'Minimum Tier', value: detail.minimum_tier === 0 ? 'None' : `Tier ${detail.minimum_tier}` },
      { name: 'Time', value: `<t:${unix}:F> (<t:${unix}:R>)` },
      { name: 'Signed', value: `${confirmed}/${detail.size}` },
      { name: 'Status', value: detail.status },
    ],
    joinUrl: `${appPublicUrl}/r/${detail.codigo}`,
  };
}
