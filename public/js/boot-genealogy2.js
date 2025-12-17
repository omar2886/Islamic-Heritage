// public/js/boot-genealogy2.js
window.__BOOT_G2_STARTED__ = Date.now();

import { mountGenealogy2 } from "./ui/genealogy2.js";

(async () => {
  try {
    await mountGenealogy2();
    window.__G2_MOUNTED__ = true;
  } catch (e) {
    console.error("[G2] mount failed", e);
    window.__G2_ERROR__ = String(e?.stack || e);
    const root = document.getElementById("g2-app");
    if (root) {
      const div = document.createElement("div");
      div.className = "banner banner-error";
      div.textContent = "Error cargando Genealogía V2. Abre con ?diag=1 para más info.";
      root.prepend(div);
    }
  }
})();
