/**
 * Guards the Coach screen's "send the prefilled question straight away" behaviour.
 *
 * The in-app Ask Coach buttons open `/coach?...&prefill=<question>` and the
 * screen sends that question for the runner. But a `cursus://coach?...&prefill=`
 * link from another app or a web page lands on the same route, and it must not
 * be able to send a question on the runner's behalf. So the auto-send only
 * happens when an in-app button has armed it first, in memory, for exactly this
 * prefill text. An external link cannot set module state, so it falls back to
 * just showing the text in the input box for the runner to send or edit.
 */
let armedPrefill: string | null = null;

/** Called by an in-app button right before it navigates to the Coach screen. */
export function armCoachAutoSend(prefill: string): void {
  armedPrefill = prefill;
}

/** Called by the Coach screen; true once, and only if an in-app button armed this exact text. */
export function consumeCoachAutoSend(prefill: string | undefined): boolean {
  const ok = prefill !== undefined && armedPrefill !== null && armedPrefill === prefill;
  armedPrefill = null;
  return ok;
}

type Target = { planSessionId: string; activityId?: never } | { activityId: string; planSessionId?: never };

/** Arm the auto-send and return the Coach route for an in-app "Ask Coach" button. */
export function coachHref(target: Target, prefill: string): string {
  armCoachAutoSend(prefill);
  const ctx = target.planSessionId ? `planSessionId=${target.planSessionId}` : `activityId=${target.activityId}`;
  return `/(tabs)/coach?${ctx}&prefill=${encodeURIComponent(prefill)}`;
}
