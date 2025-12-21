// public/ui/js/ui/focus.js
// Preserve focus AND caret/selection across re-renders.

export function captureFocus() {
  const el = document.activeElement;
  if (!el || !el.id) return null;

  const out = { id: el.id };

  // Preserve caret/selection for text inputs & textareas.
  // (Fixes "cursor jumps / typing reverses" after state-driven rerender.)
  try {
    if (typeof el.selectionStart === "number" && typeof el.selectionEnd === "number") {
      out.selection = {
        start: el.selectionStart,
        end: el.selectionEnd,
        direction: el.selectionDirection || "none",
      };
    }
  } catch (_) {}

  return out;
}

export function restoreFocus(focusState) {
  if (!focusState || !focusState.id) return;

  const safeId = CSS && CSS.escape ? CSS.escape(focusState.id) : focusState.id;
  const el = document.querySelector(`#${safeId}`);
  if (!el) return;

  el.focus();

  if (focusState.selection && typeof el.setSelectionRange === "function") {
    try {
      const len = (typeof el.value === "string") ? el.value.length : 0;
      const start = Math.min(focusState.selection.start, len);
      const end = Math.min(focusState.selection.end, len);
      el.setSelectionRange(start, end, focusState.selection.direction || "none");
    } catch (_) {}
  }
}
