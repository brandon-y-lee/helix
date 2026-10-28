const FOCUS_KEY = "helix_privacy_focus";
export function reloadAfterPrivacyChange() {
  const target =
    document.querySelector<HTMLElement>(".privacy-dialog")?.dataset
      .privacyTrigger;
  if (target) {
    try {
      window.sessionStorage.setItem(FOCUS_KEY, target);
    } catch {
      /* Focus recovery is best effort; collection remains denied. */
    }
  }
  window.location.reload();
}
export function restorePrivacyFocus(
  id: string,
  target: HTMLButtonElement | null,
) {
  try {
    if (window.sessionStorage.getItem(FOCUS_KEY) === id) {
      window.sessionStorage.removeItem(FOCUS_KEY);
      target?.focus();
    }
  } catch {
    /* Blocked session storage must not prevent the dialog from working. */
  }
}
