const COLLATERAL_ROLES = new Set([
  'full_brother',
  'full_sister',
  'consanguine_brother',
  'consanguine_sister',
  'uterine_brother',
  'uterine_sister',
  'paternal_uncle',
  'paternal_uncle_son',
  'paternal_uncle_sons_daughter',
  'paternal_uncles_daughter',
  'consanguine_paternal_uncle',
  'consanguine_paternal_uncle_son',
  'consanguine_paternal_uncle_sons_daughter',
  'consanguine_paternal_uncles_daughter',
]);

const CORE_ROLES = new Set([
  'husband',
  'wife',
  'father',
  'mother',
  'son',
  'daughter',
  'sons_son',
  'sons_daughter',
]);

const createWarning = (code, message, roles = []) => ({
  code,
  message,
  roles,
});

export function evaluateSoftWarnings({ selections = {}, enabledRoles = [], sections = {} } = {}) {
  const warnings = [];
  const normalizedSelections = selections || {};
  const selectionKeys = Object.keys(normalizedSelections);
  const enabledSet = new Set(enabledRoles || []);

  if (selectionKeys.length === 0) {
    warnings.push(
      createWarning('empty', 'Agrega al menos un rol para continuar con el cálculo.', []),
    );
    return warnings;
  }

  const hasCore = selectionKeys.some((role) => CORE_ROLES.has(role));
  const hasCollaterals = selectionKeys.some((role) => COLLATERAL_ROLES.has(role));
  const hasCouple = normalizedSelections.husband || normalizedSelections.wife;
  const hasDescendants = ['son', 'daughter', 'sons_son', 'sons_daughter'].some(
    (role) => normalizedSelections[role],
  );

  if (hasCollaterals && !hasCore) {
    warnings.push(
      createWarning(
        'collaterals_without_core',
        'Agregaste colaterales sin definir descendencia, cónyuge o ascendientes. Verifica que el núcleo directo esté completo.',
        selectionKeys.filter((role) => COLLATERAL_ROLES.has(role)),
      ),
    );
  }

  if (hasCouple && !hasDescendants && !sections.descendants) {
    warnings.push(
      createWarning(
        'no_descendants_section',
        'Desactivaste la sección de descendencia; confirma que realmente no hay hijos o nietos.',
        ['descendants'],
      ),
    );
  }

  const limitReached =
    typeof normalizedSelections.wife === 'number' && normalizedSelections.wife >= 4;
  if (limitReached) {
    warnings.push(
      createWarning(
        'wives_limit',
        'Registraste 4 esposas; el motor rechazará automáticamente intentos de agregar más.',
        ['wife'],
      ),
    );
  }

  const disabledEnabledGap = selectionKeys.filter((role) => !enabledSet.has(role));
  if (disabledEnabledGap.length > 0) {
    warnings.push(
      createWarning(
        'disabled_roles',
        'Algunas selecciones quedarán sin efecto porque el asistente las deshabilitó.',
        disabledEnabledGap,
      ),
    );
  }

  return warnings;
}
