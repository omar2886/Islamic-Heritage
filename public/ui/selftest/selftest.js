function nowIso() {
  return new Date().toISOString();
}

function safeJson(v) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = String(v);
    else if (k === "html") n.innerHTML = String(v);
    else n.setAttribute(k, String(v));
  }
  for (const c of (Array.isArray(children) ? children : [children])) {
    if (c == null) continue;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return n;
}

function setChildren(node, children) {
  node.textContent = "";
  for (const c of children) node.appendChild(c);
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readBody(resp) {
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  const text = await resp.text();
  if (ct.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return { parse_error: true, raw: text };
    }
  }
  return { raw: text };
}

function findValuePaths(root, targetValue) {
  const paths = [];
  const seen = new Set();

  function walk(node, path) {
    if (node && typeof node === "object") {
      if (seen.has(node)) return;
      seen.add(node);

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          walk(node[i], `${path}[${i}]`);
        }
        return;
      }

      for (const k of Object.keys(node)) {
        const next = path ? `${path}.${k}` : k;
        walk(node[k], next);
      }
      return;
    }

    if (node === targetValue) {
      paths.push(path || "<root>");
    }
  }

  walk(root, "");
  return paths;
}

function heirsToMap(heirs) {
  const map = Object.create(null);
  for (const h of Array.isArray(heirs) ? heirs : []) {
    if (!h) continue;
    const role = String(h.role ?? "").trim();
    if (!role) continue;
    const count = Number(h.count);
    const n = Number.isFinite(count) ? count : 0;
    map[role] = (map[role] || 0) + n;
  }
  return map;
}

function diffMaps(a, b) {
  const missing = [];
  const extra = [];
  const mismatched = [];

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  const bSet = new Set(bKeys);

  for (const k of aKeys) {
    if (!bSet.has(k)) missing.push(k);
    else if (Number(a[k]) !== Number(b[k])) mismatched.push({ role: k, a: a[k], b: b[k] });
  }

  const aSet = new Set(aKeys);
  for (const k of bKeys) {
    if (!aSet.has(k)) extra.push(k);
  }

  return { ok: missing.length === 0 && extra.length === 0 && mismatched.length === 0, missing, extra, mismatched };
}

function okBadge(text) {
  return el("span", { class: "banner ok", text });
}
function failBadge(text) {
  return el("span", { class: "banner error", text });
}

function warnBadge(text) {
  return el("span", { class: "banner warn", text: text || "WARN" });
}


function row(name, statusNode, detail) {
  const detailText = typeof detail === "string" ? detail : safeJson(detail);
  return el("div", { class: "card" }, [
    el("h2", { text: name }),
    statusNode,
    el("div", { class: "monoBox" }, [el("pre", { class: "mono", text: detailText })])
  ]);
}

const mount = document.querySelector("#mount");
const logEl = document.querySelector("#log");

const baseApi = "../../api";
const urls = {
  roles: `${baseApi}/roles.php`,
  calc: `${baseApi}/calc.php`
};

function log(line) {
  logEl.textContent += line + "\n";
}

async function check1_roles() {
  const t0 = performance.now();
  const resp = await fetchWithTimeout(urls.roles, { method: "GET", headers: { Accept: "application/json" } }, 12000);
  const body = await readBody(resp);
  const t1 = performance.now();

  const okShape = resp.ok && body && body.ok === true && Array.isArray(body.roles);
  const detail = safeJson({
    url: urls.roles,
    httpStatus: resp.status,
    ms: Math.round(t1 - t0),
    okShape,
    bodyPreview: okShape ? { ok: body.ok, rolesCount: body.roles.length, first: body.roles.slice(0, 30) } : body
  });

  log(`[${nowIso()}] roles status=${resp.status} okShape=${okShape}`);

  return { ok: okShape, detail, roles: okShape ? body.roles.map(String) : null, httpStatus: resp.status };
}

function chooseRole(roles) {
  const prefer = ["mother", "father", "son", "daughter", "wife", "husband"];
  for (const p of prefer) {
    if (roles.includes(p)) return p;
  }
  return roles[0] || null;
}

function extractCoreInput(body) {
  const input = body && body.output && body.output.input ? body.output.input : null;
  return input && typeof input === "object" ? input : null;
}

function validateNoUnknownRoles(map, rolesSet) {
  const unknown = [];
  for (const r of Object.keys(map)) {
    if (!rolesSet.has(r)) unknown.push(r);
  }
  return unknown.sort();
}


