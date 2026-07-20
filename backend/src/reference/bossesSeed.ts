export type BossType = 'boss' | 'timer' | 'lair';
export type Difficulty = 'Veteran' | 'Master';

export interface BossSeed {
  operation: string;
  boss: string;
  difficulty: Difficulty | null;
  type: BossType;
  points: number;
}

// Bosses com Veteran E Master (2 linhas, 1 ponto cada)
const both = (operation: string, bosses: string[]): BossSeed[] =>
  bosses.flatMap((boss) => [
    { operation, boss, difficulty: 'Veteran' as const, type: 'boss' as const, points: 1 },
    { operation, boss, difficulty: 'Master' as const, type: 'boss' as const, points: 1 },
  ]);

// Bosses só Veteran (Master N/A)
const vet = (operation: string, bosses: string[]): BossSeed[] =>
  bosses.map((boss) => ({ operation, boss, difficulty: 'Veteran' as const, type: 'boss' as const, points: 1 }));

const timer = (operation: string): BossSeed => ({ operation, boss: 'Timer', difficulty: null, type: 'timer', points: 1 });

const lair = (name: string, difficulty: Difficulty): BossSeed => ({
  operation: name, boss: name, difficulty, type: 'lair', points: 1,
});

export const BOSSES_SEED: BossSeed[] = [
  // type 'boss' — Veteran + Master
  ...both('Explosive Conflict', ['Zorn & Toth', 'Tanks', 'Minefield', 'Kephess']),
  ...both('Terror From Beyond', ['Writhing Horror', 'Dread Guards', 'Operator IX', 'Kephess', 'Terror From Beyond']),
  // Dreadful Entity: boss secreto de Terror From Beyond (só Veteran)
  { operation: 'Terror From Beyond', boss: 'Dreadful Entity', difficulty: 'Veteran', type: 'boss', points: 1 },
  ...both('Scum and Villainy', ['Dash', 'Titan 6', 'Thrasher', 'Operations Chief', 'Olok', 'Warlords', 'Styrak']),
  // Hateful Entity: boss secreto de Scum and Villainy (só Master)
  { operation: 'Scum and Villainy', boss: 'Hateful Entity', difficulty: 'Master', type: 'boss', points: 1 },
  ...both('Dread Fortress', ['Nefra', 'Draxus', "Grob'Thok", 'Corrupter Zero', 'Brontes']),
  ...both('Dread Palace', ['Bestia', 'Tyrans', 'Calphayus', 'Raptus', 'Council']),
  ...both('Dxun', ['Red', 'Lights Out', 'According to Plan', 'Trandoshans', 'Huntmaster', 'Apex']),
  ...both('Gods from the Machine', ['Tyth', 'Aivela & Esne', 'Nahut', 'Scyva', 'Izax']),
  // type 'boss' — só Veteran
  ...vet('R-4 Anomaly', ['IP-CPT', 'Watchdog', 'Kanoth', 'Lady Dominique']),
  ...vet('Ravagers', ['Sparky', 'Quartermaster', 'Torque', 'Master & Blaster', 'Coratanni']),
  ...vet('Temple of Sacrifice', ['Malaphar', 'Sword Squadrons', 'Underlurker', 'Revanite Commander', 'Revan']),
  // type 'timer'
  timer('Explosive Conflict'), timer('Terror From Beyond'), timer('Scum and Villainy'),
  timer('Dread Palace'), timer('Dread Fortress'), timer('Dxun'),
  timer('Gods from the Machine'), timer('R-4 Anomaly'),
  // type 'lair'
  lair('Monolith', 'Veteran'), lair('Hive Queen', 'Veteran'),
  { operation: 'XR-53', boss: 'XR-53', difficulty: 'Veteran', type: 'lair', points: 1 },
  { operation: 'XR-53', boss: 'XR-53', difficulty: 'Master', type: 'lair', points: 1 },
  lair('Golden Fury', 'Veteran'), lair('Eyeless', 'Veteran'), lair('Xeno', 'Veteran'),
];
