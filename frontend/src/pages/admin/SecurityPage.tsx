import { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw, LogOut, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDateTimeShortWIB } from '../../utils/timezone';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, SETTINGS_EVENTS } from '../../contexts/SSEContext';

interface AuditEntry {
    id: string;
    createdAt: string;
    userName?: string | null;
    ipAddress?: string | null;
    success: boolean;
    description?: string | null;
    metadata?: any;
}

type Tab = 'family' | 'refresh';

export default function SecurityPage() {
    const [rotationEnabled, setRotationEnabled] = useState<boolean>(false);
    const [savingRotation, setSavingRotation] = useState<boolean>(false);
    const [revoking, setRevoking] = useState<boolean>(false);
    const [familyEvents, setFamilyEvents] = useState<AuditEntry[]>([]);
    const [refreshEvents, setRefreshEvents] = useState<AuditEntry[]>([]);
    const [activeTab, setActiveTab] = useState<Tab>('family');
    const [loading, setLoading] = useState<boolean>(true);

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
        } catch (error) {
            console.error('Error fetching security data:', error);
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
        const previous = rotationEnabled;
        setRotationEnabled(next);
        setSavingRotation(true);
        try {
            await api.put('/api/settings', { enableTokenRotation: next });
            toast.success(
                next
                    ? 'Rotasi token diaktifkan. Refresh token akan dirotasi pada setiap pembaruan.'
                    : 'Rotasi token dinonaktifkan. Refresh token tidak akan dirotasi lagi.'
            );
        } catch (error: any) {
            setRotationEnabled(previous);
            toast.error(error.response?.data?.error || 'Gagal mengubah pengaturan rotasi');
        } finally {
            setSavingRotation(false);
        }
    };

    const handleRevokeAll = async () => {
        if (!window.confirm('Cabut semua sesi login Anda? Anda akan logout dari semua device.')) return;
        setRevoking(true);
        try {
            await api.post('/api/auth/logout');
            toast.success('Semua sesi telah dicabut');
            window.dispatchEvent(new Event('force-logout'));
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal mencabut sesi');
        } finally {
            setRevoking(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
            </div>
        );
    }

    const visibleEvents = activeTab === 'family' ? familyEvents : refreshEvents;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-apple-lg bg-dark-bg-tertiary flex items-center justify-center">
                    <Shield className="w-7 h-7 text-apple-blue" />
                </div>
                <div>
                    <h1 className="text-title-1 text-white">Keamanan</h1>
                    <p className="text-body text-dark-text-secondary">
                        Kelola rotasi refresh token, sesi login, dan audit aktivitas autentikasi
                    </p>
                </div>
            </div>

            {/* Status banner */}
            <div
                className={`rounded-2xl p-5 border ${
                    rotationEnabled
                        ? 'bg-green-900/20 border-green-500/40'
                        : 'bg-slate-800/30 border-slate-700'
                }`}
            >
                <div className="flex items-center gap-3">
                    {rotationEnabled ? (
                        <RefreshCw className="w-6 h-6 text-green-400" />
                    ) : (
                        <AlertTriangle className="w-6 h-6 text-yellow-400" />
                    )}
                    <div>
                        <p
                            className={`text-callout font-semibold ${
                                rotationEnabled ? 'text-green-400' : 'text-slate-300'
                            }`}
                        >
                            {rotationEnabled ? 'Rotasi Token Aktif' : 'Rotasi Token Nonaktif'}
                        </p>
                        <p className="text-caption text-dark-text-secondary mt-1">
                            {rotationEnabled
                                ? 'Setiap pembaruan access token akan mengeluarkan refresh token baru dan mencabut yang lama.'
                                : 'Refresh token berlaku sampai masa habis tanpa rotasi.'}{' '}
                            Variabel <code className="text-apple-blue">ENABLE_TOKEN_ROTATION</code>{' '}
                            di server mengesampingkan pengaturan DB.
                        </p>
                    </div>
                </div>
            </div>

            {/* Rotation toggle card */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700">
                    <h2 className="text-lg font-semibold text-slate-100">Rotasi Refresh Token (F-3)</h2>
                    <p className="text-sm text-slate-400">
                        Saat aktif, server mengeluarkan refresh token baru di setiap pembaruan. Refresh
                        token lama ditandai ROTATED dan tidak bisa dipakai lagi.
                    </p>
                </div>

                <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between p-4 bg-dark-bg-tertiary rounded-apple">
                        <div>
                            <label className="text-body font-medium text-white">Aktifkan Rotasi</label>
                            <p className="text-callout text-dark-text-secondary">
                                Refresh token akan dirotasi otomatis untuk keamanan tambahan
                            </p>
                        </div>
                        <button
                            onClick={handleToggleRotation}
                            disabled={savingRotation}
                            className={`toggle ${rotationEnabled ? 'toggle-enabled' : 'toggle-disabled'} ${
                                savingRotation ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                        >
                            <span
                                className={`toggle-knob ${
                                    rotationEnabled ? 'translate-x-5' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>

                    <div className="text-callout text-dark-text-secondary space-y-1">
                        <p>
                            <span className="text-slate-400">Rekomendasi rollout:</span> aktifkan di
                            staging 1 minggu, pantau log TOKEN_FAMILY_REVOKED, lalu aktifkan di
                            produksi.
                        </p>
                    </div>
                </div>
            </div>

            {/* Revoke all sessions card */}
            <div className="bg-slate-800/50 rounded-xl border border-red-500/30 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700">
                    <h2 className="text-lg font-semibold text-slate-100">Sesi Login</h2>
                    <p className="text-sm text-slate-400">
                        Cabut semua refresh token Anda yang masih aktif. Anda akan logout dari semua
                        device (web + mobile) dan harus login ulang.
                    </p>
                </div>

                <div className="p-6">
                    <button
                        onClick={handleRevokeAll}
                        disabled={revoking}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <LogOut className={`w-4 h-4 ${revoking ? 'animate-spin' : ''}`} />
                        {revoking ? 'Mencabut...' : 'Cabut Semua Sesi Saya'}
                    </button>
                </div>
            </div>

            {/* Recent token events */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-100">Aktivitas Token Terbaru</h2>
                        <p className="text-sm text-slate-400">10 event terakhir</p>
                    </div>
                    <div className="flex bg-dark-bg-tertiary rounded-lg p-1">
                        <button
                            onClick={() => setActiveTab('family')}
                            className={`px-3 py-1.5 text-callout rounded-md transition-colors ${
                                activeTab === 'family'
                                    ? 'bg-apple-blue text-white'
                                    : 'text-dark-text-secondary hover:text-slate-200'
                            }`}
                        >
                            Family Revoked ({familyEvents.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('refresh')}
                            className={`px-3 py-1.5 text-callout rounded-md transition-colors ${
                                activeTab === 'refresh'
                                    ? 'bg-apple-blue text-white'
                                    : 'text-dark-text-secondary hover:text-slate-200'
                            }`}
                        >
                            Token Refreshed ({refreshEvents.length})
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {visibleEvents.length === 0 ? (
                        <div className="px-6 py-12 text-center text-dark-text-secondary">
                            <Shield className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                            <p>Belum ada aktivitas</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-dark-bg-tertiary text-callout text-dark-text-secondary">
                                <tr>
                                    <th className="px-4 py-3 text-left">Waktu</th>
                                    <th className="px-4 py-3 text-left">User</th>
                                    <th className="px-4 py-3 text-left">IP</th>
                                    <th className="px-4 py-3 text-left">Status</th>
                                    <th className="px-4 py-3 text-left">Detail</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleEvents.map(ev => (
                                    <tr
                                        key={ev.id}
                                        className="border-t border-slate-700/50 hover:bg-slate-800/30"
                                    >
                                        <td className="px-4 py-3 text-callout text-slate-300 font-mono">
                                            {formatDateTimeShortWIB(ev.createdAt)}
                                        </td>
                                        <td className="px-4 py-3 text-callout text-slate-200">
                                            {ev.userName || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-callout text-slate-400 font-mono">
                                            {ev.ipAddress || '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`badge ${
                                                    ev.success ? 'badge-success' : 'badge-warning'
                                                }`}
                                            >
                                                {ev.success ? 'Sukses' : 'Ditolak'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-callout text-slate-400 max-w-xs truncate">
                                            {ev.description || (ev.metadata?.source as string) || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
