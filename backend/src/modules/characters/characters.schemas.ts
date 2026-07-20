import { z } from 'zod';
import { FACTIONS, ROLES, combatStyleByName, disciplineByName } from '../../reference/swtor';

const fields = {
  nome: z.string().trim().min(1).max(64),
  faccao: z.enum(FACTIONS as [string, ...string[]]),
  classe: z.string().min(1),
  especializacao: z.string().min(1).nullish(),
  role: z.enum(ROLES as [string, ...string[]]),
  origin_story: z.string().min(1).nullish(),
  item_level: z.number().int().min(0).max(10000),
};

function refine(data: any, ctx: z.RefinementCtx) {
  const style = combatStyleByName(data.classe);
  if (!style) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['classe'], message: 'Combat Style does not exist' });
    return;
  }
  if (style.faccao !== data.faccao) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['classe'], message: 'Combat Style does not belong to the faction' });
  }
  if (!style.allowedRoles.includes(data.role)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'Role not allowed for this class' });
  }
  if (data.origin_story && data.origin_story !== style.originStory) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['origin_story'], message: 'Origin Story does not match the class' });
  }
  if (data.especializacao) {
    const disc = disciplineByName(data.especializacao);
    if (!disc || disc.combatStyle !== data.classe) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['especializacao'], message: 'Discipline does not belong to the class' });
    } else if (disc.role !== data.role) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['especializacao'], message: 'Discipline role differs from the chosen role' });
    }
  }
}

export const createCharacterSchema = z.object(fields).superRefine(refine);
export const updateCharacterSchema = z.object({
  nome: fields.nome.optional(),
  faccao: fields.faccao.optional(),
  classe: fields.classe.optional(),
  especializacao: fields.especializacao,
  role: fields.role.optional(),
  origin_story: fields.origin_story,
  item_level: fields.item_level.optional(),
});

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
