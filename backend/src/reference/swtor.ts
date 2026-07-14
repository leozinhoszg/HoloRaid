export type Faction = 'Republic' | 'Empire';
export type Role = 'Tank' | 'Healer' | 'DPS';

export const FACTIONS: Faction[] = ['Republic', 'Empire'];
export const ROLES: Role[] = ['Tank', 'Healer', 'DPS'];

export interface CombatStyle {
  name: string;
  faccao: Faction;
  originStory: string;
  allowedRoles: Role[];
}

export const COMBAT_STYLES: CombatStyle[] = [
  { name: 'Guardian', faccao: 'Republic', originStory: 'Jedi Knight', allowedRoles: ['Tank', 'DPS'] },
  { name: 'Sentinel', faccao: 'Republic', originStory: 'Jedi Knight', allowedRoles: ['DPS'] },
  { name: 'Sage', faccao: 'Republic', originStory: 'Jedi Consular', allowedRoles: ['Healer', 'DPS'] },
  { name: 'Shadow', faccao: 'Republic', originStory: 'Jedi Consular', allowedRoles: ['Tank', 'DPS'] },
  { name: 'Commando', faccao: 'Republic', originStory: 'Trooper', allowedRoles: ['Healer', 'DPS'] },
  { name: 'Vanguard', faccao: 'Republic', originStory: 'Trooper', allowedRoles: ['Tank', 'DPS'] },
  { name: 'Gunslinger', faccao: 'Republic', originStory: 'Smuggler', allowedRoles: ['DPS'] },
  { name: 'Scoundrel', faccao: 'Republic', originStory: 'Smuggler', allowedRoles: ['Healer', 'DPS'] },
  { name: 'Juggernaut', faccao: 'Empire', originStory: 'Sith Warrior', allowedRoles: ['Tank', 'DPS'] },
  { name: 'Marauder', faccao: 'Empire', originStory: 'Sith Warrior', allowedRoles: ['DPS'] },
  { name: 'Sorcerer', faccao: 'Empire', originStory: 'Sith Inquisitor', allowedRoles: ['Healer', 'DPS'] },
  { name: 'Assassin', faccao: 'Empire', originStory: 'Sith Inquisitor', allowedRoles: ['Tank', 'DPS'] },
  { name: 'Mercenary', faccao: 'Empire', originStory: 'Bounty Hunter', allowedRoles: ['Healer', 'DPS'] },
  { name: 'Powertech', faccao: 'Empire', originStory: 'Bounty Hunter', allowedRoles: ['Tank', 'DPS'] },
  { name: 'Sniper', faccao: 'Empire', originStory: 'Imperial Agent', allowedRoles: ['DPS'] },
  { name: 'Operative', faccao: 'Empire', originStory: 'Imperial Agent', allowedRoles: ['Healer', 'DPS'] },
];

export interface Discipline {
  name: string;
  combatStyle: string;
  role: Role;
  mirror: string;
}

// [name, role, mirror] por combat style
const disc = (combatStyle: string, rows: [string, Role, string][]): Discipline[] =>
  rows.map(([name, role, mirror]) => ({ name, combatStyle, role, mirror }));

export const DISCIPLINES: Discipline[] = [
  ...disc('Guardian', [['Defense', 'Tank', 'Immortal'], ['Vigilance', 'DPS', 'Vengeance'], ['Focus', 'DPS', 'Rage']]),
  ...disc('Sentinel', [['Watchman', 'DPS', 'Annihilation'], ['Combat', 'DPS', 'Carnage'], ['Concentration', 'DPS', 'Fury']]),
  ...disc('Sage', [['Seer', 'Healer', 'Corruption'], ['Telekinetics', 'DPS', 'Lightning'], ['Balance', 'DPS', 'Madness']]),
  ...disc('Shadow', [['Kinetic Combat', 'Tank', 'Darkness'], ['Infiltration', 'DPS', 'Deception'], ['Serenity', 'DPS', 'Hatred']]),
  ...disc('Commando', [['Combat Medic', 'Healer', 'Bodyguard'], ['Gunnery', 'DPS', 'Arsenal'], ['Assault Specialist', 'DPS', 'Innovative Ordnance']]),
  ...disc('Vanguard', [['Shield Specialist', 'Tank', 'Shield Tech'], ['Tactics', 'DPS', 'Advanced Prototype'], ['Plasmatech', 'DPS', 'Pyrotech']]),
  ...disc('Gunslinger', [['Sharpshooter', 'DPS', 'Marksmanship'], ['Saboteur', 'DPS', 'Engineering'], ['Dirty Fighting', 'DPS', 'Virulence']]),
  ...disc('Scoundrel', [['Sawbones', 'Healer', 'Medicine'], ['Scrapper', 'DPS', 'Concealment'], ['Ruffian', 'DPS', 'Lethality']]),
  ...disc('Juggernaut', [['Immortal', 'Tank', 'Defense'], ['Vengeance', 'DPS', 'Vigilance'], ['Rage', 'DPS', 'Focus']]),
  ...disc('Marauder', [['Annihilation', 'DPS', 'Watchman'], ['Carnage', 'DPS', 'Combat'], ['Fury', 'DPS', 'Concentration']]),
  ...disc('Sorcerer', [['Corruption', 'Healer', 'Seer'], ['Lightning', 'DPS', 'Telekinetics'], ['Madness', 'DPS', 'Balance']]),
  ...disc('Assassin', [['Darkness', 'Tank', 'Kinetic Combat'], ['Deception', 'DPS', 'Infiltration'], ['Hatred', 'DPS', 'Serenity']]),
  ...disc('Mercenary', [['Bodyguard', 'Healer', 'Combat Medic'], ['Arsenal', 'DPS', 'Gunnery'], ['Innovative Ordnance', 'DPS', 'Assault Specialist']]),
  ...disc('Powertech', [['Shield Tech', 'Tank', 'Shield Specialist'], ['Advanced Prototype', 'DPS', 'Tactics'], ['Pyrotech', 'DPS', 'Plasmatech']]),
  ...disc('Sniper', [['Marksmanship', 'DPS', 'Sharpshooter'], ['Engineering', 'DPS', 'Saboteur'], ['Virulence', 'DPS', 'Dirty Fighting']]),
  ...disc('Operative', [['Medicine', 'Healer', 'Sawbones'], ['Concealment', 'DPS', 'Scrapper'], ['Lethality', 'DPS', 'Ruffian']]),
];

export function combatStyleByName(name: string): CombatStyle | undefined {
  return COMBAT_STYLES.find((c) => c.name === name);
}
export function disciplinesOfStyle(style: string): Discipline[] {
  return DISCIPLINES.filter((d) => d.combatStyle === style);
}
export function disciplineByName(name: string): Discipline | undefined {
  return DISCIPLINES.find((d) => d.name === name);
}
