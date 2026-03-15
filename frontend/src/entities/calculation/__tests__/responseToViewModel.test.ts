import { describe, it, expect } from 'vitest';
import { mapResponseToViewModel } from '../mappers/responseToViewModel';
import type { CalcOutput } from '../schema';

describe('B-005 mapper: CalcResponse -> ResultsViewModel', () => {
  it('debe aplanar el payload técnico en un viewModel consumible por react', () => {
    const mockOutput: CalcOutput = {
      input: {
        heirs: [{ role: 'daughter', count: 2 }],
        estate_value: 100000,
        currency: 'EUR'
      },
      meta: {
        residual_policy: 'radd'
      },
      shares: {
        fixed: {
          groups: { 'daughter': '2/3' },
          individuals: { 'daughter': ['1/3', '1/3'] }
        },
        asaba: {},
        final: {
          groups: { 'daughter': '1/1' },
          individuals: { 'daughter': ['1/2', '1/2'] }
        }
      },
      amounts_by_role: { 'daughter': '100000' },
      amounts_by_individual: { 'daughter': ['50000', '50000'] }
    };

    const vm = mapResponseToViewModel(mockOutput);

    // Assert Executive
    expect(vm.executiveSummary.resolutionType).toBe('radd');
    expect(vm.executiveSummary.totalBeneficiaryGroups).toBe(1);
    
    // Assert Shares Array (cleaner to map over in UI)
    expect(vm.shares).toHaveLength(1);
    expect(vm.shares[0].roleId).toBe('daughter');
    expect(vm.shares[0].count).toBe(2);
    expect(vm.shares[0].groupFraction).toBe('1/1'); // Due to radd
    expect(vm.shares[0].individualFraction).toBe('1/2');
    expect(vm.shares[0].amount).toBe('50000'); // Individual amount prioritized
    expect(vm.shares[0].isFixed).toBe(true);
    expect(vm.shares[0].isAsaba).toBe(false);
  });

  it('debe reconciliar nombres de grupo finales con roles de entrada equivalentes', () => {
    const mockOutput: CalcOutput = {
      input: {
        heirs: [{ role: 'wives', count: 3 }],
      },
      shares: {
        final: {
          groups: { wives: '1/8' },
          individuals: { wives: ['1/24', '1/24', '1/24'] },
        },
      },
      amounts_by_individual: { wives: ['100', '100', '100'] },
    };

    const vm = mapResponseToViewModel(mockOutput);

    expect(vm.shares).toHaveLength(1);
    expect(vm.shares[0].roleId).toBe('wives');
    expect(vm.shares[0].count).toBe(3);
    expect(vm.shares[0].individualFraction).toBe('1/24');
    expect(vm.shares[0].amount).toBe('100');
  });
});
