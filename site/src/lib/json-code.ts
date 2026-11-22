export function renderJsonCode(target: HTMLElement, json: string) {
  const fragment = document.createDocumentFragment();
  const tokens = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[,:]/g;

  for (const text of json.split("\n")) {
    if (fragment.hasChildNodes()) fragment.append("\n");
    const line = document.createElement("span");
    line.className = "codeblock-line";

    let cursor = 0;
    for (const match of text.matchAll(tokens)) {
      const value = match[0];
      const start = match.index;
      if (start > cursor) line.append(text.slice(cursor, start));
      cursor = start + value.length;

      const token = document.createElement("span");
      // JSON.stringify puts the key’s colon immediately after the closing quote.
      if (value.startsWith('"')) token.dataset.syntax = text[cursor] === ":" ? "keyword" : "string";
      else token.dataset.syntax = value === "," || value === ":" ? "punctuation" : "constant";
      token.textContent = value;
      line.append(token);
    }
    if (cursor < text.length) line.append(text.slice(cursor));
    fragment.append(line);
  }

  target.replaceChildren(fragment);
}
