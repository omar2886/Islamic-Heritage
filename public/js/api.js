const PUB  = window.__PUBLIC_BASE__ || '';
const URLS = window.__URLS__ || {};

function join(base, path){
  const cleanBase = base ? String(base).replace(/\/+$/, '') : '';
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return cleanBase ? `${cleanBase}/${cleanPath}` : cleanPath;
}

const ROLES_URL = URLS.roles || join(PUB, 'api/roles.php');
const CALC_URL  = URLS.calc  || join(PUB, 'api/calc.php');
const TOOLS_URL = URLS.tools || join(PUB, 'tools/explain_smoke.php');

export async function getRoles(){
  try{
    const r = await fetch(ROLES_URL,{cache:'no-store', headers:{'Accept':'application/json'}});
    const j = await r.json();
    return Array.isArray(j.roles) ? j.roles : [];
  }catch{
    return [];
  }
}

export async function postCalc(payload){
  const r = await fetch(CALC_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  const t = await r.text();
  try{
    return JSON.parse(t);
  }catch(e){
    throw new Error(`Respuesta no-JSON (${r.status})\n${t}`);
  }
}
