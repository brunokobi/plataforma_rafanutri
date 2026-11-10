import { describe, expect, it } from 'vitest';
import { MODULES, type ModuleDefinition } from '@/lib/modules/catalog';
import { buildModuleSections, resolveModuleAccess } from '@/lib/modules/access';
import { PLANS } from '@/lib/modules/plans';

const byCode = (code: string) => MODULES.find((m) => m.code === code)!;

describe('catálogo e planos', () => {
  it('tem os 7 módulos da spec', () => {
    expect(MODULES.map((m) => m.code)).toEqual(['clinical', 'patient_area', 'practice', 'ai', 'maternal', 'uan', 'public_health']);
  });
  it('todo plano define acesso para todo módulo', () => {
    for (const p of PLANS) for (const m of MODULES) expect(p.grants[m.code]).toBeDefined();
  });
  it('plano gratuito tem limite de 20 pacientes e 1 membro', () => {
    const free = PLANS.find((p) => p.code === 'free')!;
    expect([free.maxActivePatients, free.maxMembers]).toEqual([20, 1]);
  });
});

describe('plano gratuito na tela principal', () => {
  const { mine, others } = buildModuleSections('free');

  it('"Seus módulos" tem Clínico, Área do paciente e IA (cota)', () => {
    expect(mine.map((v) => v.module.code)).toEqual(['clinical', 'patient_area', 'ai']);
    expect(mine.find((v) => v.module.code === 'ai')?.grant).toBe('quota');
  });
  it('os demais aparecem com o plano que libera', () => {
    expect(others.map((v) => [v.module.code, v.status])).toEqual([
      ['practice', 'upgrade'],
      ['maternal', 'upgrade'],
      ['uan', 'upgrade'],
      ['public_health', 'contract'],
    ]);
    expect(others.find((v) => v.module.code === 'practice')?.unlockedBy[0]?.name).toBe('Essencial');
    expect(others.find((v) => v.module.code === 'maternal')?.unlockedBy[0]?.name).toBe('Profissional');
    expect(others.find((v) => v.module.code === 'uan')?.unlockedBy[0]?.name).toBe('Enterprise UAN');
  });
  it('módulo incluso e ainda em construção fica "em breve"', () => {
    expect(mine.every((v) => v.status === 'included_soon')).toBe(true);
  });
});

describe('resolveModuleAccess', () => {
  it('módulo incluso e publicado fica disponível', () => {
    const published: ModuleDefinition = { ...byCode('clinical'), availability: 'available', href: '/app/pacientes' };
    expect(resolveModuleAccess('free', published).status).toBe('available');
  });
  it('Enterprise UAN libera só a UAN', () => {
    const { mine } = buildModuleSections('enterprise_uan');
    expect(mine.map((v) => v.module.code)).toEqual(['uan']);
  });
  it('Profissional inclui IA sem cota e Materno-infantil', () => {
    expect(resolveModuleAccess('professional', byCode('ai')).grant).toBe('included');
    expect(resolveModuleAccess('professional', byCode('maternal')).status).toBe('included_soon');
  });
});
