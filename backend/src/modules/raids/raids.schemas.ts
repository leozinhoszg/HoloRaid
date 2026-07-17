import { z } from 'zod';
import { OPERATIONS } from '../../reference/operations';

const commonFields = {
  operation: z.string().min(1),
  difficulty: z.enum(['SM', 'HM', 'NiM']),
  size: z.number().int().refine((v) => v === 8 || v === 16, 'size deve ser 8 ou 16'),
  faction: z.enum(['Republic', 'Empire']),
  minimum_tier: z.number().int().min(0).max(6),
  check_composition: z.boolean().default(false),
  slots_tank: z.number().int().min(0),
  slots_heal: z.number().int().min(0),
  slots_dps: z.number().int().min(0),
  notes: z.string().max(2000).nullish(),
  start_at: z.coerce.date(),
  disable_mentions: z.boolean().default(false),
};

export const raidCreateSchema = z.object(commonFields).superRefine((d, ctx) => {
  if (!OPERATIONS.includes(d.operation)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['operation'], message: 'Operation inválida' });
  }
  if (d.slots_tank + d.slots_heal + d.slots_dps !== d.size) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['slots_dps'], message: 'slots devem somar o size' });
  }
});

export const raidUpdateSchema = z.object({
  minimum_tier: commonFields.minimum_tier.optional(),
  check_composition: z.boolean().optional(),
  slots_tank: commonFields.slots_tank.optional(),
  slots_heal: commonFields.slots_heal.optional(),
  slots_dps: commonFields.slots_dps.optional(),
  notes: commonFields.notes,
  start_at: commonFields.start_at.optional(),
});

export type RaidCreateInput = z.infer<typeof raidCreateSchema>;
