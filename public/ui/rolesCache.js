import { safeStringify } from "./dom.js";
import { ApiClient } from "./apiClient.js";

/**
 * API pública funcional requerida:
 * - getRoles(): Promise<string[]>
 * - findRole(candidates: string[]): string | null
 * - assertRole(candidates: string[]): string
 *
 * Implementación: cache en memoria con estado privado de módulo.
 */

const api = new ApiClient({ baseApiPath: "../api", timeoutMs: 12000 });

let _roles = null;
let _loading = null;

export async function getRoles() {
  if (Array.isArray(_roles)) return _roles;
  if (_loading) return _loading;

  _loading = (async () => {
    const roles = await api.getRoles();
    if (!Array.isArray(roles)) throw new Error("roles must be an array");
    _roles = roles.map(String);
    _loading = null;
    return _roles;
  })().catch((e) => {
    _loading = null;
    throw e;
  });

  return _loading;
}

export function findRole(candidates) {
  if (!Array.isArray(_roles)) return null;
  const set = new Set(_roles);
  for (const c of candidates) {
    const s = String(c);
    if (set.has(s)) return s;
  }
  return null;
}

export function assertRole(candidates) {
  if (!Array.isArray(_roles)) {
    // Error distinto: catálogo no cargado aún.
    // Mensaje debe ser exacto y no debe mezclarse con "Role not found".
    throw new Error("call await getRoles() first");
  }

  const found = findRole(candidates);
  if (found) return found;

  const preview = _roles.slice(0, 60);
  const msg =
    `Role not found. candidates=${safeStringify(candidates, false)} ` +
    `catalog_preview(count=${_roles.length})=${safeStringify(preview, false)}`;
  const err = new Error(msg);
  err.candidates = candidates;
  err.catalogCount = _roles.length;
  err.catalogPreview = preview;
  throw err;
}
