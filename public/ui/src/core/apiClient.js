async function fetchWithTimeout(url, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e && (e.name === "AbortError" || e.code === 20)) {
      const err = new Error(`Request timeout after ${timeoutMs}ms`);
      err.cause = e;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonOrText(resp) {
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  const text = await resp.text();

  if (ct.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: "Invalid JSON response", raw: text };
    }
  }

  return { ok: false, error: "Non-JSON response", raw: text };
}

export class ApiClient {
  constructor({ baseApiPath = "../api", timeoutMs = 12000 } = {}) {
    this.baseApiPath = baseApiPath;
    this.timeoutMs = timeoutMs;
  }

  rolesUrl() {
    return `${this.baseApiPath}/roles.php`;
  }

  calcUrl() {
    return `${this.baseApiPath}/calc.php`;
  }

  async getRoles() {
    const resp = await fetchWithTimeout(
      this.rolesUrl(),
      { method: "GET", headers: { Accept: "application/json" } },
      this.timeoutMs
    );

    const body = await readJsonOrText(resp);

    if (!resp.ok) {
      const msg = body?.error || `HTTP ${resp.status}`;
      throw new Error(`roles.php failed: ${msg}`);
    }

    if (!body || body.ok !== true || !Array.isArray(body.roles)) {
      throw new Error(`roles.php unexpected shape: ${JSON.stringify(body)}`);
    }

    return body.roles.map(String);
  }

  // options.bodyText forces the exact body string passed to fetch.
  async postCalc(payload, options = {}) {
    const bodyText = typeof options.bodyText === "string" ? options.bodyText : JSON.stringify(payload);

    const resp = await fetchWithTimeout(
      this.calcUrl(),
      {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: bodyText
      },
      this.timeoutMs
    );

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
