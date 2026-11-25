type Candidate = { userId: string; externalId: string; name: string; department: string | null };

export async function resolveCheckinIdentity(exact: () => Promise<Candidate[]>, byName: () => Promise<Candidate[]>): Promise<{ match: 'exact' | 'selection' | 'none'; candidates: Candidate[] }> {
    const hits = [...new Map((await exact()).map(candidate => [candidate.userId, candidate])).values()];
    if (hits.length) return { match: hits.length === 1 ? 'exact' : 'selection', candidates: hits };
    const candidates = await byName();
    return { match: candidates.length ? 'selection' : 'none', candidates };
}
