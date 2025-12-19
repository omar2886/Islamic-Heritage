import { normalizeEstateValue } from '../api/contract.js';
import { ROLE_SET, roleLabel } from './roles.js';

const ALLOWED_FLAGS = ['--explain', '--audit'];
const ALLOWED_SEX = new Set(['male', 'female', 'unknown']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const coerceCount = (raw) => {
  if (Number.isInteger(raw)) return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return Number.parseInt(raw, 10);
  return null;
};

export function validatePayloadStructure(candidate) {
  const errors = [];
  const clean = {};

  if (!isObject(candidate)) {
    return { errors: ['El payload debe ser un objeto'], payload: null };
  }

  const { heirs } = candidate;

  if (!Array.isArray(heirs) || heirs.length === 0) {
    errors.push('Agrega al menos un heredero');
  } else {
    const seenOrder = [];
    const aggregated = new Map();

    heirs.forEach((entry, index) => {
      if (!isObject(entry)) {
        errors.push(`Heredero inválido en posición ${index + 1}`);
        return;
      }

      const rawRole = typeof entry.role === 'string' ? entry.role.trim() : '';

      if (!rawRole) {
        errors.push(`Rol faltante en el heredero ${index + 1}`);
        return;
      }

      if (!ROLE_SET.has(rawRole)) {
        errors.push(`Rol desconocido: ${rawRole}`);
        return;
      }

      const count = coerceCount(entry.count);

      if (count === null) {
        errors.push(`Cantidad inválida para ${roleLabel(rawRole)} (posición ${index + 1})`);
        return;
      }

      if (count < 1 || count > 100) {
        errors.push(`Cantidad fuera de rango para ${roleLabel(rawRole)} (1-100)`);
        return;
      }

      if (!aggregated.has(rawRole)) {
        seenOrder.push(rawRole);
        aggregated.set(rawRole, 0);
      }

      aggregated.set(rawRole, aggregated.get(rawRole) + count);
    });

    seenOrder.forEach((role) => {
      const total = aggregated.get(role);

      if (total > 100) {
        errors.push(`El total para ${roleLabel(role)} excede el máximo (100)`);
      }
    });

    if (errors.length === 0) {
      clean.heirs = seenOrder.map((role) => ({ role, count: aggregated.get(role) }));
    }
  }

  if (Object.prototype.hasOwnProperty.call(candidate, 'estate_value')) {
    const normalized = normalizeEstateValue(candidate.estate_value);

    if (normalized.error) {
      errors.push(normalized.error);
    } else if (normalized.value !== undefined) {
      clean.estate_value = normalized.value;
    }
  }

  if (Object.prototype.hasOwnProperty.call(candidate, 'currency')) {
    const raw = candidate.currency;

    if (typeof raw !== 'string') {
      errors.push('currency debe ser un texto de 3 letras mayúsculas');
    } else {
      const cleaned = raw.trim().toUpperCase();

      if (!/^[A-Z]{3}$/.test(cleaned)) {
        errors.push('currency debe ser un texto de 3 letras mayúsculas');
      } else {
        clean.currency = cleaned;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(candidate, 'ui_meta')) {
    const meta = candidate.ui_meta;

    if (!isObject(meta)) {
      errors.push('ui_meta debe ser un objeto');
    } else {
      const normalizedMeta = {};

      if (Object.prototype.hasOwnProperty.call(meta, 'sex')) {
        const sex = typeof meta.sex === 'string' ? meta.sex.trim() : '';

        if (!ALLOWED_SEX.has(sex)) {
          errors.push('ui_meta.sex debe ser male, female o unknown');
        } else {
          normalizedMeta.sex = sex;
        }
      }

      if (Object.prototype.hasOwnProperty.call(meta, 'decedentId')) {
        const decedentId = typeof meta.decedentId === 'string' ? meta.decedentId.trim() : '';

        if (decedentId.length > 32) {
          errors.push('ui_meta.decedentId no puede exceder 32 caracteres');
        } else if (decedentId !== '' && !/^P\d+$/.test(decedentId)) {
          errors.push('ui_meta.decedentId debe iniciar con P y dígitos');
        } else {
          normalizedMeta.decedentId = decedentId;
        }
      }

      if (Object.prototype.hasOwnProperty.call(meta, 'source')) {
        const source = typeof meta.source === 'string' ? meta.source.trim() : '';

        if (source.length > 40) {
          errors.push('ui_meta.source no puede exceder 40 caracteres');
        } else {
          normalizedMeta.source = source;
        }
      }

      if (Object.keys(normalizedMeta).length > 0) {
        clean.ui_meta = normalizedMeta;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(candidate, 'cli_flags')) {
    if (!Array.isArray(candidate.cli_flags)) {
      errors.push('cli_flags debe ser un arreglo de strings');
    } else {
      const rawFlags = candidate.cli_flags.filter((flag) => typeof flag === 'string');
      const normalizedFlags = rawFlags.filter((flag) => ALLOWED_FLAGS.includes(flag));
      const unknownFlags = rawFlags.filter((flag) => !ALLOWED_FLAGS.includes(flag));

      if (unknownFlags.length > 0) {
        errors.push(`cli_flags contiene valores no permitidos: ${unknownFlags.join(', ')}`);
      }

      if (normalizedFlags.length > 0) {
        clean.cli_flags = normalizedFlags;
      }
    }
  }

  return { errors, payload: errors.length === 0 ? clean : null };
}
