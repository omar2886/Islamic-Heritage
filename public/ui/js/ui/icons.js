export function renderIcon(name){
  const icons = {
    userPlus: "➕",
    download: "⬇️",
    edit: "✏️",
    arrowRight: "➡️",
  };
  const glyph = icons[name] || "";
  return glyph ? `<span aria-hidden="true">${glyph}</span>` : "";
}
