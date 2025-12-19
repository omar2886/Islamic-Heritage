export function normalizeRoute(route){
  const r = String(route || "").trim().toLowerCase();
  if (r === "wizard" || r === "builder" || r === "results") return r;
  return "wizard";
}

export function deriveState(state){
  const route = normalizeRoute(state?.ui?.route);
  const titleMap = {
    wizard: "Case Wizard",
    builder: "Family Builder",
    results: "Results Viewer",
  };

  return {
    route,
    routeTitle: titleMap[route] || "Case Wizard",
    nowIso: new Date().toISOString(),
  };
}
