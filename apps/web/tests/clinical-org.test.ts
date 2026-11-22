import { describe, expect, it } from 'vitest';
import type { UserOrganization } from '@/lib/auth/landing';
import { pickClinicalOrg } from '@/lib/auth/clinical-org';

const org = (id: string, role: UserOrganization['role']) => ({ id, role, name: id, plan: 'free' }) as UserOrganization;

describe('pickClinicalOrg', () => {
  it('primeiro consultório em que é owner ou nutricionista; nulo para assistente ou sem consultório', () => {
    expect(pickClinicalOrg([org('a', 'assistant'), org('b', 'nutritionist'), org('c', 'owner')])?.id).toBe('b');
    expect(pickClinicalOrg([org('a', 'assistant')])).toBeNull();
    expect(pickClinicalOrg(null)).toBeNull();
    expect(pickClinicalOrg(undefined)).toBeNull();
  });
});
