import { describe, expect, it } from 'vitest';
import { feedbackPage, validateFeedback } from '@/lib/feedback/schema';

describe('feedback do beta (RN-047)', () => {
  it('guarda só o caminho da página', () => {
    expect(feedbackPage('/app/pacientes/123?aba=planos#x')).toBe('/app/pacientes/123');
    expect(feedbackPage('/app/agenda')).toBe('/app/agenda');
    expect(feedbackPage('//evil.com/x')).toBeUndefined();
    expect(feedbackPage('https://x.com')).toBeUndefined();
    expect(feedbackPage(null)).toBeUndefined();
    expect(feedbackPage(`/${'a'.repeat(300)}`)!.length).toBe(200);
  });

  it('valida tipo e tamanho da mensagem', () => {
    expect(validateFeedback({ kind: 'bug', message: 'Não salva' })).toBeNull();
    expect(validateFeedback({ kind: 'idea', message: '  a ' })).toMatch(/3 caracteres/);
    expect(validateFeedback({ kind: 'idea', message: 'a'.repeat(2001) })).toMatch(/2.000/);
    expect(validateFeedback({ kind: 'spam' as never, message: 'texto ok' })).toMatch(/tipo/);
  });
});
