const STORAGE_KEY = "ui.lang";

const DICT_EN = {
  // Roles (input)
  "role.father": "Father",
  "role.mother": "Mother",
  "role.husband": "Husband",
  "role.wife": "Wives",
  "role.son": "Sons",
  "role.daughter": "Daughters",
  "role.sons_son": "Sons' sons",
  "role.sons_daughter": "Sons' daughters",
  "role.full_brother": "Full brothers",
  "role.full_sister": "Full sisters",
  "role.consanguine_brother": "Paternal half brothers",
  "role.consanguine_sister": "Paternal half sisters",
  "role.uterine_brother": "Maternal half brothers",
  "role.uterine_sister": "Maternal half sisters",
  "role.paternal_grandfather": "Paternal grandfather",
  "role.maternal_grandmother": "Maternal grandmother",
  "role.paternal_grandmother": "Paternal grandmother",
  "role.paternal_great_grandmother": "Paternal great grandmother",
  "role.maternal_great_grandmother": "Maternal great grandmother",
  "role.paternal_uncle": "Paternal uncles",
  "role.paternal_uncle_son": "Sons of paternal uncles",
  "role.paternal_uncles_daughter": "Daughters of paternal uncles",
  "role.paternal_uncle_sons_daughter": "Daughters of paternal uncle's sons",
  "role.consanguine_paternal_uncle": "Paternal half uncles",
  "role.consanguine_paternal_uncle_son": "Sons of paternal half uncles",
  "role.consanguine_paternal_uncles_daughter": "Daughters of paternal half uncles",
  "role.consanguine_paternal_uncle_sons_daughter": "Daughters of paternal half uncle's sons",
  "app.title": "Islamic Inheritance",
  "app.subtitle": "MVP UI: deceased-centric by counts",

  "nav.selftest": "Selftest",
  "nav.language": "Language",

  "card.input": "Input",
  "card.results": "Results",
  "card.debug": "Debug",
  "footer.mvp": "MVP UI",

  "hint.uiAuthority": "The UI validates basics; the calculator applies blocks and normalizations.",

  "button.reset": "Reset",
  "button.calculate": "Calculate",

  "banner.errors": "Errors:",
  "banner.warnings": "Warnings:",

  "err.invalidDecedentSex": "Invalid deceased sex.",
  "err.maleCannotHaveHusband": "If the deceased is male, 'husband' is not applicable.",
  "err.femaleCannotHaveWives": "If the deceased is female, 'wives' is not applicable.",
  "err.rejectedRoleUsed": "This role is listed in roles.php but ignored by the calculator: '{role}'.",
  "err.mustIndicateAtLeastOneHeir": "You must indicate at least one heir.",
  "err.grandchildrenNeedDeceasedSon": "If you enter grandchildren through a son, you must enable 'Deceased son (UI-only)'.",
  "err.invalidEstateValue": "Invalid estate value.",
  "err.invalidCurrency": "Invalid currency.",

  "warn.fatherWithSiblings": "Father is present and siblings are also present. This is often blocked. The calculator will decide.",
  "warn.descWithSiblings": "Descendants are present and siblings are also present. This is often blocked. The calculator will decide.",
  "warn.descWithUncles": "Descendants are present and paternal uncles are also present. This is often blocked. The calculator will decide.",
  "warn.fatherWithUncles": "Father is present and paternal uncles are also present. This is often blocked. The calculator will decide.",
  "warn.sonsWithGrandchildren": "Sons and grandchildren (through a son) are both present. This is valid if there is a deceased son. The calculator will decide.",
  "banner.calculating": "Calculating...",
  "banner.noCalcYet": "No calculation yet.",

  "form.decedentSex": "Decedent sex",
  "sex.male": "Male",
  "sex.female": "Female",

  "form.fiqhSchool": "Fiqh school",
  "fiqh.maliki": "Maliki",
  "fiqh.hanafi": "Hanafi (soon)",
  "fiqh.shafii": "Shafi'i (soon)",
  "fiqh.hanbali": "Hanbali (soon)",

  "form.heirs": "Heirs",
  "form.estate": "Estate",
  "form.estateValue": "Value (number)",
  "form.estateCurrency": "Currency (ISO 4217, optional)",
  "form.prettyJson": "Pretty JSON in Debug",

  "form.roleHintBase": "role: {id}",
  "form.roleIgnored": "(ignored by the calculator)",

  "form.hasDeceasedSon": "Grandchildren through son: there is at least one deceased son",
  "form.hasDeceasedSonHint": "Required only if you enter grandchildren through a son.",
  "form.grandchildrenLineageHint": "Grandchildren here are only through a son (paternal line). Grandchildren through daughters are not modeled in this core.",
  "form.grandchildrenBlockedHint": "Note: If there are living sons, the core will block grandchildren through a son (hajb). This UI does not block it, it only warns.",
  "form.grandparentsHint": "Note: This core includes paternal grandfather and grandmothers. Maternal grandfather is not supported as a role.",

  "roleCompat.loading": "Checking role compatibility with calc.php...",
  "roleCompat.error": "Role compatibility: error:",
  "roleCompat.ok": "Role compatibility (calc.php): accepted={acc} rejected={rej}",
  "roleCompat.ignored": "Roles ignored by the calculator: {roles}",

  // Sections
  "section.ascendants": "Parents",
  "section.spouse": "Spouse",
  "section.descendants": "Children",
  "section.grandchildren": "Grandchildren through son",
  "section.siblings_full": "Full siblings",
  "section.siblings_consanguine": "Consanguine siblings (paternal)",
  "section.siblings_uterine": "Uterine siblings (maternal)",
  "section.grandparents": "Grandparents",
  "section.agnatic_uncles": "Paternal uncles and agnatic branch",

  // Role labels (input roleIds)
  "label.father": "Father (alive)",
  "label.mother": "Mother (alive)",
  "label.husband": "Husband (alive)",
  "label.wife": "Wives (0..4) for male decedent",
  "label.son": "Sons",
  "label.daughter": "Daughters",
  "label.sons_son": "Grandsons through son",
  "label.sons_daughter": "Granddaughters through son",
  "label.paternal_grandfather": "Paternal grandfather",
  "label.paternal_grandmother": "Paternal grandmother",
  "label.maternal_grandmother": "Maternal grandmother",
  "label.full_brother": "Full brothers",
  "label.full_sister": "Full sisters",
  "label.consanguine_brother": "Consanguine brothers (paternal)",
  "label.consanguine_sister": "Consanguine sisters (paternal)",
  "label.uterine_brother": "Uterine brothers (maternal)",
  "label.uterine_sister": "Uterine sisters (maternal)",
  "label.paternal_uncle": "Paternal uncles",
  "label.consanguine_paternal_uncle": "Consanguine paternal uncles",
  "label.paternal_uncle_son": "Sons of paternal uncle",
  "label.consanguine_paternal_uncle_son": "Sons of consanguine paternal uncle",
  "label.paternal_uncles_daughter": "Daughters of paternal uncles",
  "label.consanguine_paternal_uncles_daughter": "Daughters of consanguine paternal uncles",
  "label.paternal_uncle_sons_daughter": "Daughters of the son of paternal uncle",
  "label.consanguine_paternal_uncle_sons_daughter": "Daughters of the son of consanguine paternal uncle",

  // Common group labels (output plural)
  "label.wives": "Wives",
  "label.sons": "Sons",
  "label.daughters": "Daughters",
  "label.sons_sons": "Grandsons through son",
  "label.sons_daughters": "Granddaughters through son",
  "label.full_brothers": "Full brothers",
  "label.full_sisters": "Full sisters",
  "label.consanguine_brothers": "Consanguine brothers",
  "label.consanguine_sisters": "Consanguine sisters",
  "label.uterine_brothers": "Uterine brothers",
  "label.uterine_sisters": "Uterine sisters",

  // Results
  "results.ok": "Result OK",
  "results.loading": "Calculating...",
  "results.none": "No calculation yet.",
  "results.responseNotOk": "Response ok=false",

  "results.fardTotal": "Fard total",
  "results.residual": "Residual",

  "results.col.relationship": "Relationship",
  "results.col.n": "N",
  "results.col.groupShare": "Group share",
  "results.col.eachShare": "Each",
  "results.col.groupAmount": "Group amount",
  "results.col.eachAmount": "Each amount",
  "results.col.origin": "Origin",
  "results.col.delta": "Delta",

  "results.interpretation": "How to interpret the table:",
  "results.help.groupTotal": "Group share: the fraction for the whole group.",
  "results.help.each": "Each: per-person share when it can be determined (some groups split equally, others depend on rules).",
  "results.help.origin": "Origin: FARD (fixed share) or ASABA (residual distribution).",

  "results.section.fixed": "Fixed shares (fard)",
  "results.section.awl": "Awl adjustment",
  "results.section.radd": "Radd adjustment",
  "results.section.asaba": "Residual distribution (asaba)",
  "results.section.blocks": "Blocks and warnings",
  "results.section.json": "Raw output (JSON)",

  "results.sum": "Sum:",
  "results.notApplied": "Not applied.",
  "results.residualAssigned": "Residual assigned:",
  "results.notes": "Notes:",
  "results.warnings": "Warnings:",
  "results.blocksApplied": "Blocks applied:",
  "results.blocks.affects": "affects:",
  "results.role": "Role",
  "results.share": "Share",
  "results.count": "Count",
  "results.totalGroup": "Total (group)",
  "results.each": "Each",
  "results.phase": "Origin",
  "results.amount": "Amount",
  "results.amountEach": "Each amount",
  "results.interpretation": "Interpretation",
  "results.notes": "Notes",
  "results.blocks": "Blocks",
  "results.warnings": "Warnings",
  "results.technical": "Technical details (JSON)",
  "results.responseNotOk": "Response ok=false",

  // Debug (UI)
  "debug.noSnapshot": "(no snapshot yet)",
  "debug.unknown": "(unknown)",
  "debug.prettyJson": "Pretty JSON",
  "debug.section.snapshot": "Snapshot",
  "debug.section.roles": "Roles (roles.php)",
  "debug.section.roleProbe": "Role compatibility",
  "debug.section.payload": "Payload (last built)",
  "debug.section.response": "Response (last)",
  "debug.snapshot.meta": "Meta",
  "debug.snapshot.built": "Built payload (adapter)",
  "debug.snapshot.sent": "Sent payload (fetch)",
  "debug.snapshot.normalized": "Normalized input (calculator)",
  "debug.snapshot.diff": "Diff",
  "debug.roleProbe.title": "Role compatibility (roles.php vs calc.php)",
  "debug.roleProbe.probedAt": "probedAt",
  "debug.roleProbe.accepted": "accepted",
  "debug.roleProbe.rejected": "rejected",
  "debug.roleProbe.noMismatches": "No mismatches detected.",
  "debug.roleProbe.loading": "Role probe in progress...",
  "debug.roleProbe.error": "Role probe error:",
  "debug.roleProbe.none": "Role probe: not executed yet.",
  "debug.roleProbe.button": "Re-run role probe"

};

