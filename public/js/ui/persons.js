import { Persons, addPerson, updatePerson, removePerson, linkSpouses, unlinkSpouses } from '../persons.js';
import { Roles } from '../roles.js';
import { setDecedent } from '../state.js';

const el=(t,a={},...k)=>{const n=document.createElement(t);for(const [k1,v]of Object.entries(a)){if(k1==='class')n.className=v;else if(k1==='for')n.htmlFor=v;else n.setAttribute(k1,v);}k.flat().forEach(x=>n.append(x));return n;};

function roleSelect(value=''){
  const sel = el('select',{});
  const rolesFlat = [
    ...(Roles.sections.spouses||[]),
    ...(Roles.sections.children||[]),
    ...(Roles.sections.parents||[]),
    ...(Roles.sections.grandparents||[]),
    ...(Roles.sections.siblings||[]),
  ];
  rolesFlat.forEach(r=> sel.append(el('option',{value:r, selected: (r===value?'':null)}, r)));
  if (!value) sel.selectedIndex = 0;
  return sel;
}

function personOptions(excludeId=null){
  const frag = document.createDocumentFragment();
  const optEmpty = el('option',{value:''},'—');
  frag.append(optEmpty);
  Persons.list.forEach(p=>{
    if (excludeId && p.id===excludeId) return;
    frag.append(el('option',{value:p.id}, `${p.name||p.id} (${p.sex||'?'})`));
  });
  return frag;
}

export function mountPersonsSection(root){
  const sec = el('section',{class:'card',id:'sec-persons'}, el('h2',{},'Personas'));
  const help = el('p',{class:'muted small'},
    'Marca un ', el('strong',{},'causante'), ' (radio). Define vínculos de ', el('strong',{},'padre/madre'),
    ' y los ', el('strong',{},'cónyuges del causante'), ' (checkbox). Solo las personas ', el('strong',{},'vivas'),
    ' cuentan como herederos en la derivación estructural.'
  );

  const table = el('table',{id:'tbl-persons'},
    el('thead',{}, el('tr',{},
      el('th',{},'Causante'),
      el('th',{},'Nombre'),
      el('th',{},'Sexo'),
      el('th',{},'Vivo'),
      el('th',{},'Role'),
      el('th',{},'Padre'),
      el('th',{},'Madre'),
      el('th',{},'Cónyuge del causante'),
      el('th',{},'')
    )),
    el('tbody',{})
  );

  const btnAdd = el('button',{id:'btnAddPerson',class:'btn-secondary',type:'button'},'Añadir persona');
  btnAdd.addEventListener('click',()=>{
    addPerson({
      name: '',
      sex: 'unknown',
      alive: true,
      role: '',
      fatherId: null,
      motherId: null,
      spouseIds: [],
    });
    renderBody();
  });
  sec.append(help, table, el('div',{class:'actions'}, btnAdd));
  root.append(sec);

  function renderBody(){
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    Persons.list.forEach(p=>{
      const tr = el('tr',{'data-id':p.id});
      const rb = el('input',{type:'radio',name:'rbDecedent',checked:null});
      rb.checked = (p.id === (window.__DecedentId || null));
      rb.addEventListener('change',()=>{
        window.__DecedentId = p.id;
        setDecedent(p.id);
        if (typeof window !== 'undefined' && typeof window.__onModelChanged === 'function') {
          try { window.__onModelChanged(); } catch (e) { /* noop */ }
        }
        renderBody();
      });

      const inName = el('input',{type:'text',value:p.name||'',placeholder:'Nombre'});
      const selSex = el('select',{},
        el('option',{value:'unknown', selected:(p.sex==='unknown'?'':null)},'—'),
        el('option',{value:'male',    selected:(p.sex==='male'?'':null)},'Varón'),
        el('option',{value:'female',  selected:(p.sex==='female'?'':null)},'Mujer'),
      );
      const cbAlive = el('input',{type:'checkbox', checked: p.alive ? 'checked': null});
      const selRole = roleSelect(p.role||'');

      const selFather = el('select',{}); selFather.append(personOptions(p.id)); selFather.value = p.fatherId||'';
      const selMother = el('select',{}); selMother.append(personOptions(p.id)); selMother.value = p.motherId||'';

      const cbSpouseOfD = el('input',{type:'checkbox'});
      cbSpouseOfD.checked = !!((p.spouseIds||[]).includes(window.__DecedentId||''));
      cbSpouseOfD.disabled = !window.__DecedentId;

      const btnDel  = el('button',{type:'button',class:'btn-secondary'},'Borrar');

      tr.append(
        el('td',{}, rb),
        el('td',{}, inName),
        el('td',{}, selSex),
        el('td',{}, cbAlive),
        el('td',{}, selRole),
        el('td',{}, selFather),
        el('td',{}, selMother),
        el('td',{}, cbSpouseOfD),
        el('td',{}, btnDel),
      );
      tbody.append(tr);

      inName.addEventListener('input',()=>updatePerson(p.id,{name:inName.value}));
      selSex.addEventListener('change',()=>updatePerson(p.id,{sex:selSex.value}));
      cbAlive.addEventListener('change',()=>updatePerson(p.id,{alive:cbAlive.checked}));
      selRole.addEventListener('change',()=>updatePerson(p.id,{role:selRole.value}));
      selFather.addEventListener('change',()=>updatePerson(p.id,{fatherId: selFather.value || null}));
      selMother.addEventListener('change',()=>updatePerson(p.id,{motherId: selMother.value || null}));
      cbSpouseOfD.addEventListener('change',()=>{
        const D = window.__DecedentId;
        if (!D){ cbSpouseOfD.checked=false; return; }
        if (cbSpouseOfD.checked) linkSpouses(p.id, D); else unlinkSpouses(p.id, D);
        renderBody();
      });
      btnDel.addEventListener('click',()=>{
        removePerson(p.id);
        if (window.__DecedentId===p.id){ window.__DecedentId=null; setDecedent(null); }
        if (!Persons.list.length) addPerson({ alive: true });
        renderBody();
      });
    });
  }

  if (!Persons.list.length){ addPerson({alive:true}); }
  renderBody();
  window.__DecedentId = window.__DecedentId || null;
}
