export function captureFocus() {
  const el = document.activeElement;
  if (!el || typeof el.getAttribute !== "function") return { key: null };

  const key = el.getAttribute("data-focus-key") || el.id || null;
  if (!key) return { key: null };

  const out = { key };

  // Preserve caret/selection for text-like inputs
  const tag = (el.tagName || "").toLowerCase();
  const isTextLike = tag === "input" || tag === "textarea";

  if (isTextLike) {
    // Some input types (number, checkbox, etc.) don't support selectionStart
    const ss = el.selectionStart;
    const se = el.selectionEnd;
    if (typeof ss === "number" && typeof se === "number") {
      out.selStart = ss;
      out.selEnd = se;
      if (typeof el.selectionDirection === "string") out.selDir = el.selectionDirection;
      if (typeof el.value === "string") out.valueLen = el.value.length;
    }
  }

  return out;
}

function cssEscapeSafe(s) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  // minimal fallback for attribute selector
  return String(s).replace(/["\\]/g, "\\$&");
}

export function restoreFocus(info) {
  const key = info && info.key ? String(info.key) : null;
  if (!key) return;

  let target =
    document.querySelector(`[data-focus-key="${cssEscapeSafe(key)}"]`) ||
    document.getElementById(key);

  if (!target || typeof target.focus !== "function") return;

  // Do NOT refocus if already focused (can reset caret in some browsers)
  const alreadyActive = document.activeElement === target;
  if (!alreadyActive) {
    try {
      target.focus({ preventScroll: true });
    } catch (_e) {
      target.focus();
    }
  }

  // Restore selection if possible
  const canSel =
    typeof target.selectionStart === "number" &&
    typeof target.selectionEnd === "number" &&
    typeof target.setSelectionRange === "function";

  if (canSel && typeof info.selStart === "number" && typeof info.selEnd === "number") {
    const len = typeof target.value === "string" ? target.value.length : 0;
    const s = Math.max(0, Math.min(info.selStart, len));
    const e = Math.max(0, Math.min(info.selEnd, len));
    try {
      target.setSelectionRange(s, e, info.selDir || "none");
    } catch (_e) {
      // ignore
    }
  }
}
