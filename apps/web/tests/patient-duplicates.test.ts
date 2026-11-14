import { describe, expect, it } from 'vitest';
import { comparableName, findDuplicates, type DuplicateCandidate } from '@/lib/patients/schema';

const base: DuplicateCandidate[] = [
  { id: '1', full_name: 'Maria José da Silva', birth_date: '1990-05-01', status: 'active' },
  { id: '2', full_name: 'Maria Jose  da Silva', birth_date: '1985-01-01', status: 'archived' },
  { id: '3', full_name: 'Maria José da Silva Souza', birth_date: '1990-05-01', status: 'active' },
  { id: '4', full_name: 'MARIA JOSÉ DA SILVA', birth_date: null, status: 'inactive' },
];

describe('pacientes duplicados (RN-020)', () => {
  it('normaliza acento, caixa e espaços', () => {
    expect(comparableName('  Maria   JOSÉ ')).toBe('maria jose');
  });
  it('mesmo nome e nascimento; sem data de um dos lados também avisa', () => {
    expect(findDuplicates({ full_name: 'maria jose da silva', birth_date: '1990-05-01' }, base).map((d) => d.id)).toEqual(['1', '4']);
  });
  it('sem data no novo: todos com o mesmo nome', () => {
    expect(findDuplicates({ full_name: 'Maria José da Silva', birth_date: '' }, base).map((d) => d.id)).toEqual(['1', '2', '4']);
  });
  it('nome diferente não avisa', () => {
    expect(findDuplicates({ full_name: 'Maria José', birth_date: '1990-05-01' }, base)).toEqual([]);
  });
});
