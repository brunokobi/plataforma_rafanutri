/** Formatação simples das evoluções: **negrito** e linhas começando com "- " viram lista. */

export interface Edit { text: string; start: number; end: number }

/** Põe (ou tira) ** em volta da seleção. Sem seleção, insere **texto** com "texto" selecionado. */
export function toggleBold(text: string, start: number, end: number): Edit {
  const sel = text.slice(start, end);
  if (sel.startsWith('**') && sel.endsWith('**') && sel.length >= 4) {
    const inner = sel.slice(2, -2);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  if (text.slice(start - 2, start) === '**' && text.slice(end, end + 2) === '**') {
    return { text: text.slice(0, start - 2) + sel + text.slice(end + 2), start: start - 2, end: end - 2 };
  }
  const inner = sel || 'texto';
  return { text: `${text.slice(0, start)}**${inner}**${text.slice(end)}`, start: start + 2, end: start + 2 + inner.length };
}

/** Transforma as linhas da seleção em itens de lista ("- "), ou tira se todas já forem. */
export function toggleList(text: string, start: number, end: number): Edit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end);
  const lineEnd = nl === -1 ? text.length : nl;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const all = lines.every((l) => l.startsWith('- '));
  const next = lines.map((l) => (all ? l.slice(2) : l.startsWith('- ') ? l : `- ${l}`)).join('\n');
  return { text: text.slice(0, lineStart) + next + text.slice(lineEnd), start: lineStart, end: lineStart + next.length };
}

export type Inline = { bold: boolean; text: string };
export type Block = { type: 'p'; lines: Inline[][] } | { type: 'ul'; items: Inline[][] };

export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ bold: false, text: line.slice(last, m.index) });
    out.push({ bold: true, text: m[1] ?? '' });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ bold: false, text: line.slice(last) });
  return out;
}

/** Quebra o texto em parágrafos e listas, para mostrar sem HTML do usuário. */
export function parseNote(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const last = blocks.at(-1);
    if (line.startsWith('- ')) {
      const item = parseInline(line.slice(2));
      if (last?.type === 'ul') last.items.push(item);
      else blocks.push({ type: 'ul', items: [item] });
    } else if (line.trim() === '') {
      blocks.push({ type: 'p', lines: [] });
    } else if (last?.type === 'p') {
      last.lines.push(parseInline(line));
    } else {
      blocks.push({ type: 'p', lines: [parseInline(line)] });
    }
  }
  return blocks.filter((b) => (b.type === 'p' ? b.lines.length > 0 : true));
}
