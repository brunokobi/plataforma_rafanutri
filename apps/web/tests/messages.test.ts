import { describe, expect, it } from 'vitest';
import { avatarInitials } from '@/components/messages/avatar';
import { navModel } from '@/components/app/app-nav';
import { chatRows, dayLabel, linkify, listTimeLabel, mergeMessages, type ChatMessage } from '@/lib/messages/types';

const m = (id: string, created_at: string, sender: ChatMessage['sender'] = 'patient'): ChatMessage => ({ id, sender, body: id, created_at, read_at: null });
const NOW = new Date('2026-11-28T15:00:00Z'); // 12:00 em São Paulo

describe('mensagens', () => {
  it('junta novas sem repetir e em ordem de envio', () => {
    const cur = [m('a', '2026-11-28T10:00:00.000Z'), m('b', '2026-11-28T10:01:00.000Z')];
    const out = mergeMessages(cur, [{ ...m('b', '2026-11-28T10:01:00.000Z'), read_at: '2026-11-28T10:02:00Z' }, m('c', '2026-11-28T10:00:30.000Z')]);
    expect(out.map((x) => x.id)).toEqual(['a', 'c', 'b']);
    expect(out[2]!.read_at).toBe('2026-11-28T10:02:00Z');
    expect(mergeMessages(cur, [])).toBe(cur);
  });

  it('rótulo do dia no fuso de São Paulo', () => {
    expect(dayLabel('2026-11-28T14:00:00Z', NOW)).toBe('Hoje');
    expect(dayLabel('2026-11-28T02:00:00Z', NOW)).toBe('Ontem'); // 23:00 do dia 27 em SP
    expect(dayLabel('2026-11-25T14:00:00Z', NOW)).toMatch(/quarta/);
    expect(dayLabel('2026-11-01T14:00:00Z', NOW)).toBe('01/11/2026');
    expect(listTimeLabel('2026-11-28T13:05:00Z', NOW)).toBe('10:05');
    expect(listTimeLabel('2026-11-20T13:05:00Z', NOW)).toBe('20/11');
  });

  it('separa por dia e agrupa mensagens seguidas do mesmo remetente', () => {
    const rows = chatRows([
      m('a', '2026-11-27T14:00:00Z'),
      m('b', '2026-11-28T14:00:00Z'), m('c', '2026-11-28T14:01:00Z'),
      m('d', '2026-11-28T14:02:00Z', 'professional'),
      m('e', '2026-11-28T14:30:00Z', 'professional'),
    ], NOW);
    expect(rows.filter((r) => r.kind === 'day').map((r) => r.kind === 'day' && r.label)).toEqual(['Ontem', 'Hoje']);
    const msgs = rows.flatMap((r) => (r.kind === 'msg' ? [[r.message.id, r.first, r.last]] : []));
    expect(msgs).toEqual([['a', true, true], ['b', true, false], ['c', false, true], ['d', true, true], ['e', true, true]]);
  });

  it('links clicáveis sem pegar a pontuação final', () => {
    expect(linkify('veja https://exemplo.com/a?b=1. ok')).toEqual([{ text: 'veja ' }, { text: 'https://exemplo.com/a?b=1', href: 'https://exemplo.com/a?b=1' }, { text: '. ok' }]);
    expect(linkify('sem link')).toEqual([{ text: 'sem link' }]);
    expect(linkify('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }]);
  });

  it('iniciais do avatar e link no menu', () => {
    expect(avatarInitials('Ana Paula Souza')).toBe('AS');
    expect(avatarInitials('ana')).toBe('A');
    expect(avatarInitials('')).toBe('?');
    expect(navModel('/app').flatMap((g) => g.links.map((l) => l.href))).toContain('/app/mensagens');
  });
});
