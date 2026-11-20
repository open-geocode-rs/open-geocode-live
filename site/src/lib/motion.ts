// Timings for scripts, read from the duration tokens, so no script writes a duration of its own.

export type Duration = "press" | "hover" | "enter" | "panel" | "feedback";

/** A duration token in milliseconds, as the page resolves it. */
export function duration(name: Duration): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--duration-${name}`).trim();
  const amount = Number.parseFloat(value);
  return value.endsWith("ms") ? amount : amount * 1000;
}

/** Runs a function once a duration has passed, and returns a function that cancels it. */
export function after(name: Duration, run: () => void): () => void {
  const id = window.setTimeout(run, duration(name));
  return () => window.clearTimeout(id);
}
