import { describe, expect, it } from 'vitest';
import { teamWhatsappLink } from '@/components/uan/unit-team';
import { formatCnpj, licenseStatus, validateStaffSignup, validateUnit } from '@/lib/uan/types';

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

  it('cadastro pelo convite da equipe (RN-220)', () => {
    const ok = { full_name: 'Maria Souza', email: 'maria@example.com', password: '12345678', confirm: '12345678' };
    expect(validateStaffSignup(ok)).toEqual({});
    expect(validateStaffSignup({ ...ok, full_name: ' ' }).full_name).toBeTruthy();
    expect(validateStaffSignup({ ...ok, email: 'maria@' }).email).toBeTruthy();
    expect(validateStaffSignup({ ...ok, password: '123', confirm: '123' }).password).toBeTruthy();
    expect(validateStaffSignup({ ...ok, confirm: '87654321' }).confirm).toMatch(/não conferem/);
  });

  it('mensagem do convite da equipe no WhatsApp', () => {
    const url = teamWhatsappLink('Cozinha Central', 'cook', 'https://x.test/uan/convite/abc');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1] ?? '');
    expect(text).toContain('Cozinha Central');
    expect(text).toContain('Cozinheiro(a)');
    expect(text).toContain('https://x.test/uan/convite/abc');
  });
});
