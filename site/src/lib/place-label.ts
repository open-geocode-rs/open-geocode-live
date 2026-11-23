export function splitPlaceLabel(label: string, name?: string) {
  const separator = name && label.startsWith(`${name}, `) ? name.length : label.indexOf(", ");
  if (separator < 0) return { title: label, detail: "" };
  return { title: label.slice(0, separator), detail: label.slice(separator + 2) };
}
