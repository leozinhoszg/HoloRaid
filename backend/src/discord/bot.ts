import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, Events, type ChatInputCommandInteraction } from 'discord.js';
import { OPERATIONS } from '../reference/operations';
import { handleCreateRaid, handleSetRaidChannel, type CommandDeps, type CommandInteraction } from './commands';
import { logger } from '../common/logger/logger';

export function buildCommandDefs() {
  const createRaid = new SlashCommandBuilder()
    .setName('create_raid')
    .setDescription('Create a raid (times are in UTC)')
    .addStringOption((o) => o.setName('operation').setDescription('Operation').setRequired(true).addChoices(...OPERATIONS.slice(0, 25).map((op) => ({ name: op, value: op }))))
    .addStringOption((o) => o.setName('difficulty').setDescription('Difficulty').setRequired(true).addChoices({ name: 'Story Mode', value: 'SM' }, { name: 'Veteran (HM)', value: 'HM' }, { name: 'Master (NiM)', value: 'NiM' }))
    .addIntegerOption((o) => o.setName('size').setDescription('Group size').setRequired(true).addChoices({ name: '8 players', value: 8 }, { name: '16 players', value: 16 }))
    .addStringOption((o) => o.setName('faction').setDescription('Faction').setRequired(true).addChoices({ name: 'Republic', value: 'Republic' }, { name: 'Empire', value: 'Empire' }))
    .addStringOption((o) => o.setName('date').setDescription('Date YYYY-MM-DD (UTC)').setRequired(true))
    .addStringOption((o) => o.setName('time').setDescription('Time HH:MM (UTC)').setRequired(true))
    .addIntegerOption((o) => o.setName('minimum_tier').setDescription('Minimum Tier 0-6').setMinValue(0).setMaxValue(6))
    .addBooleanOption((o) => o.setName('check_composition').setDescription('Enforce role slots'))
    .addStringOption((o) => o.setName('notes').setDescription('Notes'));

  const setChannel = new SlashCommandBuilder()
    .setName('set_raid_channel')
    .setDescription('Set this channel as the raid announcement channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

  return [createRaid.toJSON(), setChannel.toJSON()];
}

// Adapta a interação do discord.js para a superfície mínima dos handlers.
function adapt(interaction: ChatInputCommandInteraction): CommandInteraction {
  return {
    user: { id: interaction.user.id, username: interaction.user.username },
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    memberPermissions: {
      has: (perm) => Boolean(interaction.memberPermissions?.has(PermissionFlagsBits[perm as keyof typeof PermissionFlagsBits])),
    },
    getString: (n) => interaction.options.getString(n),
    getInteger: (n) => interaction.options.getInteger(n),
    getBoolean: (n) => interaction.options.getBoolean(n),
    reply: async (m) => { await interaction.reply({ content: m.content, ephemeral: m.ephemeral ?? false }); },
  };
}

export function attachBot(client: Client, deps: { token: string; clientId: string } & CommandDeps): void {
  // Registra os slash commands via REST (independe do gateway estar "ready").
  new REST({ version: '10' }).setToken(deps.token)
    .put(Routes.applicationCommands(deps.clientId), { body: buildCommandDefs() })
    .then(() => logger.info('Discord: slash commands registrados'))
    .catch((err) => logger.error({ err }, 'Discord: falha ao registrar commands'));

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const i = adapt(interaction);
    try {
      if (interaction.commandName === 'create_raid') await handleCreateRaid(i, deps);
      else if (interaction.commandName === 'set_raid_channel') await handleSetRaidChannel(i, deps);
    } catch (err) {
      logger.error({ err, cmd: interaction.commandName }, 'Discord: erro no comando');
      if (!interaction.replied) await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
    }
  });

  client.login(deps.token).catch((err) => logger.error({ err }, 'Discord: falha no login (bot desativado)'));
}

export function createDiscordClient(): Client {
  return new Client({ intents: [GatewayIntentBits.Guilds] });
}
