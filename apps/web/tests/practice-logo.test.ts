import { describe, expect, it } from 'vitest';
import { fitSize, logoInputError } from '@/lib/practice/resize-logo';

describe('logo do consultório (RN-204)', () => {
  it('reduz mantendo a proporção e não amplia', () => {
    expect(fitSize(2000, 1000, 512)).toEqual({ width: 512, height: 256 });
    expect(fitSize(300, 600, 512)).toEqual({ width: 256, height: 512 });
    expect(fitSize(200, 100, 512)).toEqual({ width: 200, height: 100 });
    expect(fitSize(0, 0, 512)).toEqual({ width: 512, height: 512 });
  });

  it('aceita PNG, JPG, WebP e SVG até 5 MB', () => {
    expect(logoInputError({ type: 'image/svg+xml', size: 10_000 })).toBeNull();
    expect(logoInputError({ type: 'image/gif', size: 10_000 })).toMatch(/PNG, JPG, WebP ou SVG/);
    expect(logoInputError({ type: 'image/png', size: 6_000_000 })).toMatch(/5 MB/);
  });
});