function getCoreGroupLabels(resp) {
  const set = new Set();
  const nr = resp && resp.output && Array.isArray(resp.output.normalized_roles) ? resp.output.normalized_roles : null;
  if (nr) for (const v of nr) set.add(String(v));
  const warnings = resp && Array.isArray(resp.warnings) ? resp.warnings : null;
  if (warnings) {
    for (const w of warnings) {
      const s = String(w);
      if (!s.toLowerCase().includes("normaliz")) continue;
      for (const m of s.matchAll(/'([^']+)'/g)) set.add(m[1]);
      for (const m of s.matchAll(/"([^"]+)"/g)) set.add(m[1]);
    }
  }
  return set;
}

async function postCalc(payload) {
  const bodyText = JSON.stringify(payload);
  const t0 = performance.now();
  const resp = await fetchWithTimeout(
    urls.calc,
    { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: bodyText },
    12000
  );
  const body = await readBody(resp);
  const t1 = performance.now();

  return { resp, body, ms: Math.round(t1 - t0), sentBodyText: bodyText };
}

async function check2_calc_valid(roles) {
  const role = chooseRole(roles);
  const payload = {
    heirs: [{ role, count: 1 }],
    ui_meta: { sex: "male", source: "selftest" }
  };

  const { resp, body, ms } = await postCalc(payload);
  const okResp = resp.ok && body && body.ok === true;

  const detail = safeJson({
    url: urls.calc,
    httpStatus: resp.status,
    ms,
    roleUsed: role,
    okResp,
    bodyPreview: okResp ? { ok: body.ok, hasOutput: !!body.output, outputKeys: body.output ? Object.keys(body.output).slice(0, 30) : [] } : body
  });

  log(`[${nowIso()}] calc valid status=${resp.status} okResp=${okResp} role=${role}`);

  return { ok: okResp, detail, httpStatus: resp.status };
}

async function check3_calc_invalid_expect_400() {
  const payload = { not_heirs: true };

  const { resp, body, ms } = await postCalc(payload);
  const ok400 = resp.status === 400;

  const detail = safeJson({
    url: urls.calc,
    expectedHttpStatus: 400,
    httpStatus: resp.status,
    ms,
    body
  });

  log(`[${nowIso()}] calc invalid status=${resp.status} expected=400`);

  return { ok: ok400, detail, httpStatus: resp.status };
}

async function check4_calc_roles_roundtrip(roles) {
  const rolesSet = new Set(roles);

  const required = ["sons_son", "full_brother"];
  const missingRequired = required.filter((r) => !rolesSet.has(r));
  if (missingRequired.length > 0) {
    const detail = safeJson({
      required,
      missingRequired,
      note: "Catalog does not contain required roles; cannot run deterministic roundtrip check."
    });
    log(`[${nowIso()}] roundtrip skip missingRequired=${missingRequired.join(",")}`);
    return { ok: false, skipped: true, detail };
  }

  const payload = {
    heirs: [
      { role: "sons_son", count: 1 },
      { role: "full_brother", count: 1 }
    ],
    ui_meta: { sex: "male", source: "selftest" }
  };

  const { resp, body, ms, sentBodyText } = await postCalc(payload);
  const okResp = resp.ok && body && body.ok === true;

  const coreInput = extractCoreInput(body);

  const sentMap = heirsToMap(payload.heirs);
  const coreMap = heirsToMap(coreInput && coreInput.heirs);

  const diff = diffMaps(sentMap, coreMap);
  const unknownSent = validateNoUnknownRoles(sentMap, rolesSet);
  const coreGroupLabels = getCoreGroupLabels(body);
  const unknownCoreRaw = validateNoUnknownRoles(coreMap, rolesSet);
  const unknownCore = unknownCoreRaw.filter((r) => !coreGroupLabels.has(r));

  const wivesPaths = findValuePaths(body, "wives");

  const okAll =
    okResp &&
    diff.ok &&
    unknownSent.length === 0 &&
    unknownCore.length === 0;

  const detail = safeJson({
    url: urls.calc,
    httpStatus: resp.status,
    ms,
    okResp,
    sentBodyText,
    expectedHeirs: payload.heirs,
    coreInput,
    diff,
    unknownRoles: {
      sent: unknownSent,
      coreInputUnknownRaw: unknownCoreRaw,
      coreInputUnknownNotGroupLabels: unknownCore,
      coreGroupLabels: Array.from(coreGroupLabels).sort()
    },
    wivesPathsInResponse: wivesPaths
  });

  log(`[${nowIso()}] roundtrip status=${resp.status} okAll=${okAll}`);

  return { ok: okAll, detail, httpStatus: resp.status };
}



