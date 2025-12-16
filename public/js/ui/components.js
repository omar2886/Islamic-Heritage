export const el=(t,a={},...k)=>{const n=document.createElement(t);for(const [k1,v]of Object.entries(a)){if(k1==='class')n.className=v;else if(k1==='for')n.htmlFor=v;else n.setAttribute(k1,v)};k.flat().forEach(x=>n.append(x));return n;}

export function banner(kind, title, items){
  const div = el('div',{class:`banner ${kind}`, role: kind==='error'?'alert':'status', 'aria-live': kind==='error'?'assertive':'polite'});
  const h = el('strong',{}, title);
  const ul = el('ul',{class:'clean'}, ...(Array.isArray(items)?items:[items]).filter(Boolean).map(x=>el('li',{}, String(x))));
  div.append(h, ul);
  div.tabIndex = -1; // para foco programático
  return div;
}

export function tableKV(title, mapLike, {k='Rol', v='Valor'}={}){
  if (!mapLike || (typeof mapLike!=='object') || Object.keys(mapLike).length===0) return null;
  const sect = el('section',{}, el('h3',{}, title));
  const tbl = el('table',{}, el('thead',{}, el('tr',{}, el('th',{},k), el('th',{},v))), el('tbody',{}));
  Object.entries(mapLike).forEach(([key,val])=>{
    tbl.querySelector('tbody').append(el('tr',{}, el('td',{}, el('code',{}, key)), el('td',{}, String(val))));
  });
  sect.append(tbl);
  return sect;
}

export function downloadJsonLink(filename, dataObj, label='Descargar JSON'){
  const a = el('a',{href:'#',class:'btn'});
  try{
    const blob = new Blob([JSON.stringify(dataObj,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = filename; a.textContent = label;
  }catch{ a.textContent = label; }
  return a;
}

export function filePicker(accept='application/json', onFile){
  const inp = el('input',{type:'file',accept,style:'display:none', 'aria-hidden':'true'});
  document.body.append(inp);
  inp.addEventListener('change',()=>{
    const f = inp.files && inp.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = () => onFile && onFile(r.result, f);
    r.readAsText(f);
  });
  inp.click();
  setTimeout(()=>{ try{ document.body.removeChild(inp);}catch{} }, 0);
}
