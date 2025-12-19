import { ROLE_CATALOG } from './roles.js';

const SPOUSE_ROLES = ['husband', 'wife'];

const ROLE_LIMITS = {
  husband: 1,
  wife: 4,
  father: 1,
  mother: 1,
  paternal_grandfather: 1,
  maternal_grandmother: 1,
  paternal_grandmother: 1,
  paternal_great_grandmother: 1,
  maternal_great_grandmother: 1,
};

const buildSectionIndex = () => {
  const index = {};
  ROLE_CATALOG.forEach((item) => {
    index[item.id] = item.section;
  });
  return index;
};

const SECTION_INDEX = buildSectionIndex();

const normalizeSelection = (selections = {}) => {
  const normalized = {};
  Object.entries(selections || {}).forEach(([roleId, value]) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return;
    normalized[roleId] = parsed;
  });
  return normalized;
};

const addBlock = (hardBlocks, code, message, roles = []) => {
  const uniqueRoles = Array.from(new Set(roles.filter(Boolean)));
  hardBlocks.push({ code, message, roles: uniqueRoles });
};

const clampCount = (hardBlocks, cleanedSelections, roleId, limit, message) => {
  const current = cleanedSelections[roleId];
  if (typeof current !== 'number') return;
  if (current <= limit) return;
  cleanedSelections[roleId] = limit;
  addBlock(hardBlocks, `limit:${roleId}`, message, [roleId]);
};

export function evaluateHardRules({ selections = {}, sections = {}, lastTouchedRole = null } = {}) {
  const cleanedSelections = normalizeSelection(selections);
  const hardBlocks = [];
  const disabledRoles = new Set();

  const enabledSections = new Set(
    Object.entries(sections || {})
      .filter(([, enabled]) => !!enabled)
      .map(([id]) => id),
  );

  // Drop anything that lives in a disabled section (defensive, should already be sanitized).
  Object.keys(cleanedSelections).forEach((roleId) => {
    const section = SECTION_INDEX[roleId];
    if (section && !enabledSections.has(section)) {
      delete cleanedSelections[roleId];
      addBlock(
        hardBlocks,
        `section:${section}`,
        'Se eliminó un rol de una sección desactivada.',
        [roleId],
      );
    }
  });

  SPOUSE_ROLES.forEach((role) => {
    clampCount(
      hardBlocks,
      cleanedSelections,
      role,
      ROLE_LIMITS[role],
      role === 'wife'
        ? 'Máximo 4 esposas permitidas.'
        : 'Solo puede haber un cónyuge activo.',
    );
  });

  const activeSpouses = SPOUSE_ROLES.filter((role) => cleanedSelections[role]);
  if (activeSpouses.length > 1) {
    const preferred = SPOUSE_ROLES.includes(lastTouchedRole) ? lastTouchedRole : activeSpouses[0];
    const removed = activeSpouses.filter((role) => role !== preferred);
    removed.forEach((role) => delete cleanedSelections[role]);
    addBlock(
      hardBlocks,
      'exclusive:spouse',
      'Elige esposo o esposa, pero no ambos.',
      activeSpouses,
    );
  }

  Object.entries(ROLE_LIMITS).forEach(([roleId, limit]) => {
    if (SPOUSE_ROLES.includes(roleId)) return;
    clampCount(
      hardBlocks,
      cleanedSelections,
      roleId,
      limit,
      'Este rol solo puede aparecer una vez.',
    );
  });

  if (cleanedSelections.husband) disabledRoles.add('wife');
  if (cleanedSelections.wife) disabledRoles.add('husband');

  return {
    cleanedSelections,
    hardBlocks,
    disabledRoles,
  };
}
