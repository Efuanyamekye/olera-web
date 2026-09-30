/**
 * Never replace what somebody is typing into.
 *
 * The board is reloaded from the server after a write, and the reload
 * replaces the whole university object. Anything typed between the request
 * going out and the response landing is typed into the object that is about
 * to be discarded, so it disappears without a trace and without an error.
 *
 * Saving a field no longer reloads the board, which is where this bug
 * actually bit: every blur triggered a reload, and tabbing to the next field
 * and carrying on typing lost the next word. That fix is in `saveFields`.
 * This is the general guarantee behind it, for the reloads that remain:
 * archiving, deleting, creating, fanning out, assigning a section. Each is a
 * deliberate button press rather than something that fires while you type,
 * so this should never trigger. It exists so that the next reload somebody
 * adds cannot reintroduce the bug by accident.
 *
 * Deferring the apply and not the fetch is deliberate. The data is fetched
 * immediately and held; only putting it on screen waits. Nothing goes stale
 * for longer than the person keeps their cursor in the field.
 */

/** Whether the focused element is something a person types into. */
export function isEditing(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  // A checkbox, a radio or a button rendered as an input holds no text, so
  // replacing the screen under one loses nothing.
  const type = (el as HTMLInputElement).type;
  return type !== "checkbox" && type !== "radio" && type !== "button" && type !== "submit";
}

/**
 * Run `apply` now, or as soon as the person stops typing.
 *
 * One-shot, and bound to the element that has focus right now rather than to
 * the document, so tabbing between two fields does not let it through: the
 * first field's blur fires, we check again, and we are still editing, so it
 * waits again.
 */
export function applyWhenIdle(apply: () => void): void {
  if (!isEditing()) {
    apply();
    return;
  }
  const el = document.activeElement as HTMLElement;
  const onBlur = () => {
    el.removeEventListener("blur", onBlur);
    // Tabbing straight to another field lands here with focus already moved
    // on. Re-check rather than applying into the next field.
    applyWhenIdle(apply);
  };
  el.addEventListener("blur", onBlur);
}
