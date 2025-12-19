import { apiFetch } from './client.js';

const ROLES_ENDPOINT = '/api/roles.php';
const ESTATE_REGEX = /^[0-9]{1,18}(\.[0-9]{1,6})?$/;

export async function fetchRolesCatalog() {
  const response = await apiFetch(ROLES_ENDPOINT, { method: 'GET', cache: 'no-store' });

  if (!response || typeof response !== 'object') {
    throw new Error('Respuesta inesperada del catálogo de roles');
  }

  const { ok, roles, count } = response;

  if (ok !== true || !Array.isArray(roles)) {
    throw new Error('El catálogo de roles no está disponible');
  }

  return {
    roles: roles.map((role) => String(role)),
    count: typeof count === 'number' ? count : roles.length,
  };
}

const trimTrailingZeros = (value) => value.replace(/\.?0+$/, '').replace(/\.$/, '');

export function normalizeEstateValue(raw) {
  if (raw === undefined) return { value: undefined };

  let normalized = null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    normalized = trimTrailingZeros(raw.toFixed(6));
  } else if (typeof raw === 'string') {
    normalized = raw.trim();

    if (normalized !== '' && !normalized.includes('.') && normalized.includes(',')) {
      normalized = normalized.replace(',', '.');
    }
  }

  if (normalized === null || normalized === '') {
    return { value: null, error: 'estate_value inválido' };
  }

  if (!ESTATE_REGEX.test(normalized)) {
    return { value: null, error: 'estate_value inválido' };
  }

  const [intPart, decimalPart = ''] = normalized.split('.');

  if (
    intPart.length === 18 &&
    intPart === '999999999999999999' &&
    decimalPart !== '' &&
    Number.parseInt(decimalPart, 10) > 0
  ) {
    return { value: null, error: 'estate_value inválido' };
  }

  return { value: normalized };
}
