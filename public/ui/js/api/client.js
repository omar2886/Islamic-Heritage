// public/ui/js/api/client.js  (REEMPLAZAR ENTERO)
export async function apiPostJson(url, payload){
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok){
    // Mostrar el body si existe, priorizar mensaje server
    const serverMsg =
      (json && (json.error || json.message)) ? (json.error || json.message)
      : (text ? text.slice(0, 400) : `HTTP ${res.status}`);
    const err = new Error(`HTTP ${res.status}: ${serverMsg}`);
    err.status = res.status;
    err.bodyText = text;
    err.bodyJson = json;
    throw err;
  }

  return json ?? { ok: true, raw: text };
}
