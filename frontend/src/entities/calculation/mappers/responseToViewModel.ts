import type { CalcOutput } from '../schema';

export interface ShareViewModel {
  roleId: string;
  count: number;
  groupFraction: string;
  individualFraction?: string;
  amount?: string;
  isFixed: boolean;
  isAsaba: boolean;
}

export interface ResultsViewModel {
  executiveSummary: {
    totalBeneficiaryGroups: number;
    estateValue?: number;
    currency?: string;
    resolutionType?: string;
  };
  shares: ShareViewModel[];
  blocksAndWarnings: string[];
  auditLog: {
    phaseLedger?: unknown[];
    steps?: unknown[];
  };
}

const GROUP_TO_INPUT_CANDIDATES: Record<string, string[]> = {
  wives: ['wife'],
  sons: ['son'],
  daughters: ['daughter'],
  sons_sons: ['sons_son'],
  sons_daughters: ['sons_daughter'],
  full_brothers: ['full_brother'],
  full_sisters: ['full_sister'],
  consanguine_brothers: ['consanguine_brother'],
  consanguine_sisters: ['consanguine_sister'],
  uterine_brothers: ['uterine_brother'],
  uterine_sisters: ['uterine_sister'],
}

function toNumber(value: string | number | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function warningToMessage(warning: unknown): string {
  if (typeof warning === 'string') return warning;
  if (warning && typeof warning === 'object' && 'message' in warning) {
    const message = warning.message;
    if (typeof message === 'string' && message.trim() !== '') return message;
  }
  return 'Warning';
}

function countForRole(output: CalcOutput, roleId: string): number {
  const heirs = output.input?.heirs ?? [];
  const candidates = [
    roleId,
    ...(GROUP_TO_INPUT_CANDIDATES[roleId] ?? []),
  ];

  let total = 0;
  for (const candidate of candidates) {
    for (const heir of heirs) {
      if (heir.role === candidate) total += heir.count;
    }
  }

  return total > 0 ? total : 1;
}

/**
 * Mapper B-005
 * Convierte el inmenso CalcOutput técnico en un objeto limpio 
 * orientado a consumir directamente por los componentes React.
 */
export function mapResponseToViewModel(output: CalcOutput): ResultsViewModel {
  const finalGroups = output.shares?.final?.groups || {};
  const finalIndividuals = output.shares?.final?.individuals || {};
  const amountsGroup = output.amounts_by_role || {};
  const amountsIndividual = output.amounts_by_individual || {};
  
  const fixedGroups = output.shares?.fixed?.groups || {};
  const asabaGroups = output.shares?.asaba?.groups || {};

  const mappedShares: ShareViewModel[] = [];

  for (const [role, frac] of Object.entries(finalGroups)) {
    const isFixed = role in fixedGroups;
    const isAsaba = role in asabaGroups;
    
    // Obtener counts desde input heirs
    const count = countForRole(output, role);

    // Si hay > 1, el individuo tiene su fracción
    let indivFrac: string | undefined;
    if (finalIndividuals[role] && finalIndividuals[role].length > 0) {
       indivFrac = finalIndividuals[role][0]; // asumiendo reparto parejo
    }

    // Amount individual 
    let amountStr: string | undefined;
    if (amountsIndividual[role] && amountsIndividual[role].length > 0) {
      amountStr = amountsIndividual[role][0];
    } else if (amountsGroup[role]) {
      amountStr = amountsGroup[role];
    }

    mappedShares.push({
      roleId: role,
      count,
      groupFraction: frac,
      individualFraction: indivFrac,
      amount: amountStr,
      isFixed,
      isAsaba
    });
  }

  const result: ResultsViewModel = {
    executiveSummary: {
      totalBeneficiaryGroups: mappedShares.length,
      estateValue: toNumber(output.input?.estate_value),
      currency: output.input?.currency,
      resolutionType: output.meta?.residual_policy || 'standard',
    },
    shares: mappedShares,
    blocksAndWarnings: (output.warnings || []).map(warningToMessage),
    auditLog: {
      phaseLedger: output.meta?.phase_ledger || [],
      steps: output.explain?.steps || []
    }
  };

  return result;
}
