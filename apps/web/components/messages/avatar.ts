/** Iniciais para o avatar: "Ana Paula Souza" → "AS". */
export function avatarInitials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const pick = parts.length > 1 ? [parts[0]!, parts.at(-1)!] : parts.slice(0, 1);
  return pick.map((w) => w[0]!.toUpperCase()).join('') || '?';
}
