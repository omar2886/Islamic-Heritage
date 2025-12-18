import { humanize } from './roles.js';

const ROLE_SEX = {
  wife: 'F',
  husband: 'M',
  daughter: 'F',
  mother: 'F',
  maternal_grandmother: 'F',
  maternal_great_grandmother: 'F',
  paternal_grandmother: 'F',
  paternal_great_grandmother: 'F',
  sons_daughter: 'F',
  full_sister: 'F',
  consanguine_sister: 'F',
  uterine_sister: 'F',
  son: 'M',
  father: 'M',
  paternal_grandfather: 'M',
  sons_son: 'M',
  full_brother: 'M',
  consanguine_brother: 'M',
  uterine_brother: 'M',
  paternal_uncle: 'M',
  paternal_uncle_son: 'M',
  consanguine_paternal_uncle: 'M',
  consanguine_paternal_uncle_son: 'M',
};

function validateState(state, roles = []) {
  const errors = [];
  const warnings = [];
  const catalog = new Set(Array.isArray(roles) ? roles.map((role) => role.code) : []);

  if (!state?.deceased?.sex) {
    errors.push('El sexo del causante es obligatorio.');
  }

  const seen = new Set();

  state?.heirs?.forEach((heir, index) => {
    const row = index + 1;
    const name = (heir.name || '').trim();
    const role = (heir.role || '').trim();
    const sex = (heir.sex || '').toString().trim().toUpperCase();
    const count = Number.parseInt(heir.count, 10);

    if (!name) {
      errors.push(`Heredero #${row}: el nombre es obligatorio.`);
    }

    if (!Number.isInteger(count) || count < 1 || count > 20) {
      errors.push(`Heredero #${row}: la cantidad debe ser un entero entre 1 y 20.`);
    }

    if (!role) {
      errors.push(`Heredero #${row}: el rol es obligatorio.`);
    } else if (catalog.size > 0 && !catalog.has(role)) {
      errors.push(`Heredero #${row}: el rol "${humanize(role)}" no existe en el catálogo.`);
    }

    const expectedSex = ROLE_SEX[role];
    if (expectedSex && sex && expectedSex !== sex) {
      errors.push(`Heredero #${row}: el rol "${humanize(role)}" requiere sexo ${expectedSex}.`);
    }

    if (role && sex && name) {
      const key = `${role.toLowerCase()}|${sex}|${name.toLowerCase()}`;
      if (seen.has(key)) {
        warnings.push(`Heredero duplicado detectado: ${humanize(role)} (${sex}) · ${name}.`);
      }
      seen.add(key);
    }
  });

  return { errors, warnings };
}

export { validateState };
