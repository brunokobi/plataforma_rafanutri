import { describe, expect, it } from 'vitest';
import { centsInWords, integerInWords } from '@/lib/finance/in-words';

describe('valor por extenso (RN-055)', () => {
  it('casos do critério de aceite', () => {
    expect(centsInWords(1)).toBe('um centavo');
    expect(centsInWords(100000)).toBe('mil reais');
    expect(centsInWords(123456789)).toBe('um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete reais e oitenta e nove centavos');
  });
  it('valores comuns de consulta', () => {
    expect(centsInWords(25000)).toBe('duzentos e cinquenta reais');
    expect(centsInWords(25050)).toBe('duzentos e cinquenta reais e cinquenta centavos');
    expect(centsInWords(100)).toBe('um real');
    expect(centsInWords(10000)).toBe('cem reais');
    expect(centsInWords(10100)).toBe('cento e um reais');
    expect(centsInWords(1999)).toBe('dezenove reais e noventa e nove centavos');
    expect(centsInWords(0)).toBe('zero real');
  });
  it('"e" entre grupos e "de reais" no milhão redondo', () => {
    expect(integerInWords(1100)).toBe('mil e cem');
    expect(integerInWords(1020)).toBe('mil e vinte');
    expect(integerInWords(1250)).toBe('mil, duzentos e cinquenta');
    expect(integerInWords(2000000)).toBe('dois milhões');
    expect(centsInWords(200000000)).toBe('dois milhões de reais');
    expect(integerInWords(1000001)).toBe('um milhão e um');
    expect(integerInWords(21000)).toBe('vinte e um mil');
  });
});
