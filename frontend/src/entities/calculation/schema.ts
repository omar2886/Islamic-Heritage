import { z } from 'zod';

export const calcRoleIds = [
  'consanguine_brother',
  'consanguine_paternal_uncle',
  'consanguine_paternal_uncle_son',
  'consanguine_paternal_uncle_sons_daughter',
  'consanguine_paternal_uncles_daughter',
  'consanguine_sister',
  'daughter',
  'father',
  'full_brother',
  'full_sister',
  'husband',
  'maternal_grandmother',
  'maternal_great_grandmother',
  'mother',
  'paternal_grandfather',
  'paternal_grandmother',
  'paternal_great_grandmother',
  'paternal_uncle',
  'paternal_uncle_son',
  'paternal_uncle_sons_daughter',
  'paternal_uncles_daughter',
  'son',
  'sons_daughter',
  'sons_son',
  'uterine_brother',
  'uterine_sister',
  'wife',
] as const;

const fractionStringSchema = z.string().min(1);
const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, 'La moneda debe tener 3 letras mayúsculas');
const estateValueRegex = /^[0-9]{1,18}(\.[0-9]{1,6})?$/;

function normalizeEstateValue(value: number): string {
  return value.toFixed(6).replace(/\.?0+$/, '');
}

const estateValueSchema = z
  .number()
  .finite()
  .min(0)
  .superRefine((value, ctx) => {
    const normalized = normalizeEstateValue(value);

    if (!estateValueRegex.test(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'estate_value debe tener hasta 18 enteros y 6 decimales.',
      });
      return;
    }

    const [intPart, decimalPart = ''] = normalized.split('.');
    if (
      intPart === '999999999999999999' &&
      decimalPart !== '' &&
      Number(decimalPart) > 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'estate_value excede el máximo aceptado por calc.php.',
      });
    }
  });

export const calcRoleSchema = z.enum(calcRoleIds);

export const calcHeirSchema = z.object({
  role: calcRoleSchema,
  count: z.number().int().min(1).max(100),
});

const calcOutputHeirSchema = z.object({
  role: z.string().trim().min(1).max(64),
  count: z.number().int().min(1).max(100),
})

/**
 * B-002: CalcPayloadSchema
 * Contrato estricto del payload de envío hacia `calc.php`.
 */
export const calcPayloadSchema = z.object({
  heirs: z.array(calcHeirSchema).min(1, 'Debe existir al menos un heredero.'),
  currency: currencySchema.optional(),
  estate_value: estateValueSchema.optional(),
  ui_meta: z.object({
    sex: z.enum(['male', 'female', 'unknown']).optional(),
    decedentId: z.union([
      z.literal(''),
      z
        .string()
        .trim()
        .max(32, 'decedentId no puede exceder 32 caracteres')
        .regex(/^P[0-9]+$/, 'decedentId debe tener formato P123'),
    ]).optional(),
    source: z.string().trim().min(1).max(40).optional(),
  }).optional(),
  cli_flags: z.array(z.enum(['--explain', '--audit'])).optional(),
}).superRefine((payload, ctx) => {
  const totalsByRole = new Map<CalcRole, number>()

  for (const heir of payload.heirs) {
    const nextTotal = (totalsByRole.get(heir.role) ?? 0) + heir.count
    totalsByRole.set(heir.role, nextTotal)

    if (nextTotal > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['heirs'],
        message: `La cantidad acumulada para ${heir.role} no puede superar 100.`,
      })
    }
  }
});

const groupSharesSchema = z.record(z.string(), fractionStringSchema);
const individualSharesSchema = z.record(z.string(), z.array(fractionStringSchema));

const calcOutputSharesSchema = z.object({
  fixed: z.object({
    groups: groupSharesSchema,
    individuals: individualSharesSchema,
    sumFixed: fractionStringSchema.optional(),
  }).optional(),
  normalized: z.object({
    groups: groupSharesSchema,
    individuals: individualSharesSchema,
    sumFixedNormalized: fractionStringSchema.optional(),
    residualForAsaba: fractionStringSchema.optional(),
  }).optional(),
  asaba: z.object({
    residualConsumed: fractionStringSchema.optional(),
    groups: groupSharesSchema.optional(),
    individuals: individualSharesSchema.optional(),
    notes: z.array(z.unknown()).optional(),
  }).optional(),
  final: z.object({
    groups: groupSharesSchema,
    individuals: individualSharesSchema,
    sumFinal: fractionStringSchema.optional(),
  }),
}).optional();

const calcOutputSchema = z.object({
  version: z.string().optional(),
  input: z.object({
    heirs: z.array(calcOutputHeirSchema).optional(),
    estate_value: z.union([z.number(), z.string()]).optional(),
    currency: currencySchema.optional(),
    ui_meta: z.record(z.string(), z.unknown()).optional(),
  }).passthrough().optional(),
  shares: calcOutputSharesSchema,
  warnings: z.array(z.unknown()).optional(),
  meta: z.object({
    phase_ledger: z.array(z.unknown()).optional(),
    residual_policy: z.string().optional(),
    bayt_due: fractionStringSchema.optional(),
  }).passthrough().optional(),
  group_shares: groupSharesSchema.optional(),
  individual_shares: individualSharesSchema.optional(),
  amounts_by_role: z.record(z.string(), z.string()).optional(),
  amounts_by_individual: z.record(z.string(), z.array(z.string())).optional(),
  normalized_roles: z.array(z.string()).optional(),
  sum_fixed: fractionStringSchema.optional(),
  sum_fixed_normalized: fractionStringSchema.optional(),
  sum_final: fractionStringSchema.optional(),
  residual_before_asaba: fractionStringSchema.optional(),
  residual_consumed: fractionStringSchema.optional(),
  traces: z.array(z.unknown()).optional(),
  audit: z.record(z.string(), z.unknown()).optional(),
  explain: z.object({
    steps: z.array(z.unknown()).optional(),
  }).optional(),
}).passthrough();

const calcSuccessResponseSchema = z.object({
  ok: z.literal(true),
  output: calcOutputSchema,
});

const calcErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  debug: z.string().optional(),
});

/**
 * B-003: CalcResponseSchema
 * Contrato estricto de la respuesta de `calc.php`.
 */
export const calcResponseSchema = z.discriminatedUnion('ok', [
  calcSuccessResponseSchema,
  calcErrorResponseSchema,
]);

// Zod como SOT (Single Source of Truth)
export type CalcRole = z.infer<typeof calcRoleSchema>;
export type CalcPayload = z.infer<typeof calcPayloadSchema>;
export type CalcHeir = z.infer<typeof calcHeirSchema>;
export type CalcOutput = z.infer<typeof calcOutputSchema>;
export type CalcResponse = z.infer<typeof calcResponseSchema>;
