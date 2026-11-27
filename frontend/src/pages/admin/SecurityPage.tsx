import { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw, LogOut, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDateTimeShortWIB } from '../../utils/timezone';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, SETTINGS_EVENTS } from '../../contexts/SSEContext';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    SegmentedControl,
    Modal,
    EmptyState,
    Skeleton,
} from '../../components/ui';

interface AuditEntry {
    id: string;
    createdAt: string;
    userName?: string | null;
    ipAddress?: string | null;
    success: boolean;
    description?: string | null;
    metadata?: Record<string, unknown>;
}

type Tab = 'family' | 'refresh';

export default function SecurityPage() {
    const [rotationEnabled, setRotationEnabled] = useState(false);
    const [savingRotation, setSavingRotation] = useState(false);
    const [revoking, setRevoking] = useState(false);
    const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
    const [familyEvents, setFamilyEvents] = useState<AuditEntry[]>([]);
    const [refreshEvents, setRefreshEvents] = useState<AuditEntry[]>([]);
    const [activeTab, setActiveTab] = useState<Tab>('family');
    const [loading, setLoading] = useState(true);

    const fetchSecurityData = useCallback(async () => {
        try {
            const [settingsRes, familyRes, refreshRes] = await Promise.all([
                api.get('/api/settings'),
                api.get('/api/audit?action=TOKEN_FAMILY_REVOKED&limit=10'),
                api.get('/api/audit?action=TOKEN_REFRESHED&limit=10'),
            ]);
            setRotationEnabled(settingsRes.data?.enableTokenRotation === true);
            setFamilyEvents(familyRes.data?.logs || familyRes.data?.data || []);
            setRefreshEvents(refreshRes.data?.logs || refreshRes.data?.data || []);
        } catch {
            toast.error('Gagal memuat pengaturan keamanan');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSecurityData();
    }, [fetchSecurityData]);

    useSSERefresh(SETTINGS_EVENTS, fetchSecurityData);

    const handleToggleRotation = async () => {
        const next = !rotationEnabled;
        const prev = rotationEnabled;
        setRotationEnabled(next);
        setSavingRotation(true);
        try {
            await api.put('/api/settings', { enableTokenRotation: next });
            toast.success(next ? 'Rotasi refresh token diaktifkan' : 'Rotasi refresh token dinonaktifkan');
        } catch (error) {
            setRotationEnabled(prev);
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal mengubah pengaturan rotasi');
        } finally {
            setSavingRotation(false);
        }
    };

    const handleRevokeAll = async () => {
        setRevoking(true);
        try {
            await api.post('/api/auth/logout');
            toast.success('Semua sesi dicabut');
            setShowRevokeConfirm(false);
            window.dispatchEvent(new Event('force-logout'));
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal mencabut sesi');
        } finally {
            setRevoking(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-56" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-44 w-full" />
            </div>
        );
    }

    const visibleEvents = activeTab === 'family' ? familyEvents : refreshEvents;

    return (
        <div className="space-y-4">
            <PageHeader
                title="Keamanan & sesi"
                subtitle="Kelola rotasi refresh token, pencabutan sesi login, dan audit aktivitas token"
            />

            <div
                className={`p-4 rounded-[14px] border flex items-start gap-3 ${
                    rotationEnabled
                        ? 'bg-[#f0fdf4] border-[#bbf7d0]'
                        : 'bg-[#fffbeb] border-[#fde68a]'
                }`}
            >
                {rotationEnabled ? (
                    <RefreshCw className="w-5 h-5 text-[#15803d] flex-shrink-0 mt-0.5" aria-hidden="true" />
                ) : (
                    <AlertTriangle className="w-5 h-5 text-[#b45309] flex-shrink-0 mt-0.5" aria-hidden="true" />
                )}
                <div className="text-[13px]">
                    <div className={`font-bold ${rotationEnabled ? 'text-[#15803d]' : 'text-[#92400e]'}`}>
                        {rotationEnabled ? 'Rotasi token aktif' : 'Rotasi token nonaktif'}
                    </div>
                    <p className="text-[#57534e] mt-0.5">
                        {rotationEnabled
                            ? 'Setiap pembaruan access token mengeluarkan refresh token baru dan mencabut token lama.'
                            : 'Refresh token berlaku sampai masa habis tanpa rotasi.'}{' '}
                        Variabel lingkungan <code className="font-mono text-[#1c1917]">ENABLE_TOKEN_ROTATION</code> pada server dapat menimpa nilai DB.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-[15px] font-bold text-[#1c1917]">Rotasi Refresh Token</h2>
                            <p className="text-[12.5px] text-[#78716c] mt-1">
                                Saat aktif, token lama ditandai ROTATED pada setiap pembaruan sehingga pencurian token terdeteksi.
                            </p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={rotationEnabled}
                            disabled={savingRotation}
                            onClick={handleToggleRotation}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border-0 cursor-pointer transition-colors disabled:opacity-50 ${
                                rotationEnabled ? 'bg-[#16a34a]' : 'bg-[#d6d3d1]'
                            }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 rounded-full bg-[#fff] transition-transform ${
                                    rotationEnabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>
                </Card>

                <Card>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <h2 className="text-[15px] font-bold text-[#1c1917]">Cabut sesi login aktif</h2>
                            <p className="text-[12.5px] text-[#78716c] mt-1">
                                Akhiri semua sesi web & aplikasi mobile Anda sekarang juga.
                            </p>
                        </div>
                        <Button
                            variant="danger"
                            size="sm"
                            loading={revoking}
                            onClick={() => setShowRevokeConfirm(true)}
                            leftIcon={<LogOut className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Cabut semua sesi
                        </Button>
                    </div>
                </Card>
            </div>

            <Card padding="none">
                <div className="px-4 py-3.5 border-b border-[#f5f5f4] flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-[15px] font-bold text-[#1c1917]">Aktivitas token terbaru</h2>
                        <p className="text-[12px] text-[#78716c]">10 kejadian autentikasi terakhir</p>
                    </div>
                    <SegmentedControl
                        ariaLabel="Jenis log token"
                        layoutId="security-tab"
                        value={activeTab}
                        onChange={(v) => setActiveTab(v as Tab)}
                        options={[
                            { value: 'family', label: `Family Revoked (${familyEvents.length})` },
                            { value: 'refresh', label: `Token Refreshed (${refreshEvents.length})` },
                        ]}
                    />
                </div>

                {visibleEvents.length === 0 ? (
                    <EmptyState
                        icon={<Shield className="w-6 h-6" />}
                        title="Belum ada aktivitas token"
                        description="Kejadian rotasi atau pencabutan token akan muncul di sini."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="bg-[#fafaf9] border-b border-[#f5f5f4]">
                                    <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Waktu
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Pengguna
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        IP
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Status
                                    </th>
                                    <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Detail
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#f5f5f4]">
                                {visibleEvents.map((ev) => (
                                    <tr key={ev.id} className="hover:bg-[#fafaf9]">
                                        <td className="px-4 py-2.5 font-mono text-[12px] text-[#57534e] whitespace-nowrap">
                                            {formatDateTimeShortWIB(ev.createdAt)}
                                        </td>
                                        <td className="px-3 py-2.5 font-semibold text-[#1c1917]">
                                            {ev.userName || '-'}
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-[12px] text-[#57534e]">
                                            {ev.ipAddress || '-'}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <Badge variant={ev.success ? 'success' : 'warning'}>
                                                {ev.success ? 'Sukses' : 'Ditolak'}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-2.5 text-[#57534e] max-w-xs truncate">
                                            {ev.description || (ev.metadata?.source as string) || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <Modal
                open={showRevokeConfirm}
                onClose={() => setShowRevokeConfirm(false)}
                title="Cabut semua sesi aktif?"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowRevokeConfirm(false)}>
                            Batal
                        </Button>
                        <Button variant="danger" loading={revoking} onClick={handleRevokeAll}>
                            Cabut semua sesi
                        </Button>
                    </>
                }
            >
                <p className="text-[13.5px] text-[#57534e]">
                    Anda akan keluar dari semua perangkat yang sedang login dan harus masuk ulang.
                </p>
            </Modal>
        </div>
    );
}
