import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, Events, MessageFlags, StringSelectMenuBuilder, ActionRowBuilder, type ChatInputCommandInteraction, type ButtonInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { OPERATIONS } from '../reference/operations';
import { handleCreateRaid, handleSetRaidChannel, handleEditRaid, handleReportRaid, type CommandDeps, type CommandInteraction } from './commands';
import { handleJoinClick, handleLeaveClick, handleCharacterPick, type ComponentDeps, type ComponentInteraction } from './components';
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
    .addBooleanOption((o) => o.setName('disable_mentions').setDescription('Prevent the bot from pinging @here in the initial message. Default = false'))
    .addStringOption((o) => o.setName('notes').setDescription('Notes'));

  const setChannel = new SlashCommandBuilder()
    .setName('set_raid_channel')
    .setDescription('Set this channel as the raid announcement channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

  const editRaid = new SlashCommandBuilder()
    .setName('edit_raid')
    .setDescription('Edit an open raid (times are in UTC)')
    .addStringOption((o) => o.setName('code').setDescription('Raid code').setRequired(true))
    .addIntegerOption((o) => o.setName('minimum_tier').setDescription('Minimum Tier 0-6').setMinValue(0).setMaxValue(6))
    .addStringOption((o) => o.setName('notes').setDescription('Notes'))
    .addStringOption((o) => o.setName('date').setDescription('Date YYYY-MM-DD (UTC)'))
    .addStringOption((o) => o.setName('time').setDescription('Time HH:MM (UTC)'))
    .addBooleanOption((o) => o.setName('check_composition').setDescription('Enforce role slots'))
    .addIntegerOption((o) => o.setName('slots_tank').setDescription('Tank slots').setMinValue(0))
    .addIntegerOption((o) => o.setName('slots_heal').setDescription('Healer slots').setMinValue(0))
    .addIntegerOption((o) => o.setName('slots_dps').setDescription('DPS slots').setMinValue(0));

  const reportRaid = new SlashCommandBuilder()
    .setName('report_raid')
    .setDescription('Post a raid in this channel')
    .addStringOption((o) => o.setName('code').setDescription('Raid code').setRequired(true));

  return [createRaid.toJSON(), setChannel.toJSON(), editRaid.toJSON(), reportRaid.toJSON()];
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
    // A interação já foi deferida (ephemeral) no roteamento — respondemos via editReply.
    reply: async (m) => { await interaction.editReply({ content: m.content }); },
  };
}

// Adapta button/select interactions para a superfície mínima dos handlers de componente.
function adaptComponent(interaction: ButtonInteraction | StringSelectMenuInteraction): ComponentInteraction {
  return {
    user: { id: interaction.user.id, username: interaction.user.username },
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    customId: interaction.customId,
    values: interaction.isStringSelectMenu() ? interaction.values : [],
    // A interação já foi deferida (ephemeral) no roteamento — respondemos via editReply.
    reply: async (m) => { await interaction.editReply({ content: m.content }); },
    replySelect: async (m) => {
      const menu = new StringSelectMenuBuilder().setCustomId(m.customId).setPlaceholder(m.placeholder)
        .addOptions(m.options.map((o) => ({ label: o.label, value: o.value })));
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
      await interaction.editReply({ content: 'Choose a character to sign up:', components: [row] });
    },
  };
}

export function attachBot(client: Client, deps: { token: string; clientId: string } & CommandDeps & ComponentDeps): void {
  // Registra os slash commands via REST (independe do gateway estar "ready").
  new REST({ version: '10' }).setToken(deps.token)
    .put(Routes.applicationCommands(deps.clientId), { body: buildCommandDefs() })
    .then(() => logger.info('Discord: slash commands registrados'))
    .catch((err) => logger.error({ err }, 'Discord: falha ao registrar commands'));

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const known = ['create_raid', 'set_raid_channel', 'edit_raid', 'report_raid'].includes(interaction.commandName);
        if (!known) return;
        // ACK em <3s (defer) antes de qualquer I/O — os handlers respondem via editReply.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const i = adapt(interaction);
        if (interaction.commandName === 'create_raid') await handleCreateRaid(i, deps);
        else if (interaction.commandName === 'set_raid_channel') await handleSetRaidChannel(i, deps);
        else if (interaction.commandName === 'edit_raid') await handleEditRaid(i, deps);
        else if (interaction.commandName === 'report_raid') await handleReportRaid(i, deps);
      } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const known = interaction.customId.startsWith('hr:join:') || interaction.customId.startsWith('hr:leave:') || interaction.customId.startsWith('hr:pick:');
        if (!known) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const i = adaptComponent(interaction);
        if (i.customId.startsWith('hr:join:')) await handleJoinClick(i, deps);
        else if (i.customId.startsWith('hr:leave:')) await handleLeaveClick(i, deps);
        else if (i.customId.startsWith('hr:pick:')) await handleCharacterPick(i, deps);
      }
    } catch (err) {
      logger.error({ err, cmd: interaction.isCommand() ? interaction.commandName : (interaction as any).customId }, 'Discord: erro na interação');
      if (interaction.isRepliable()) {
        // Se já deferimos/respondemos, o reply falharia ("already acknowledged") — usar followUp.
        const payload = { content: 'Something went wrong.', flags: MessageFlags.Ephemeral } as const;
        const p = (interaction.deferred || interaction.replied) ? interaction.followUp(payload) : interaction.reply(payload);
        await p.catch(() => {});
      }
    }
  });

  client.login(deps.token).catch((err) => logger.error({ err }, 'Discord: falha no login (bot desativado)'));
}

export function createDiscordClient(): Client {
  return new Client({ intents: [GatewayIntentBits.Guilds] });
}
