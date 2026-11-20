// Timings for scripts, read from the duration tokens, so no script writes a duration of its own.

/** A duration token, named in full by the script that reads it. */
export type Duration = "--duration-press" | "--duration-hover" | "--duration-enter" | "--duration-panel" | "--duration-feedback";

/** A duration token in milliseconds, as the page resolves it. */
export function duration(token: Duration): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const amount = Number.parseFloat(value);
  return value.endsWith("ms") ? amount : amount * 1000;
}

/** Runs a function once a duration has passed, and returns a function that cancels it. */
export function after(token: Duration, run: () => void): () => void {
  const id = window.setTimeout(run, duration(token));
  return () => window.clearTimeout(id);
}
