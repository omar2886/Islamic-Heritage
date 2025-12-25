const DEFAULT_HEADERS = {
  "Accept": "application/json"
};

function withTimeout(ms, promise) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return {
    signal: ctrl.signal,
    wrap: promise.finally(() => clearTimeout(t))
  };
}

async function readJsonOrText(resp) {
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  const text = await resp.text();
  if (ct.includes("application/json")) {
    try { return JSON.parse(text); } catch { return { ok: false, error: "Invalid JSON response", raw: text }; }
  }
  return { ok: false, error: "Non-JSON response", raw: text };
}

export class ApiClient {
  constructor({ baseApiPath = "../api", timeoutMs = 12000 } = {}) {
    this.baseApiPath = baseApiPath;
    this.timeoutMs = timeoutMs;
  }

  async getRoles() {
    const url = `${this.baseApiPath}/roles.php`;
    const { signal, wrap } = withTimeout(this.timeoutMs, fetch(url, {
      method: "GET",
      headers: DEFAULT_HEADERS,
      signal
    }));
    const resp = await wrap;
    const body = await readJsonOrText(resp);
    if (!resp.ok) {
      const msg = body?.error || `HTTP ${resp.status}`;
      throw new Error(`roles.php failed: ${msg}`);
    }
    if (!body || body.ok !== true || !Array.isArray(body.roles)) {
      throw new Error(`roles.php unexpected shape: ${JSON.stringify(body)}`);
    }
    return body.roles;
  }

  async postCalc(payload) {
    const url = `${this.baseApiPath}/calc.php`;
    const { signal, wrap } = withTimeout(this.timeoutMs, fetch(url, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal
    }));
    const resp = await wrap;
    const body = await readJsonOrText(resp);
    if (!resp.ok) {
      const msg = body?.error || `HTTP ${resp.status}`;
      const err = new Error(`calc.php failed: ${msg}`);
      err.httpStatus = resp.status;
      err.responseBody = body;
      throw err;
    }
    return body;
  }
}
