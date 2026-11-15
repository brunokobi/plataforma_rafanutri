import { describe, expect, it } from 'vitest';
import { formatCnpj, licenseStatus, validateUnit } from '@/lib/uan/types';

describe('UAN — unidades (RN-121 a RN-123)', () => {
  it('situação do alvará sanitário', () => {
    expect(licenseStatus(null, '2026-11-15')).toEqual({ status: 'missing', days: null });
    expect(licenseStatus('2026-11-14', '2026-11-15')).toEqual({ status: 'expired', days: -1 });
    expect(licenseStatus('2026-11-15', '2026-11-15')).toEqual({ status: 'expiring', days: 0 });
    expect(licenseStatus('2026-12-15', '2026-11-15')).toEqual({ status: 'expiring', days: 30 });
    expect(licenseStatus('2026-12-16', '2026-11-15')).toEqual({ status: 'ok', days: 31 });
  });

  it('formata CNPJ só quando tem 14 dígitos', () => {
    expect(formatCnpj('12345678000190')).toBe('12.345.678/0001-90');
    expect(formatCnpj('123')).toBe('123');
    expect(formatCnpj(null)).toBe('');
  });

  it('valida a unidade', () => {
    const ok = { name: 'Cozinha Central', kind: 'industrial' as const };
    expect(validateUnit(ok)).toEqual({});
    expect(validateUnit({ ...ok, cnpj: '12.345.678/0001-90', state: 'es', geo_lat: '-20.31', geo_lng: '-40.31', geo_radius_m: '150' })).toEqual({});
    expect(validateUnit({ ...ok, name: 'A' }).name).toBeTruthy();
    expect(validateUnit({ ...ok, cnpj: '1234' }).cnpj).toBeTruthy();
    expect(validateUnit({ ...ok, state: 'ESP' }).state).toBeTruthy();
    expect(validateUnit({ ...ok, geo_lat: '-20.3' }).geo_lat).toMatch(/juntas/);
    expect(validateUnit({ ...ok, geo_lat: '-95', geo_lng: '10' }).geo_lat).toMatch(/Latitude/);
    expect(validateUnit({ ...ok, geo_lat: '10', geo_lng: '200' }).geo_lng).toMatch(/Longitude/);
    expect(validateUnit({ ...ok, geo_radius_m: '10' }).geo_radius_m).toBeTruthy();
  });
});
