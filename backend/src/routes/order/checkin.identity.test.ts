import { expect, it } from 'vitest';
import { resolveCheckinIdentity } from './checkin.identity';

const budi = { userId: '1', externalId: 'EMP-001', name: 'Budi', department: null };
const ani = { userId: '2', externalId: '1234', name: 'Ani', department: null };

it('chooses a unique exact identifier, without using name search', async () => {
    expect(await resolveCheckinIdentity(async () => [budi, budi], async () => [ani])).toEqual({ match: 'exact', candidates: [budi] });
});

it('does not auto-select a name-only hit', async () => {
    expect(await resolveCheckinIdentity(async () => [], async () => [budi])).toEqual({ match: 'selection', candidates: [budi] });
});

it('requires selection when external ID and NIK match different people', async () => {
    expect(await resolveCheckinIdentity(async () => [ani, budi], async () => [])).toEqual({ match: 'selection', candidates: [ani, budi] });
});