async function check5_calc_roles_roundtrip_extended(roles) {
  const rolesSet = new Set(roles);

  const required = ["sons_son", "full_brother", "paternal_uncle"];
  const missingRequired = required.filter((r) => !rolesSet.has(r));
  if (missingRequired.length > 0) {
    const detail = safeJson({
      required,
      missingRequired,
      note: "Catalog does not contain required roles; cannot run deterministic extended roundtrip check."
    });
    log(`[${nowIso()}] roundtrip extended skip missingRequired=${missingRequired.join(",")}`);
    return { ok: false, skipped: true, detail };
  }

  const payload = {
    heirs: [
      { role: "sons_son", count: 1 },
      { role: "full_brother", count: 1 },
      { role: "paternal_uncle", count: 1 }
    ],
    ui_meta: { sex: "male", source: "selftest" }
  };

  const { resp, body, ms, sentBodyText } = await postCalc(payload);
  const okResp = resp.ok && body && body.ok === true;

  const coreInput = extractCoreInput(body);

  const sentMap = heirsToMap(payload.heirs);
  const coreMap = heirsToMap(coreInput && coreInput.heirs);

  const diff = diffMaps(sentMap, coreMap);
  const unknownSent = validateNoUnknownRoles(sentMap, rolesSet);
  const coreGroupLabels = getCoreGroupLabels(body);
  const unknownCoreRaw = validateNoUnknownRoles(coreMap, rolesSet);
  const unknownCore = unknownCoreRaw.filter((r) => !coreGroupLabels.has(r));

  const wivesPaths = findValuePaths(body, "wives");

  const okAll =
    okResp &&
    diff.ok &&
    unknownSent.length === 0 &&
    unknownCore.length === 0;

  const detail = safeJson({
    url: urls.calc,
    httpStatus: resp.status,
    ms,
    okResp,
    sentBodyText,
    expectedHeirs: payload.heirs,
    coreInput,
    diff,
    unknownRoles: {
      sent: unknownSent,
      coreInputUnknownRaw: unknownCoreRaw,
      coreInputUnknownNotGroupLabels: unknownCore,
      coreGroupLabels: Array.from(coreGroupLabels).sort()
    },
    wivesPathsInResponse: wivesPaths
  });

  log(`[${nowIso()}] roundtrip extended status=${resp.status} okAll=${okAll}`);

  return { ok: okAll, detail, httpStatus: resp.status };
}




async function run() {
  log(`Selftest start ${nowIso()}`);
  log(`Resolved URLs: roles=${urls.roles} calc=${urls.calc}`);

  const items = [];

  try {
    const r1 = await check1_roles();
    items.push(row("1) GET roles.php", r1.ok ? okBadge("OK") : failBadge("FAIL"), r1.detail));

    if (!r1.roles || r1.roles.length === 0) {
      items.push(row("2) POST calc.php (valid)", failBadge("SKIP"), "No roles loaded, cannot build valid payload."));
      items.push(row("3) POST calc.php (invalid expects 400)", failBadge("SKIP"), "No roles loaded."));
      items.push(row("4) Roundtrip roles (sons_son + full_brother)", failBadge("SKIP"), "No roles loaded."));
      items.push(row("5) Roundtrip roles (sons_son + full_brother + paternal_uncle)", failBadge("SKIP"), "No roles loaded."));
      setChildren(mount, items);
      return;
    }

    const r2 = await check2_calc_valid(r1.roles);
    items.push(row("2) POST calc.php payload válido", r2.ok ? okBadge("OK") : failBadge("FAIL"), r2.detail));

    const r3 = await check3_calc_invalid_expect_400();
    items.push(row("3) POST calc.php payload inválido (espera 400)", r3.ok ? okBadge("OK") : failBadge("FAIL"), r3.detail));

    const r4 = await check4_calc_roles_roundtrip(r1.roles);
    if (r4.skipped) {
      items.push(row("4) Roundtrip roles (sons_son + full_brother)", failBadge("SKIP"), r4.detail));
    } else {
      items.push(row("4) Roundtrip roles (sons_son + full_brother)", r4.ok ? okBadge("OK") : failBadge("FAIL"), r4.detail));
    }

    const r5 = await check5_calc_roles_roundtrip_extended(r1.roles);

    if (r5.skipped) {
      items.push(row("5) Roundtrip roles (sons_son + full_brother + paternal_uncle)", failBadge("SKIP"), r5.detail));
    } else {
      items.push(row("5) Roundtrip roles (sons_son + full_brother + paternal_uncle)", r5.ok ? okBadge("OK") : failBadge("FAIL"), r5.detail));
    }



  } catch (e) {
    items.push(row("Selftest fatal", failBadge("FAIL"), String(e?.stack || e?.message || e)));
    log(`[${nowIso()}] fatal ${String(e?.message || e)}`);
  }

  setChildren(mount, items);
  log(`Selftest end ${nowIso()}`);
}

run();
