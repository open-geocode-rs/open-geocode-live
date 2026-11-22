export async function copyText(text: string, container: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older or embedded browsers may refuse the Clipboard API.
    const holder = document.createElement("pre");
    holder.setAttribute("aria-hidden", "true");
    holder.textContent = text;
    container.append(holder);
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(holder);
    selection?.removeAllRanges();
    selection?.addRange(range);
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      selection?.removeAllRanges();
      holder.remove();
    }
  }
}
