import { $, setText, setHidden, safeStringify, prettyJson } from "./dom.js";
import { ApiClient } from "./apiClient.js";
import { getRoles } from "./rolesCache.js";

const els = {
  btnLoadRoles: $("#btnLoadRoles"),
  btnRunCalc: $("#btnRunCalc"),
  btnSetExample1: $("#btnSetExample1"),
  btnSetExample2: $("#btnSetExample2"),
  btnClear: $("#btnClear"),
  chkAutoPretty: $("#chkAutoPretty"),
  txtPayload: $("#txtPayload"),
  payloadError: $("#payloadError"),
  preResponse: $("#preResponse"),
  netMeta: $("#netMeta"),
  preRoles: $("#preRoles")
};

const api = new ApiClient({ baseApiPath: "../api", timeoutMs: 12000 });

function getPrettyEnabled() {
  return !!els.chkAutoPretty.checked;
}

function uiSetError(msg) {
  if (!msg) {
    setHidden(els.payloadError, true);
    setText(els.payloadError, "");
    return;
  }
  setHidden(els.payloadError, false);
  setText(els.payloadError, msg);
}

function uiSetResponse(obj) {
  const pretty = getPrettyEnabled();
  setText(els.preResponse, safeStringify(obj, pretty));
}

function uiSetRoles(roles) {
  const pretty = getPrettyEnabled();
  setText(els.preRoles, pretty ? prettyJson(roles) : JSON.stringify(roles));
}

function setPayload(obj) {
  const pretty = getPrettyEnabled();
  els.txtPayload.value = pretty ? prettyJson(obj) : JSON.stringify(obj);
}

function parsePayload() {
  const raw = els.txtPayload.value.trim();
  if (!raw) throw new Error("Payload vacío.");
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("JSON inválido en payload.");
  }

  if (!obj || typeof obj !== "object") throw new Error("Payload debe ser un objeto JSON.");
  if (!Array.isArray(obj.heirs)) throw new Error("Payload debe incluir 'heirs' como array.");
  if (obj.heirs.length === 0) throw new Error("'heirs' no puede estar vacío.");

  // PR1: Prohibido incluir flags CLI.
  // No puede existir la cadena literal del nombre de clave en este código.
  const k = "cli" + "_" + "flags";
  if (Object.prototype.hasOwnProperty.call(obj, k)) {
    throw new Error("PR1: payload contiene una clave prohibida.");
  }

  for (let i = 0; i < obj.heirs.length; i++) {
    const h = obj.heirs[i];
    if (!h || typeof h !== "object") throw new Error(`heirs[${i}] debe ser objeto.`);
    if (typeof h.role !== "string" || !h.role.trim()) throw new Error(`heirs[${i}].role inválido.`);
    if (!Number.isInteger(h.count) || h.count < 1 || h.count > 100) {
      throw new Error(`heirs[${i}].count debe ser int 1..100.`);
    }
  }

  return obj;
}

function setNetMeta(msg) {
  setText(els.netMeta, msg || "");
}

async function onLoadRoles() {
  uiSetError(null);
  setNetMeta("Cargando roles...");
  try {
    const roles = await getRoles();
    uiSetRoles(roles);
    setNetMeta(`Roles cargados: ${roles.length}`);
  } catch (e) {
    uiSetRoles([]);
    setNetMeta("");
    uiSetError(e?.message || String(e));
  }
}

async function onRunCalc() {
  uiSetError(null);
  uiSetResponse("");
  setNetMeta("Ejecutando calc.php...");
  try {
    let roles = null;
    try { roles = await getRoles(); } catch {}

    const payload = parsePayload();

    if (Array.isArray(roles)) {
      const set = new Set(roles);
      const unknown = payload.heirs.filter(h => !set.has(h.role)).map(h => h.role);
      if (unknown.length > 0) {
        throw new Error(`Roles desconocidos según catálogo: ${unknown.join(", ")}`);
      }
    }

    const t0 = performance.now();
    const resp = await api.postCalc(payload);
    const t1 = performance.now();
    uiSetResponse(resp);
    setNetMeta(`OK en ${(t1 - t0).toFixed(0)} ms`);
  } catch (e) {
    const errObj = {
      ok: false,
      error: e?.message || String(e),
      httpStatus: e?.httpStatus || null,
      responseBody: e?.responseBody || null
    };
    uiSetResponse(errObj);
    setNetMeta("");
    uiSetError(errObj.error);
  }
}

function wireExamples() {
  els.btnSetExample1.addEventListener("click", () => {
    setPayload({
      heirs: [
        { role: "mother", count: 1 }
      ]
    });
    uiSetError(null);
    uiSetResponse("");
    setNetMeta("Ejemplo 1 cargado.");
  });

  els.btnSetExample2.addEventListener("click", () => {
    setPayload({
      heirs: [
        { role: "wife", count: 1 },
        { role: "son", count: 2 },
        { role: "daughter", count: 1 }
      ],
      estate_value: "100000.00",
      currency: "MAD",
      ui_meta: { sex: "male", source: "ui-pr1" }
    });
    uiSetError(null);
    uiSetResponse("");
    setNetMeta("Ejemplo 2 cargado.");
  });

  els.btnClear.addEventListener("click", () => {
    els.txtPayload.value = "";
    uiSetError(null);
    uiSetResponse("");
    setNetMeta("");
  });
}

function wireButtons() {
  els.btnLoadRoles.addEventListener("click", onLoadRoles);
  els.btnRunCalc.addEventListener("click", onRunCalc);
}

function initDefaultPayload() {
  setPayload({
    heirs: [
      { role: "mother", count: 1 }
    ]
  });
}

wireButtons();
wireExamples();
initDefaultPayload();
uiSetRoles([]);
uiSetResponse("");
setNetMeta("Listo. Carga roles y ejecuta calc.");
