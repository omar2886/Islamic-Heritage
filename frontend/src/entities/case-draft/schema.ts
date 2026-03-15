import { z } from 'zod';

const countSchema = z.number().int().min(0);
const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, 'La moneda debe tener 3 letras mayúsculas');

export const causanteSchema = z.object({
  sex: z.enum(['male', 'female'], {
    message: 'Debes seleccionar el sexo del finado',
  }),
  school: z.literal('maliki').default('maliki'),
  estateValue: z.number().finite().min(0).optional(),
  currency: currencySchema.optional(),
});

export const immediateFamilySchema = z.object({
  hasHusband: z.boolean().default(false),
  numberOfWives: countSchema.max(4).default(0),
  hasFather: z.boolean().default(false),
  hasMother: z.boolean().default(false),
});

export const descendantsSchema = z.object({
  sons: countSchema.default(0),
  daughters: countSchema.default(0),
  grandsons: countSchema.default(0), // via son
  granddaughters: countSchema.default(0), // via son
  hasDeceasedSon: z.boolean().default(false),
});

export const extendedFamilySchema = z.object({
  // Siblings
  fullBrothers: countSchema.default(0),
  fullSisters: countSchema.default(0),
  paternalBrothers: countSchema.default(0),
  paternalSisters: countSchema.default(0),
  maternalBrothers: countSchema.default(0),
  maternalSisters: countSchema.default(0),

  // Grandparents
  hasPaternalGrandfather: z.boolean().default(false),
  hasPaternalGrandmother: z.boolean().default(false),
  hasMaternalGrandmother: z.boolean().default(false),
  hasPaternalGreatGrandmother: z.boolean().default(false),
  hasMaternalGreatGrandmother: z.boolean().default(false),

  // Uncles and agnatic branch
  paternalUncles: countSchema.default(0),
  paternalConsanguineUncles: countSchema.default(0),
  paternalUncleSons: countSchema.default(0),
  paternalConsanguineUncleSons: countSchema.default(0),
  paternalUnclesDaughters: countSchema.default(0),
  paternalConsanguineUnclesDaughters: countSchema.default(0),
  paternalUncleSonsDaughters: countSchema.default(0),
  paternalConsanguineUncleSonsDaughters: countSchema.default(0),
});

export const preferencesSchema = z.object({
  expertMode: z.boolean().default(false),
}).default({
  expertMode: false,
});

/**
 * B-001: CaseDraftSchema
 * Modelo canónico que representa el formulario y el estado del caso en el navegador,
 * completamente desacoplado del "HeirPayload" técnico.
 */
export const caseDraftSchema = z.object({
  causante: causanteSchema,
  immediateFamily: immediateFamilySchema,
  descendants: descendantsSchema,
  extendedFamily: extendedFamilySchema,
  preferences: preferencesSchema,
}).superRefine((draft, ctx) => {
  if (draft.causante.sex === 'male' && draft.immediateFamily.hasHusband) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['immediateFamily', 'hasHusband'],
      message: 'Un causante masculino no puede tener esposo.',
    });
  }

  if (draft.causante.sex === 'female' && draft.immediateFamily.numberOfWives > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['immediateFamily', 'numberOfWives'],
      message: 'Un causante femenino no puede tener esposas.',
    });
  }

  const hasGrandchildrenViaSon =
    draft.descendants.grandsons > 0 || draft.descendants.granddaughters > 0;

  if (hasGrandchildrenViaSon && !draft.descendants.hasDeceasedSon) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['descendants', 'hasDeceasedSon'],
      message: 'Si se indican nietos por hijo, debe existir al menos un hijo fallecido.',
    });
  }
});

// Zod como SOT (Single Source of Truth)
export type CaseDraft = z.infer<typeof caseDraftSchema>;
export type CausanteDraft = z.infer<typeof causanteSchema>;
export type ImmediateFamilyDraft = z.infer<typeof immediateFamilySchema>;
export type DescendantsDraft = z.infer<typeof descendantsSchema>;
export type ExtendedFamilyDraft = z.infer<typeof extendedFamilySchema>;
export type PreferencesDraft = z.infer<typeof preferencesSchema>;
