/**
 * A note is stored as one text: its first line is the title and the rest is the body. A note
 * without a title starts with an empty line, so its body never turns into a title.
 */
export function noteParts(text: string): { title: string; body: string } {
  const at = text.indexOf('\n');
  if (at < 0) return { title: text.trim(), body: '' };
  return { title: text.slice(0, at).trim(), body: tidyBody(text.slice(at + 1)) };
}

/** The stored text for a title and a body; empty when both are. */
export function noteText(title: string, body: string): string {
  const head = title.replace(/\s+/g, ' ').trim();
  const rest = tidyBody(body);
  return rest ? `${head}\n${rest}` : head;
}

/** Blank lines before and spaces after the body go; its indents and inner lines stay. */
const tidyBody = (body: string) => body.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd();
