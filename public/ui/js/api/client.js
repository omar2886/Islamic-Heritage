function apiUrl(relativePath){
  // base: .../public/ui/index.html -> ../api/roles.php => .../public/api/roles.php
  return new URL(relativePath, window.location.href).toString();
}

async function readJson(res){
  const text = await res.text();
  try{
    return JSON.parse(text);
  }catch(_e){
    return { ok: false, error: "Respuesta no es JSON", debug: text.slice(0, 500) };
  }
}

export async function fetchRoles({ signal } = {}){
  const url = apiUrl("../api/roles.php");
  const res = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json" },
    signal,
    cache: "no-store",
  });

  if (!res.ok){
    return { ok: false, error: `HTTP ${res.status} en roles.php` };
  }

  const data = await readJson(res);
  // roles.php devuelve un array de strings o un objeto; tolerar ambas
  if (Array.isArray(data)){
    return { ok: true, roles: data.map(String) };
  }
  if (data && typeof data === "object" && Array.isArray(data.roles)){
    return { ok: true, roles: data.roles.map(String) };
  }
  return { ok: false, error: "Formato de roles.php inesperado" };
}

export async function postCalc(payload, { signal } = {}){
  const url = new URL("../api/calc.php", window.location.href);
  const controller = signal ? null : new AbortController();
  const abortSignal = signal || controller?.signal;
  const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;

  try{
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: abortSignal,
      cache: "no-store",
    });

    if (!res.ok){
      return { ok: false, error: `HTTP ${res.status} en calc.php` };
    }

    const text = await res.text();
    try{
      const data = JSON.parse(text);
      return { ok: true, data };
    }catch(_e){
      return { ok: false, error: "Respuesta de calc.php no es JSON", debug: text.slice(0, 800) };
    }
  }catch(err){
    const aborted = err && err.name === "AbortError";
    const debug = err && err.message ? err.message : undefined;
    return {
      ok: false,
      error: aborted ? "Timeout de calc.php" : "Error de red en calc.php",
      debug,
    };
  }finally{
    if (timer) clearTimeout(timer);
  }
}