const DICT_ES = {
  // Roles (entrada)
  "role.father": "Padre",
  "role.mother": "Madre",
  "role.husband": "Esposo",
  "role.wife": "Esposas",
  "role.son": "Hijos",
  "role.daughter": "Hijas",
  "role.sons_son": "Nietos (hijo de hijo)",
  "role.sons_daughter": "Nietas (hija de hijo)",
  "role.full_brother": "Hermanos (completos)",
  "role.full_sister": "Hermanas (completas)",
  "role.consanguine_brother": "Hermanos consanguíneos (por padre)",
  "role.consanguine_sister": "Hermanas consanguíneas (por padre)",
  "role.uterine_brother": "Hermanos uterinos (por madre)",
  "role.uterine_sister": "Hermanas uterinas (por madre)",
  "role.paternal_grandfather": "Abuelo paterno",
  "role.maternal_grandmother": "Abuela materna",
  "role.paternal_grandmother": "Abuela paterna",
  "role.paternal_great_grandmother": "Bisabuela paterna",
  "role.maternal_great_grandmother": "Bisabuela materna",
  "role.paternal_uncle": "Tíos paternos",
  "role.paternal_uncle_son": "Hijos de tío paterno",
  "role.paternal_uncles_daughter": "Hijas de tío paterno",
  "role.paternal_uncle_sons_daughter": "Hijas del hijo de tío paterno",
  "role.consanguine_paternal_uncle": "Tíos paternos consanguíneos (por padre)",
  "role.consanguine_paternal_uncle_son": "Hijos de tío paterno consanguíneo",
  "role.consanguine_paternal_uncles_daughter": "Hijas de tío paterno consanguíneo",
  "role.consanguine_paternal_uncle_sons_daughter": "Hijas del hijo de tío paterno consanguíneo",
  "app.title": "Herencia Islámica",
  "app.subtitle": "MVP UI: deceased-centric por conteos",

  "nav.selftest": "Selftest",
  "nav.language": "Idioma",

  "card.input": "Entrada",
  "card.results": "Resultado",
  "card.debug": "Debug",
  "footer.mvp": "MVP UI",

  "hint.uiAuthority": "La interfaz valida lo básico; el cálculo aplica bloqueos y normalizaciones.",

  "button.reset": "Reset",
  "button.calculate": "Calcular",

  "banner.errors": "Errores:",
  "banner.warnings": "Avisos:",

  "err.invalidDecedentSex": "Sexo del causante inválido.",
  "err.maleCannotHaveHusband": "Si el causante es hombre, 'husband' no aplica.",
  "err.femaleCannotHaveWives": "Si el causante es mujer, 'wives' no aplica.",
  "err.rejectedRoleUsed": "Este role existe en roles.php pero el cálculo lo ignora: '{role}'.",
  "err.mustIndicateAtLeastOneHeir": "Debes indicar al menos un heredero.",
  "err.grandchildrenNeedDeceasedSon": "Si indicas nietos vía hijo, debes activar 'Hijo fallecido (solo UI)'.",
  "err.invalidEstateValue": "Valor de herencia inválido.",
  "err.invalidCurrency": "Moneda inválida.",

  "warn.fatherWithSiblings": "Hay padre y también hermanos. Esto suele bloquear hermanos. El cálculo decidirá.",
  "warn.descWithSiblings": "Hay descendientes y también hermanos. Esto suele bloquear hermanos. El cálculo decidirá.",
  "warn.descWithUncles": "Hay descendientes y también tíos paternos. Esto suele bloquearlos. El cálculo decidirá.",
  "warn.fatherWithUncles": "Hay padre y también tíos paternos. Esto suele bloquearlos. El cálculo decidirá.",
  "warn.sonsWithGrandchildren": "Hay hijos y también nietos vía hijo. Esto es válido si existe un hijo fallecido. El cálculo decidirá.",
  "banner.calculating": "Calculando...",
  "banner.noCalcYet": "Sin cálculo aún.",

  "form.decedentSex": "Sexo del causante",
  "sex.male": "Hombre",
  "sex.female": "Mujer",

  "form.fiqhSchool": "Escuela de fiqh",
  "fiqh.maliki": "Maliki",
  "fiqh.hanafi": "Hanafi (pronto)",
  "fiqh.shafii": "Shafi'i (pronto)",
  "fiqh.hanbali": "Hanbali (pronto)",

  "form.heirs": "Herederos",
  "form.estate": "Herencia",
  "form.estateValue": "Valor (número)",
  "form.estateCurrency": "Moneda (ISO 4217, opcional)",
  "form.prettyJson": "Pretty JSON en Debug",

  "form.roleHintBase": "role: {id}",
  "form.roleIgnored": "(ignorado por el cálculo)",

  "form.hasDeceasedSon": "Nietos vía hijo: existe al menos un hijo varón fallecido",
  "form.hasDeceasedSonHint": "Requerido solo si indicas nietos vía hijo.",
  "form.grandchildrenLineageHint": "Los nietos de esta sección son solo por línea del hijo varón del causante (nietos vía hijo). El core no modela nietos por hija.",
  "form.grandchildrenBlockedHint": "Aviso: si hay hijos varones vivos, el core bloqueará los nietos vía hijo (hajb). La UI no lo bloquea, solo avisa.",
  "form.grandparentsHint": "Nota: este core incluye abuelo paterno y abuelas. No existe rol de abuelo materno.",

  "roleCompat.loading": "Verificando compatibilidad de roles con calc.php...",
  "roleCompat.error": "Compatibilidad roles: error:",
  "roleCompat.ok": "Compatibilidad roles (calc.php): aceptados={acc} rechazados={rej}",
  "roleCompat.ignored": "Roles ignorados por el cálculo: {roles}",

  // Sections
  "section.ascendants": "Padres",
  "section.spouse": "Cónyuge",
  "section.descendants": "Descendencia",
  "section.grandchildren": "Nietos vía hijo",
  "section.siblings_full": "Hermanos completos",
  "section.siblings_consanguine": "Hermanos consanguíneos (por padre)",
  "section.siblings_uterine": "Hermanos uterinos (por madre)",
  "section.grandparents": "Abuelos y abuelas",
  "section.agnatic_uncles": "Tíos paternos y rama agnática",

  // Role labels
  "label.father": "Padre vivo",
  "label.mother": "Madre viva",
  "label.husband": "Esposo (0..1) para causante femenino",
  "label.wife": "Esposas (0..4) para causante masculino",
  "label.son": "Hijos",
  "label.daughter": "Hijas",
  "label.sons_son": "Nietos varones vía hijo",
  "label.sons_daughter": "Nietas vía hijo",
  "label.paternal_grandfather": "Abuelo paterno",
  "label.paternal_grandmother": "Abuela paterna",
  "label.maternal_grandmother": "Abuela materna",
  "label.full_brother": "Hermanos completos",
  "label.full_sister": "Hermanas completas",
  "label.consanguine_brother": "Hermanos por padre (consanguíneos)",
  "label.consanguine_sister": "Hermanas por padre (consanguíneas)",
  "label.uterine_brother": "Hermanos por madre (uterinos)",
  "label.uterine_sister": "Hermanas por madre (uterinas)",
  "label.paternal_uncle": "Tíos paternos",
  "label.consanguine_paternal_uncle": "Tíos paternos consanguíneos (por padre)",
  "label.paternal_uncle_son": "Hijos de tío paterno",
  "label.consanguine_paternal_uncle_son": "Hijos de tío paterno consanguíneo",
  "label.paternal_uncles_daughter": "Hijas de tíos paternos",
  "label.consanguine_paternal_uncles_daughter": "Hijas de tíos paternos consanguíneos",
  "label.paternal_uncle_sons_daughter": "Hija del hijo del tío paterno",
  "label.consanguine_paternal_uncle_sons_daughter": "Hija del hijo del tío paterno (consanguíneo)",

  // Group labels
  "label.wives": "Esposas",
  "label.sons": "Hijos varones",
  "label.daughters": "Hijas",
  "label.sons_sons": "Nietos por hijo (varones)",
  "label.sons_daughters": "Nietas por hijo",
  "label.full_brothers": "Hermanos completos",
  "label.full_sisters": "Hermanas completas",
  "label.consanguine_brothers": "Hermanos por padre",
  "label.consanguine_sisters": "Hermanas por padre",
  "label.uterine_brothers": "Hermanos por madre",
  "label.uterine_sisters": "Hermanas por madre",

  // Results
  "results.ok": "Resultado OK",
  "results.loading": "Calculando...",
  "results.none": "Sin cálculo todavía.",
  "results.responseNotOk": "Respuesta ok=false",

  "results.fardTotal": "Total fard",
  "results.residual": "Resto",

  "results.col.relationship": "Parentesco",
  "results.col.n": "N",
  "results.col.groupShare": "Fracción (grupo)",
  "results.col.eachShare": "Cada uno",
  "results.col.groupAmount": "Importe (grupo)",
  "results.col.eachAmount": "Importe por persona",
  "results.col.origin": "Origen",
  "results.col.delta": "Delta",

  "results.interpretation": "Cómo interpretar la tabla:",
  "results.help.groupTotal": "Fracción (grupo): fracción total para el grupo.",
  "results.help.each": "Cada uno: fracción por persona cuando se puede determinar (algunos grupos se reparten igual, otros dependen de las reglas).",
  "results.help.origin": "Origen: FARD (cuota fija) o ASABA (reparto del resto).",

  "results.section.fixed": "Repartos fijos (fard)",
  "results.section.awl": "Ajuste de awl",
  "results.section.radd": "Ajuste de radd",
  "results.section.asaba": "Reparto del resto (asaba)",
  "results.section.blocks": "Bloqueos y avisos",
  "results.section.json": "Salida cruda (JSON)",

  "results.sum": "Suma:",
  "results.notApplied": "No aplicado.",
  "results.residualAssigned": "Resto asignado:",
  "results.notes": "Notas:",
  "results.warnings": "Avisos:",
  "results.blocksApplied": "Bloqueos aplicados:",
  "results.blocks.affects": "afecta a:",
  "results.role": "Role",
  "results.share": "Fracción",
  "results.count": "Cantidad",
  "results.totalGroup": "Total (grupo)",
  "results.each": "Cada uno",
  "results.phase": "Origen",
  "results.amount": "Importe",
  "results.amountEach": "Importe por persona",
  "results.interpretation": "Interpretación",
  "results.notes": "Notas",
  "results.blocks": "Bloqueos",
  "results.warnings": "Avisos",
  "results.technical": "Detalles técnicos (JSON)",
  "results.responseNotOk": "Respuesta ok=false",

  // Debug (UI)
  "debug.noSnapshot": "(sin snapshot todavía)",
  "debug.unknown": "(desconocido)",
  "debug.prettyJson": "JSON bonito",
  "debug.section.snapshot": "Snapshot",
  "debug.section.roles": "Roles (roles.php)",
  "debug.section.roleProbe": "Compatibilidad de roles",
  "debug.section.payload": "Payload (último construido)",
  "debug.section.response": "Respuesta (última)",
  "debug.snapshot.meta": "Meta",
  "debug.snapshot.built": "Payload construido (adapter)",
  "debug.snapshot.sent": "Payload enviado (fetch)",
  "debug.snapshot.normalized": "Entrada normalizada (cálculo)",
  "debug.snapshot.diff": "Diff",
  "debug.roleProbe.title": "Compatibilidad de roles (roles.php vs calc.php)",
  "debug.roleProbe.probedAt": "probedAt",
  "debug.roleProbe.accepted": "aceptados",
  "debug.roleProbe.rejected": "rechazados",
  "debug.roleProbe.noMismatches": "No se detectan discrepancias.",
  "debug.roleProbe.loading": "Comprobando compatibilidad de roles...",
  "debug.roleProbe.error": "Error en compatibilidad de roles:",
  "debug.roleProbe.none": "Compatibilidad de roles: todavía no ejecutada.",
  "debug.roleProbe.button": "Recomprobar roles"

};

const DICTS = { en: DICT_EN, es: DICT_ES };

let currentLang = "en";

export function detectLang() {
  const stored = (localStorage.getItem(STORAGE_KEY) || "").toLowerCase();
  if (stored === "en" || stored === "es") return stored;
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("es")) return "es";
  return "en";
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  const next = String(lang || "").toLowerCase();
  currentLang = next === "es" ? "es" : "en";
  try {
    localStorage.setItem(STORAGE_KEY, currentLang);
  } catch (_) {}
  document.documentElement.lang = currentLang;
}

export function initI18n() {
  setLang(detectLang());
  return currentLang;
}

export function t(key, vars = null) {
  const k = String(key || "");
  const dict = DICTS[currentLang] || DICT_EN;
  let s = dict[k] || DICT_EN[k] || k;

  if (vars && typeof vars === "object") {
    for (const [name, value] of Object.entries(vars)) {
      s = s.replaceAll(`{${name}}`, String(value));
    }
  }
  return s;
}
