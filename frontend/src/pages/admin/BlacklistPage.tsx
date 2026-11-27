import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban, Unlock, UserPlus, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { formatDateTimeShortWIB } from '../../utils/timezone';
import { useSSERefresh, USER_EVENTS } from '../../contexts/SSEContext';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    Pagination,
    Modal,
    Field,
    Input,
    Textarea,
    EmptyState,
    Skeleton,
    SegmentedControl,
} from '../../components/ui';

interface Blacklist {
    id: string;
    reason: string;
    startDate: string;
    endDate: string | null;
    isActive: boolean;
    user: {
        id: string;
        externalId: string;
        name: string;
        company: string;
        division: string;
        department: string;
        noShowCount: number;
    };
}

interface SearchUser {
    id: string;
    externalId: string;
    name: string;
    company: string;
    department: string;
}

export default function BlacklistPage() {
    const [blacklists, setBlacklists] = useState<Blacklist[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [showAll, setShowAll] = useState(false);

    // Modals
    const [showBlacklistModal, setShowBlacklistModal] = useState(false);
    const [unblockTarget, setUnblockTarget] = useState<Blacklist | null>(null);
    const [detailEntry, setDetailEntry] = useState<Blacklist | null>(null);

    // Deep-link `?id=<blacklistId>`
    const [searchParams, setSearchParams] = useSearchParams();
    const deepLinkId = searchParams.get('id');
    const deepLinkConsumed = useRef(false);

    // Blacklist form state
    const [searchTerm, setSearchTerm] = useState('');
    const [foundUsers, setFoundUsers] = useState<SearchUser[]>([]);
    const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
    const [blReason, setBlReason] = useState('');
    const [durationType, setDurationType] = useState<'temporary' | 'permanent'>('temporary');
    const [durationDays, setDurationDays] = useState(7);
    const [blPassword, setBlPassword] = useState('');
    const [blSubmitting, setBlSubmitting] = useState(false);

    // Unblock form state
    const [unblockReason, setUnblockReason] = useState('');
    const [unblockReduceBy, setUnblockReduceBy] = useState('');
    const [unblockPassword, setUnblockPassword] = useState('');
    const [unblockSubmitting, setUnblockSubmitting] = useState(false);

    const loadBlacklists = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '20',
                active: (!showAll).toString(),
            });
            const res = await api.get(`/api/blacklist?${params}`);
            setBlacklists(res.data.blacklists || []);
            setTotalPages(res.data.pagination?.totalPages || 1);
            setTotal(res.data.pagination?.total || (res.data.blacklists || []).length);
        } catch (error) {
            console.error('Failed to load blacklist:', error);
            toast.error('Gagal memuat daftar blacklist');
        } finally {
            setIsLoading(false);
        }
    }, [page, showAll]);

    useEffect(() => {
        loadBlacklists();
    }, [loadBlacklists]);

    useSSERefresh(USER_EVENTS, loadBlacklists);

    useEffect(() => {
        if (deepLinkConsumed.current || !deepLinkId || isLoading) return;
        const match = blacklists.find((b) => b.id === deepLinkId);
        if (match) {
            setDetailEntry(match);
            deepLinkConsumed.current = true;
            const next = new URLSearchParams(searchParams);
            next.delete('id');
            setSearchParams(next, { replace: true });
        } else if (page < totalPages && page < 5) {
            setPage((p) => p + 1);
        }
    }, [deepLinkId, isLoading, blacklists, page, totalPages, searchParams, setSearchParams]);

    // Debounced search for user in Blacklist modal
    useEffect(() => {
        if (!showBlacklistModal || searchTerm.trim().length < 2) {
            setFoundUsers([]);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const res = await api.get(`/api/users?search=${encodeURIComponent(searchTerm)}&role=USER&limit=10`);
                setFoundUsers(res.data.users || []);
            } catch {
                setFoundUsers([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, showBlacklistModal]);

    const closeBlacklistModal = () => {
        setShowBlacklistModal(false);
        setSearchTerm('');
        setFoundUsers([]);
        setSelectedUser(null);
        setBlReason('');
        setDurationType('temporary');
        setDurationDays(7);
        setBlPassword('');
    };

    const submitBlacklist = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser) {
            toast.error('Pilih karyawan terlebih dahulu');
            return;
        }
        if (blReason.trim().length < 10) {
            toast.error('Alasan minimal 10 karakter');
            return;
        }
        if (!blPassword) {
            toast.error('Password admin wajib diisi');
            return;
        }
        setBlSubmitting(true);
        try {
            await api.post('/api/blacklist', {
                userId: selectedUser.id,
                reason: blReason.trim(),
                durationDays: durationType === 'permanent' ? null : durationDays,
                adminPassword: blPassword,
            });
            toast.success(`${selectedUser.name} berhasil diblacklist`);
            closeBlacklistModal();
            loadBlacklists();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal memblacklist pengguna');
        } finally {
            setBlSubmitting(false);
        }
    };

    const submitUnblock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!unblockTarget) return;
        const currentStrikes = unblockTarget.user.noShowCount;
        if (currentStrikes > 0) {
            const num = parseInt(unblockReduceBy, 10);
            if (!unblockReduceBy || isNaN(num) || num < 1 || num > currentStrikes) {
                toast.error(`Masukkan jumlah penurunan strike (1–${currentStrikes})`);
                return;
            }
        }
        if (unblockReason.trim().length < 10) {
            toast.error('Alasan minimal 10 karakter');
            return;
        }
        if (!unblockPassword) {
            toast.error('Password admin wajib diisi');
            return;
        }

        setUnblockSubmitting(true);
        try {
            await api.post(`/api/blacklist/${unblockTarget.id}/unblock`, {
                adminPassword: unblockPassword,
                reason: unblockReason.trim(),
                reduceBy: unblockReduceBy || undefined,
            });
            toast.success(`${unblockTarget.user.name} berhasil di-unblock`);
            setUnblockTarget(null);
            setUnblockReason('');
            setUnblockReduceBy('');
            setUnblockPassword('');
            loadBlacklists();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal meng-unblock pengguna');
        } finally {
            setUnblockSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            <PageHeader
                title="Blacklist pengguna"
                subtitle="Kelola pemblokiran akibat akumulasi no-show atau pelanggaran"
                actions={
                    <>
                        <SegmentedControl
                            ariaLabel="Filter status blacklist"
                            layoutId="blacklist-filter"
                            value={showAll ? 'all' : 'active'}
                            onChange={(v) => {
                                setShowAll(v === 'all');
                                setPage(1);
                            }}
                            options={[
                                { value: 'active', label: 'Aktif saja' },
                                { value: 'all', label: 'Semua riwayat' },
                            ]}
                        />
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setShowBlacklistModal(true)}
                            leftIcon={<UserPlus className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Blacklist manual
                        </Button>
                    </>
                }
            />

            <Card padding="none">
                {isLoading ? (
                    <div className="p-4 space-y-2.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                        ))}
                    </div>
                ) : blacklists.length === 0 ? (
                    <EmptyState
                        icon={<Ban className="w-6 h-6" />}
                        title={showAll ? 'Belum ada riwayat blacklist' : 'Tidak ada blacklist aktif'}
                        description="Pengguna yang mencapai batas strike otomatis akan tampil di sini."
                    />
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="bg-[#fafaf9] border-b border-[#f5f5f4]">
                                        <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Karyawan
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Perusahaan / Dept
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Alasan
                                        </th>
                                        <th className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Strike
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Berakhir
                                        </th>
                                        <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Status
                                        </th>
                                        <th className="text-right px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                            Aksi
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#f5f5f4]">
                                    {blacklists.map((entry) => (
                                        <tr key={entry.id} className="hover:bg-[#fafaf9]">
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-[#1c1917]">{entry.user.name}</div>
                                                <div className="text-[11.5px] font-mono text-[#78716c]">
                                                    {entry.user.externalId}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-[#57534e]">
                                                <div>{entry.user.company || '-'}</div>
                                                <div className="text-[11.5px] text-[#78716c]">
                                                    {entry.user.department || '-'}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 max-w-xs text-[#1c1917]">
                                                <div className="line-clamp-2">{entry.reason}</div>
                                            </td>
                                            <td className="px-3 py-3 text-right font-bold tabular-nums text-[#b91c1c]">
                                                {entry.user.noShowCount}
                                            </td>
                                            <td className="px-3 py-3 text-[#57534e] whitespace-nowrap text-[12px]">
                                                {entry.endDate ? (
                                                    formatDateTimeShortWIB(entry.endDate)
                                                ) : (
                                                    <Badge variant="warning">Permanen</Badge>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap">
                                                <Badge variant={entry.isActive ? 'danger' : 'neutral'} dot={entry.isActive}>
                                                    {entry.isActive ? 'Diblokir' : 'Selesai'}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <div className="inline-flex items-center gap-1.5">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setDetailEntry(entry)}
                                                        aria-label={`Detail ${entry.user.name}`}
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </Button>
                                                    {entry.isActive && (
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => {
                                                                setUnblockTarget(entry);
                                                                setUnblockReduceBy(
                                                                    entry.user.noShowCount > 0
                                                                        ? String(entry.user.noShowCount)
                                                                        : ''
                                                                );
                                                            }}
                                                            leftIcon={<Unlock className="w-3.5 h-3.5 text-[#15803d]" />}
                                                        >
                                                            Unblock
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <Pagination
                            page={page}
                            limit={20}
                            total={total}
                            onPageChange={setPage}
                            variant="admin"
                        />
                    </>
                )}
            </Card>

            {/* Manual Blacklist Modal */}
            <Modal
                open={showBlacklistModal}
                onClose={closeBlacklistModal}
                title="Blacklist pengguna manual"
                size="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={closeBlacklistModal}>
                            Batal
                        </Button>
                        <Button variant="danger" loading={blSubmitting} onClick={submitBlacklist}>
                            Blacklist pengguna
                        </Button>
                    </>
                }
            >
                <form onSubmit={submitBlacklist} className="space-y-4">
                    <Field label="Cari karyawan" required>
                        <Input
                            value={selectedUser ? `${selectedUser.name} (${selectedUser.externalId})` : searchTerm}
                            onChange={(e) => {
                                setSelectedUser(null);
                                setSearchTerm(e.target.value);
                            }}
                            placeholder="Ketik nama atau ID karyawan (min. 2 huruf)..."
                        />
                        {!selectedUser && foundUsers.length > 0 && (
                            <div className="mt-1.5 max-h-40 overflow-y-auto rounded-[10px] border border-[#e7e5e4] bg-[#fff] divide-y divide-[#f5f5f4]">
                                {foundUsers.map((u) => (
                                    <button
                                        key={u.id}
                                        type="button"
                                        onClick={() => setSelectedUser(u)}
                                        className="w-full px-3 py-2 text-left hover:bg-[#fafaf9] border-0 bg-transparent cursor-pointer"
                                    >
                                        <div className="text-[13px] font-semibold text-[#1c1917]">{u.name}</div>
                                        <div className="text-[11.5px] text-[#78716c]">
                                            {u.externalId} · {u.department || u.company}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </Field>

                    <Field label="Alasan pemblokiran" required hint={`${blReason.length}/10 karakter minimum`}>
                        <Textarea
                            rows={3}
                            value={blReason}
                            onChange={(e) => setBlReason(e.target.value)}
                            placeholder="Masukkan alasan yang jelas..."
                        />
                    </Field>

                    <div className="space-y-2">
                        <div className="text-[12.5px] font-semibold text-[#44403c]">Durasi</div>
                        <div className="flex items-center gap-4 text-[13px]">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={durationType === 'temporary'}
                                    onChange={() => setDurationType('temporary')}
                                />
                                Sementara
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={durationType === 'permanent'}
                                    onChange={() => setDurationType('permanent')}
                                />
                                Permanen
                            </label>
                        </div>
                        {durationType === 'temporary' && (
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={durationDays}
                                    onChange={(e) =>
                                        setDurationDays(Math.max(1, parseInt(e.target.value, 10) || 1))
                                    }
                                    className="w-24"
                                />
                                <span className="text-[13px] text-[#78716c]">hari</span>
                            </div>
                        )}
                    </div>

                    <Field label="Konfirmasi password admin" required>
                        <Input
                            type="password"
                            value={blPassword}
                            onChange={(e) => setBlPassword(e.target.value)}
                            placeholder="Masukkan password Anda..."
                        />
                    </Field>
                </form>
            </Modal>

            {/* Unblock Modal */}
            <Modal
                open={Boolean(unblockTarget)}
                onClose={() => {
                    setUnblockTarget(null);
                    setUnblockReason('');
                    setUnblockReduceBy('');
                    setUnblockPassword('');
                }}
                title={`Unblock — ${unblockTarget?.user.name || ''}`}
                size="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setUnblockTarget(null)}>
                            Batal
                        </Button>
                        <Button variant="primary" loading={unblockSubmitting} onClick={submitUnblock}>
                            Konfirmasi unblock
                        </Button>
                    </>
                }
            >
                {unblockTarget && (
                    <form onSubmit={submitUnblock} className="space-y-3">
                        <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4] text-[13px]">
                            <div className="font-semibold text-[#1c1917]">{unblockTarget.user.name}</div>
                            <div className="text-[12px] text-[#78716c]">
                                {unblockTarget.user.externalId} · Strike saat ini: {unblockTarget.user.noShowCount}
                            </div>
                        </div>

                        {unblockTarget.user.noShowCount > 0 && (
                            <Field
                                label={`Kurangi strike (1–${unblockTarget.user.noShowCount})`}
                                required
                                hint="Wajib menurunkan strike agar tidak langsung terkena blokir otomatis ulang."
                            >
                                <Input
                                    type="number"
                                    min={1}
                                    max={unblockTarget.user.noShowCount}
                                    value={unblockReduceBy}
                                    onChange={(e) => setUnblockReduceBy(e.target.value)}
                                />
                            </Field>
                        )}

                        <Field label="Alasan unblock" required hint={`${unblockReason.length}/10 karakter minimum`}>
                            <Textarea
                                rows={2}
                                value={unblockReason}
                                onChange={(e) => setUnblockReason(e.target.value)}
                                placeholder="Contoh: Sanggahan diterima dengan bukti lembur..."
                            />
                        </Field>

                        <Field label="Konfirmasi password admin" required>
                            <Input
                                type="password"
                                value={unblockPassword}
                                onChange={(e) => setUnblockPassword(e.target.value)}
                            />
                        </Field>
                    </form>
                )}
            </Modal>

            {/* Detail Modal */}
            <Modal
                open={Boolean(detailEntry)}
                onClose={() => setDetailEntry(null)}
                title="Detail blacklist"
                size="md"
                footer={
                    <>
                        {detailEntry?.isActive && (
                            <Button
                                variant="primary"
                                onClick={() => {
                                    const target = detailEntry;
                                    setDetailEntry(null);
                                    setUnblockTarget(target);
                                }}
                                leftIcon={<Unlock className="w-3.5 h-3.5" />}
                            >
                                Unblock pengguna
                            </Button>
                        )}
                        <Button variant="secondary" onClick={() => setDetailEntry(null)}>
                            Tutup
                        </Button>
                    </>
                }
            >
                {detailEntry && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                                <div className="text-[11px] font-semibold uppercase text-[#78716c]">Status</div>
                                <div className="mt-1">
                                    <Badge variant={detailEntry.isActive ? 'danger' : 'neutral'}>
                                        {detailEntry.isActive ? 'Aktif' : 'Selesai'}
                                    </Badge>
                                </div>
                            </div>
                            <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                                <div className="text-[11px] font-semibold uppercase text-[#78716c]">Strike no-show</div>
                                <div className="text-[20px] font-extrabold text-[#b91c1c] mt-0.5 tabular-nums">
                                    {detailEntry.user.noShowCount}
                                </div>
                            </div>
                            <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                                <div className="text-[11px] font-semibold uppercase text-[#78716c]">Mulai</div>
                                <div className="text-[13px] font-medium text-[#1c1917] mt-0.5">
                                    {formatDateTimeShortWIB(detailEntry.startDate)}
                                </div>
                            </div>
                            <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                                <div className="text-[11px] font-semibold uppercase text-[#78716c]">Berakhir</div>
                                <div className="text-[13px] font-medium text-[#1c1917] mt-0.5">
                                    {detailEntry.endDate ? formatDateTimeShortWIB(detailEntry.endDate) : 'Permanen'}
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="text-[11.5px] font-semibold uppercase text-[#78716c] mb-1">Alasan</div>
                            <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4] text-[13px] text-[#1c1917] whitespace-pre-wrap">
                                {detailEntry.reason}
                            </div>
                        </div>

                        <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4] text-[13px] space-y-1">
                            <div className="font-semibold text-[#1c1917]">
                                {detailEntry.user.name} ({detailEntry.user.externalId})
                            </div>
                            <div className="text-[#57534e]">
                                {detailEntry.user.company || '-'} · {detailEntry.user.division || '-'} ·{' '}
                                {detailEntry.user.department || '-'}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
