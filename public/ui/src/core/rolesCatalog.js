import { safeJson } from "../ui/dom.js";

let _roles = null;
let _loading = null;

export async function loadRoles(apiClient) {
  if (Array.isArray(_roles)) return _roles;
  if (_loading) return _loading;

  _loading = (async () => {
    const roles = await apiClient.getRoles();
    _roles = roles;
    _loading = null;
    return roles;
  })().catch((e) => {
    _loading = null;
    throw e;
  });

  return _loading;
}

export function getRolesSync() {
  return Array.isArray(_roles) ? _roles : null;
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
    throw new Error("call await loadRoles() first");
  }
  const found = findRole(candidates);
  if (found) return found;

  const preview = _roles.slice(0, 80);
  const msg =
    `Role not found. candidates=${safeJson(candidates, false)} ` +
    `catalog_preview(count=${_roles.length})=${safeJson(preview, false)}`;
  const err = new Error(msg);
  err.candidates = candidates;
  err.catalogCount = _roles.length;
  err.catalogPreview = preview;
  throw err;
}


function _extractWarnings(resp) {
  if (!resp || typeof resp !== "object") return [];
  return Array.isArray(resp.warnings) ? resp.warnings.map(String) : [];
}

function _coreInput(resp) {
  const input = resp && resp.output && resp.output.input ? resp.output.input : null;
  return input && typeof input === "object" ? input : null;
}

function _unknownWarningForRole(warnings, roleId) {
  const needle = String(roleId);
  for (const w of warnings) {
    const s = String(w);
    if (!s.toLowerCase().includes("unknown")) continue;
    if (s.includes(`'${needle}'`) || s.includes(`"${needle}"`) || s.includes(needle)) return true;
  }
  return false;
}

function _normalizedMappingFromWarnings(warnings) {
  // Best-effort parse for logs like: normalized role 'wives' from label 'wife'
  const out = [];
  for (const w of warnings) {
    const s = String(w);
    const m1 = s.match(/normalized[^']*'([^']+)'[^']*from label[^']*'([^']+)'/i);
    if (m1) {
      out.push({ to: m1[1], from: m1[2] });
      continue;
    }
    const m2 = s.match(/from label[^']*'([^']+)'[^']*to[^']*'([^']+)'/i);
    if (m2) {
      out.push({ from: m2[1], to: m2[2] });
    }
  }
  return out;
}

export async function probeCalcRoleAcceptance(apiClient, roles) {
  if (!Array.isArray(roles)) throw new Error("probeCalcRoleAcceptance expects roles array");
  const acceptedRoles = [];
  const rejectedRoles = [];
  const normalized = [];

  for (const roleId of roles) {
    const role = String(roleId);
    const count = role === "wife" ? 2 : 1;

    let resp = null;
    try {
      resp = await apiClient.postCalc({
        heirs: [{ role, count }],
        ui_meta: { probe: true, role }
      });
    } catch (e) {
      rejectedRoles.push(role);
      continue;
    }

    const warnings = _extractWarnings(resp);
    const input = _coreInput(resp);

    let rejected = false;

    if (_unknownWarningForRole(warnings, role)) {
      rejected = true;
    } else if (input && Array.isArray(input.heirs) && input.heirs.length === 1) {
      const r = String(input.heirs[0]?.role || "");
      if (r.toLowerCase() === "unknown") rejected = true;
    }

    if (rejected) {
      rejectedRoles.push(role);
    } else {
      acceptedRoles.push(role);
      normalized.push(..._normalizedMappingFromWarnings(warnings));
    }
  }

  // De-dup normalized list
  const normUniq = [];
  const seen = new Set();
  for (const n of normalized) {
    const key = `${n.from}=>${n.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normUniq.push(n);
  }

  return {
    probedAt: new Date().toISOString(),
    acceptedRoles,
    rejectedRoles,
    normalized: normUniq
  };
}
