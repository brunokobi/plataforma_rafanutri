import { describe, expect, it } from 'vitest';
import { onboardingSchema, profileStep, serviceStep, validateLogo } from '@/lib/validation/onboarding';
import { passwordStrength, signupSchema } from '@/lib/validation/signup';

const valid = { full_name: 'Ana Souza', email: 'ana@consultorio.com.br', password: 'nutri2026', confirm_password: 'nutri2026', accept_terms: true };

describe('signupSchema', () => {
  it('aceita um cadastro válido', () => expect(signupSchema.safeParse(valid).success).toBe(true));
  it.each([
    [{ full_name: 'Ana' }, 'Informe nome e sobrenome.'],
    [{ password: 'semnumero', confirm_password: 'semnumero' }, 'Use letras e números na senha.'],
    [{ password: 'abc12', confirm_password: 'abc12' }, 'A senha precisa ter pelo menos 8 caracteres.'],
    [{ confirm_password: 'outra123' }, 'As senhas não conferem.'],
    [{ accept_terms: false }, 'É preciso aceitar os termos para continuar.'],
  ])('rejeita %j', (patch, message) => {
    const r = signupSchema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain(message);
  });
});

describe('passwordStrength', () => {
  it.each([
    ['', 0],
    ['abc', 1],
    ['abcdefgh', 2],
    ['nutri2026', 3],
    ['Nutri#2026forte', 4],
  ])('%j → %i', (pw, score) => expect(passwordStrength(pw)).toBe(score));
});

describe('onboarding', () => {
  it('CRN só com números e regional obrigatória', () => {
    expect(profileStep.safeParse({ professional_name: 'Ana Souza', crn: '12345', crn_region: 'CRN-9' }).success).toBe(true);
    expect(profileStep.safeParse({ professional_name: 'Ana Souza', crn: '12a45', crn_region: 'CRN-9' }).success).toBe(false);
    expect(profileStep.safeParse({ professional_name: 'Ana Souza', crn: '12345', crn_region: 'CRN-12' }).success).toBe(false);
  });
  it('exige ao menos uma modalidade de atendimento', () => {
    expect(serviceStep.safeParse({ service_modes: [], areas: [] }).success).toBe(false);
    expect(serviceStep.safeParse({ service_modes: ['online'], areas: [] }).success).toBe(true);
  });
  it('schema completo valida o envio final', () => {
    const r = onboardingSchema.safeParse({
      professional_name: 'Ana Souza', crn: '12345', crn_region: 'CRN-9', practice_name: 'Ana Nutri',
      practice_type: 'solo', brand_color: '#2E7D32', service_modes: ['in_person', 'online'], areas: ['Diabetes'],
    });
    expect(r.success).toBe(true);
  });
  it('valida tipo e tamanho do logo', () => {
    expect(validateLogo({ type: 'image/png', size: 1000 })).toBeNull();
    expect(validateLogo({ type: 'image/gif', size: 1000 })).toBe('Use uma imagem PNG, JPG ou SVG.');
    expect(validateLogo({ type: 'image/png', size: 3 * 1024 * 1024 })).toBe('A imagem precisa ter até 2 MB.');
  });
});
