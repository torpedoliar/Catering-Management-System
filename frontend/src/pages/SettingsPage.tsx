import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Check, AlertCircle, Ban, AlertTriangle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { formatDateTimeShortWIB } from '../utils/timezone';
import toast from 'react-hot-toast';
import { useAuth, api } from '../contexts/AuthContext';
import { useSSERefresh, SETTINGS_EVENTS, USER_EVENTS } from '../contexts/SSEContext';
import {
    Button,
    Card,
    PageHeader,
    Input,
    Select,
    Badge,
    RoleBadge,
    Modal,
    SkeletonCard,
} from '../components/ui';

interface SystemSettings {
    id: string;
    cutoffDays: number;
    cutoffHours: number;
    blacklistStrikes: number;
    blacklistDuration: number;
    autoBlacklistEnabled?: boolean;
    maxOrderDaysAhead: number;
    ntpEnabled: boolean;
    ntpServer: string;
    ntpTimezone: string;
    ntpSyncInterval: number;
    ntpLastSync: string | null;
    ntpOffset: number;
}

interface TimeInfo {
    serverTime: string;
    formattedTime: string;
    formattedDate: string;
    timestamp: number;
    timezone: string;
    ntpEnabled: boolean;
    ntpServer: string;
    lastSync: string | null;
    offset: number;
    isSynced: boolean;
}

interface NTPServer {
    name: string;
    address: string;
}

export default function SettingsPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'ADMIN';

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const [settings, setSettings] = useState<SystemSettings | null>(null);
    const [timeInfo, setTimeInfo] = useState<TimeInfo | null>(null);
    const [timezones, setTimezones] = useState<string[]>([]);
    const [ntpServers, setNtpServers] = useState<NTPServer[]>([]);
    const [loadingSettings, setLoadingSettings] = useState(true);
    const [savingSystem, setSavingSystem] = useState(false);
    const [savingNTP, setSavingNTP] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [currentTime, setCurrentTime] = useState<Date>(new Date());

    const [cutoffMode, setCutoffMode] = useState<'per-shift' | 'weekly'>('per-shift');
    const [cutoffDays, setCutoffDays] = useState(0);
    const [cutoffHours, setCutoffHours] = useState(6);
    const [maxOrderDaysAhead, setMaxOrderDaysAhead] = useState(7);

    const [weeklyCutoffDay, setWeeklyCutoffDay] = useState(5);
    const [weeklyCutoffHour, setWeeklyCutoffHour] = useState(17);
    const [weeklyCutoffMinute, setWeeklyCutoffMinute] = useState(0);
    const [orderableDays, setOrderableDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
    const [maxWeeksAhead, setMaxWeeksAhead] = useState(1);

    const [blacklistStrikes, setBlacklistStrikes] = useState(3);
    const [blacklistDuration, setBlacklistDuration] = useState(7);
    const [checkinPhotoEnabled, setCheckinPhotoEnabled] = useState(false);
    const [autoBlacklistEnabled, setAutoBlacklistEnabled] = useState(true);
    const [initialAutoBlacklistEnabled, setInitialAutoBlacklistEnabled] = useState(true);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [adminPasswordInput, setAdminPasswordInput] = useState('');

    const [searchParams, setSearchParams] = useSearchParams();
    const deepLinkId = searchParams.get('id');
    const isBlacklisted = user?.isBlacklisted === true;
    const blacklistEndDate = user?.blacklistEndDate;
    const [activeBlacklist, setActiveBlacklist] = useState<{
        id: string;
        reason: string;
        startDate: string;
        endDate: string | null;
    } | null>(null);

    const [canteens, setCanteens] = useState<Array<{ id: string; name: string }>>([]);
    const [preferredCanteenId, setPreferredCanteenId] = useState<string>('');

    const fetchActiveBlacklist = useCallback(async () => {
        if (!isBlacklisted) {
            setActiveBlacklist(null);
            return;
        }
        try {
            const res = await api.get('/api/blacklist?active=true&limit=1');
            const me =
                res.data?.blacklists?.find((b: { user?: { id?: string } }) => b.user?.id === user?.id) ??
                res.data?.blacklists?.[0];
            if (me) {
                setActiveBlacklist({
                    id: me.id,
                    reason: me.reason,
                    startDate: me.startDate,
                    endDate: me.endDate,
                });
            }
        } catch (error) {
            console.error('Failed to load active blacklist:', error);
        }
    }, [isBlacklisted, user?.id]);

    useEffect(() => {
        fetchActiveBlacklist();
    }, [fetchActiveBlacklist]);

    useEffect(() => {
        if (!deepLinkId || !isBlacklisted) return;
        const el = document.getElementById('blacklist-banner');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const next = new URLSearchParams(searchParams);
        next.delete('id');
        setSearchParams(next, { replace: true });
    }, [deepLinkId, isBlacklisted, searchParams, setSearchParams]);

    useSSERefresh(USER_EVENTS, fetchActiveBlacklist);

    const passwordChecks = {
        length: newPassword.length >= 6,
        hasNumber: /\d/.test(newPassword),
    };
    const isPasswordValid = passwordChecks.length && passwordChecks.hasNumber;
    const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

    const fetchAdminData = useCallback(async () => {
        try {
            const [canteensRes, meRes] = await Promise.all([
                api.get('/api/canteens?active=true'),
                api.get('/api/auth/me'),
            ]);
            setCanteens(canteensRes.data.canteens || []);
            setPreferredCanteenId(meRes.data.preferredCanteenId || '');
        } catch (error) {
            console.error('Error fetching preferences:', error);
        }

        if (!isAdmin) {
            setLoadingSettings(false);
            return;
        }

        try {
            const [settingsRes, ntpRes, timeRes, tzRes, serversRes] = await Promise.all([
                api.get('/api/settings'),
                api.get('/api/time/ntp'),
                api.get('/api/time/info'),
                api.get('/api/time/timezones'),
                api.get('/api/time/ntp-servers'),
            ]);

            let combinedSettings: SystemSettings | null = null;
            if (settingsRes.data) {
                const data = settingsRes.data;
                combinedSettings = data;
                setCutoffMode(data.cutoffMode || 'per-shift');
                setCutoffDays(data.cutoffDays || 0);
                setCutoffHours(data.cutoffHours || 6);
                setMaxOrderDaysAhead(data.maxOrderDaysAhead || 7);
                setWeeklyCutoffDay(data.weeklyCutoffDay ?? 5);
                setWeeklyCutoffHour(data.weeklyCutoffHour ?? 17);
                setWeeklyCutoffMinute(data.weeklyCutoffMinute ?? 0);
                setOrderableDays(
                    data.orderableDays
                        ? data.orderableDays.split(',').map((d: string) => parseInt(d, 10))
                        : [1, 2, 3, 4, 5, 6]
                );
                setMaxWeeksAhead(data.maxWeeksAhead || 1);
                setBlacklistStrikes(data.blacklistStrikes || 3);
                setBlacklistDuration(data.blacklistDuration || 7);
                setCheckinPhotoEnabled(data.checkinPhotoEnabled === true);
                setAutoBlacklistEnabled(data.autoBlacklistEnabled ?? true);
                setInitialAutoBlacklistEnabled(data.autoBlacklistEnabled ?? true);
            }

            if (ntpRes.data && combinedSettings) {
                combinedSettings = {
                    ...combinedSettings,
                    ntpEnabled: ntpRes.data.ntpEnabled,
                    ntpServer: ntpRes.data.ntpServer,
                    ntpTimezone: ntpRes.data.ntpTimezone,
                    ntpSyncInterval: ntpRes.data.ntpSyncInterval,
                    ntpLastSync: ntpRes.data.ntpLastSync,
                    ntpOffset: ntpRes.data.ntpOffset,
                };
            }

            setSettings(combinedSettings);
            if (timeRes.data) {
                setTimeInfo(timeRes.data);
                setCurrentTime(new Date(timeRes.data.serverTime));
            }
            if (tzRes.data) setTimezones(tzRes.data);
            if (serversRes.data) setNtpServers(serversRes.data);
        } catch (error) {
            console.error('Error fetching admin data:', error);
            toast.error('Gagal memuat pengaturan');
        } finally {
            setLoadingSettings(false);
        }
    }, [isAdmin]);

    useEffect(() => {
        fetchAdminData();
    }, [fetchAdminData]);

    useSSERefresh(SETTINGS_EVENTS, fetchAdminData);

    useEffect(() => {
        if (!isAdmin) return;
        const interval = setInterval(() => {
            setCurrentTime((prev) => new Date(prev.getTime() + 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [isAdmin]);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentPassword || !newPassword || !confirmPassword) {
            toast.error('Semua field harus diisi');
            return;
        }
        if (!isPasswordValid) {
            toast.error('Password baru tidak memenuhi kriteria');
            return;
        }
        if (!passwordsMatch) {
            toast.error('Password baru tidak cocok');
            return;
        }
        setIsLoading(true);
        try {
            await api.post('/api/auth/change-password', { currentPassword, newPassword });
            toast.success('Password berhasil diubah');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string } } };
            toast.error(err.response?.data?.error || 'Gagal mengubah password');
        } finally {
            setIsLoading(false);
        }
    };

    const saveSystemSettings = async (withAdminPassword = false) => {
        setSavingSystem(true);
        try {
            const payload: Record<string, unknown> = {
                cutoffMode,
                cutoffDays,
                cutoffHours,
                maxOrderDaysAhead,
                weeklyCutoffDay,
                weeklyCutoffHour,
                weeklyCutoffMinute,
                orderableDays: orderableDays.join(','),
                maxWeeksAhead,
                blacklistStrikes,
                blacklistDuration,
                autoBlacklistEnabled,
                checkinPhotoEnabled,
            };
            if (withAdminPassword) payload.adminPassword = adminPasswordInput;

            const response = await api.put('/api/settings', payload);
            setSettings(response.data);
            setCheckinPhotoEnabled(response.data.checkinPhotoEnabled === true);
            setAutoBlacklistEnabled(response.data.autoBlacklistEnabled ?? true);
            setInitialAutoBlacklistEnabled(response.data.autoBlacklistEnabled ?? true);
            setShowPasswordModal(false);
            setAdminPasswordInput('');
            toast.success(
                withAdminPassword
                    ? 'Auto-Blacklist diaktifkan & strike seluruh user di-reset ke 0'
                    : 'Pengaturan sistem berhasil disimpan'
            );
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string } } };
            toast.error(err.response?.data?.error || 'Gagal menyimpan pengaturan sistem');
        } finally {
            setSavingSystem(false);
        }
    };

    const handleSaveSystemSettings = async () => {
        if (autoBlacklistEnabled && !initialAutoBlacklistEnabled) {
            setShowPasswordModal(true);
            return;
        }
        await saveSystemSettings(false);
    };

    const updateNTPSettings = async (updates: Partial<SystemSettings>) => {
        setSavingNTP(true);
        try {
            await api.put('/api/time/ntp', updates);
            toast.success('Pengaturan NTP berhasil disimpan');
            fetchAdminData();
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string } } };
            toast.error(err.response?.data?.error || 'Gagal menyimpan pengaturan NTP');
        } finally {
            setSavingNTP(false);
        }
    };

    const syncNow = async () => {
        setSyncing(true);
        try {
            const response = await api.post('/api/time/ntp/sync');
            if (response.data.success) {
                toast.success(`Sinkronisasi berhasil! Offset: ${response.data.offset}ms`);
                fetchAdminData();
            } else {
                toast.error(response.data.error || 'Sinkronisasi gagal');
            }
        } catch {
            toast.error('Gagal melakukan sinkronisasi');
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="max-w-[960px] w-full space-y-[18px]">
            <PageHeader
                title="Pengaturan"
                subtitle={isAdmin ? 'Kelola akun dan konfigurasi sistem' : 'Kelola informasi akun dan keamanan Anda'}
            />

            {/* Blacklist Banner */}
            {isBlacklisted && (
                <div
                    id="blacklist-banner"
                    role="alert"
                    className="bg-[#fee2e2] border border-[#fecaca] rounded-[14px] p-5 text-[#991b1b]"
                >
                    <div className="flex items-start gap-3">
                        <Ban className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <div className="flex-1 min-w-0 space-y-3">
                            <div>
                                <h2 className="m-0 text-[15px] font-bold">Akun Anda sedang diblokir</h2>
                                <p className="m-0 mt-1 text-[13px]">
                                    Anda tidak dapat memesan makanan selama masa blokir kecuali untuk tanggal setelah masa blokir berakhir.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[13px]">
                                <div className="rounded-[10px] bg-[#fff] border border-[#fecaca] p-3">
                                    <div className="text-[11px] font-semibold text-[#78716c] uppercase">Mulai</div>
                                    <div className="font-bold text-[#1c1917] mt-0.5 tabular-nums">
                                        {activeBlacklist?.startDate ? formatDateTimeShortWIB(activeBlacklist.startDate) : '—'}
                                    </div>
                                </div>
                                <div className="rounded-[10px] bg-[#fff] border border-[#fecaca] p-3">
                                    <div className="text-[11px] font-semibold text-[#78716c] uppercase">Berakhir</div>
                                    <div className="font-bold text-[#1c1917] mt-0.5 tabular-nums">
                                        {blacklistEndDate ? formatDateTimeShortWIB(blacklistEndDate) : 'Permanen'}
                                    </div>
                                </div>
                                <div className="rounded-[10px] bg-[#fff] border border-[#fecaca] p-3">
                                    <div className="text-[11px] font-semibold text-[#78716c] uppercase">Strike</div>
                                    <div className="font-bold text-[#1c1917] mt-0.5 tabular-nums">
                                        {user?.noShowCount ?? 0}
                                    </div>
                                </div>
                            </div>
                            {activeBlacklist?.reason && (
                                <div className="rounded-[10px] bg-[#fff] border border-[#fecaca] p-3 text-[13px]">
                                    <div className="text-[11px] font-semibold text-[#78716c] uppercase">Alasan</div>
                                    <div className="text-[#1c1917] mt-0.5 whitespace-pre-wrap">{activeBlacklist.reason}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Account Info Card */}
            <Card>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="m-0 text-[16px] font-bold text-[#1c1917]">Informasi akun</h2>
                        <p className="m-0 mt-0.5 text-[12.5px] text-[#78716c]">Data identitas dan lokasi kerja Anda</p>
                    </div>
                    {user?.role && <RoleBadge role={user.role} />}
                </div>

                <dl className="m-0 grid grid-cols-1 md:grid-cols-2 gap-4 text-[13.5px]">
                    <div>
                        <dt className="text-[12px] font-semibold text-[#78716c]">ID Karyawan</dt>
                        <dd className="m-0 mt-0.5 font-mono font-semibold text-[#1c1917]">{user?.externalId}</dd>
                    </div>
                    <div>
                        <dt className="text-[12px] font-semibold text-[#78716c]">Nama</dt>
                        <dd className="m-0 mt-0.5 font-semibold text-[#1c1917]">{user?.name}</dd>
                    </div>
                    <div>
                        <dt className="text-[12px] font-semibold text-[#78716c]">Perusahaan</dt>
                        <dd className="m-0 mt-0.5 font-medium text-[#1c1917]">{user?.company || '-'}</dd>
                    </div>
                    <div>
                        <dt className="text-[12px] font-semibold text-[#78716c]">Divisi / Departemen</dt>
                        <dd className="m-0 mt-0.5 font-medium text-[#1c1917]">
                            {[user?.division, user?.department].filter(Boolean).join(' · ') || '-'}
                        </dd>
                    </div>
                </dl>

                <div className="mt-4 pt-4 border-t border-[#f0efed] flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <div className="text-[12px] font-semibold text-[#78716c]">Kantin lokasi bekerja</div>
                        <div className="text-[14px] font-bold text-[#1c1917] mt-0.5">
                            {canteens.find((c) => c.id === preferredCanteenId)?.name || 'Belum diatur'}
                        </div>
                    </div>
                    <span className="text-[12px] text-[#78716c]">Hubungi admin untuk mengubah lokasi kantin</span>
                </div>
            </Card>

            {/* Change Password Card */}
            <Card>
                <h2 className="m-0 text-[16px] font-bold text-[#1c1917]">Ubah password</h2>
                <p className="m-0 mt-0.5 mb-4 text-[12.5px] text-[#78716c]">
                    Gunakan minimal 6 karakter dan mengandung angka
                </p>

                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                    <div className="relative">
                        <Input
                            label="Password saat ini"
                            type={showCurrentPassword ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Masukkan password saat ini"
                            className="pr-10"
                        />
                        <button
                            type="button"
                            aria-label={showCurrentPassword ? 'Sembunyikan password saat ini' : 'Tampilkan password saat ini'}
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute right-2.5 top-[29px] w-7 h-7 flex items-center justify-center rounded-[6px] text-[#78716c] hover:bg-[#f5f5f4] border-0 bg-transparent cursor-pointer"
                        >
                            {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    <div className="relative">
                        <Input
                            label="Password baru"
                            type={showNewPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Masukkan password baru"
                            className="pr-10"
                        />
                        <button
                            type="button"
                            aria-label={showNewPassword ? 'Sembunyikan password baru' : 'Tampilkan password baru'}
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-2.5 top-[29px] w-7 h-7 flex items-center justify-center rounded-[6px] text-[#78716c] hover:bg-[#f5f5f4] border-0 bg-transparent cursor-pointer"
                        >
                            {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        {newPassword && (
                            <div className="mt-2 space-y-1 text-[12px]">
                                <div className={`flex items-center gap-1.5 ${passwordChecks.length ? 'text-[#15803d]' : 'text-[#78716c]'}`}>
                                    {passwordChecks.length ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                    Minimal 6 karakter
                                </div>
                                <div className={`flex items-center gap-1.5 ${passwordChecks.hasNumber ? 'text-[#15803d]' : 'text-[#78716c]'}`}>
                                    {passwordChecks.hasNumber ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                    Mengandung angka
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <Input
                            label="Konfirmasi password baru"
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Ulangi password baru"
                            error={confirmPassword && !passwordsMatch ? 'Password tidak cocok' : undefined}
                            className="pr-10"
                        />
                        <button
                            type="button"
                            aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'}
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-2.5 top-[29px] w-7 h-7 flex items-center justify-center rounded-[6px] text-[#78716c] hover:bg-[#f5f5f4] border-0 bg-transparent cursor-pointer"
                        >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    <Button
                        type="submit"
                        variant="primary"
                        loading={isLoading}
                        loadingText="Menyimpan…"
                        disabled={!isPasswordValid || !passwordsMatch || !currentPassword}
                    >
                        Ubah password
                    </Button>
                </form>
            </Card>

            {/* Admin-only quick settings */}
            {isAdmin && (
                loadingSettings ? (
                    <SkeletonCard lines={4} />
                ) : (
                    <>
                        <Card className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <h2 className="m-0 text-[16px] font-bold text-[#1c1917]">Waktu server &amp; NTP</h2>
                                    <p className="m-0 mt-0.5 text-[12.5px] text-[#78716c]">
                                        Zona waktu: {timeInfo?.timezone || 'Asia/Jakarta'}
                                    </p>
                                </div>
                                <Badge variant={timeInfo?.isSynced ? 'success' : 'warning'}>
                                    {timeInfo?.isSynced ? 'Tersinkronisasi' : 'Belum sync'}
                                </Badge>
                            </div>

                            <div className="rounded-[12px] bg-[#fafaf9] border border-[#f0efed] p-4 flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <div className="text-[26px] font-extrabold font-mono tabular-nums text-[#1c1917]">
                                        {timeInfo?.formattedTime || format(currentTime, 'HH:mm:ss')}
                                    </div>
                                    <div className="text-[12.5px] text-[#78716c]">
                                        {timeInfo?.formattedDate || format(currentTime, 'yyyy-MM-dd')}
                                    </div>
                                </div>
                                {timeInfo?.lastSync && (
                                    <div className="text-[12px] text-[#78716c]">
                                        Terakhir sync: {formatDateTimeShortWIB(timeInfo.lastSync)}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-between p-3.5 rounded-[10px] border border-[#e7e5e4]">
                                <div>
                                    <div className="text-[13.5px] font-semibold text-[#1c1917]">Aktifkan NTP</div>
                                    <div className="text-[12px] text-[#78716c]">Sinkronisasi waktu otomatis</div>
                                </div>
                                <input
                                    type="checkbox"
                                    aria-label="Aktifkan NTP"
                                    checked={!!settings?.ntpEnabled}
                                    disabled={savingNTP}
                                    onChange={() => updateNTPSettings({ ntpEnabled: !settings?.ntpEnabled })}
                                    className="w-4 h-4 accent-[#f59e0b] cursor-pointer"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <Select
                                    label="Server NTP"
                                    value={settings?.ntpServer || 'pool.ntp.org'}
                                    disabled={savingNTP || !settings?.ntpEnabled}
                                    onChange={(e) => updateNTPSettings({ ntpServer: e.target.value })}
                                >
                                    {(ntpServers.length > 0
                                        ? ntpServers
                                        : [
                                              { name: 'Pool NTP (Global)', address: 'pool.ntp.org' },
                                              { name: 'Google NTP', address: 'time.google.com' },
                                              { name: 'Cloudflare NTP', address: 'time.cloudflare.com' },
                                          ]
                                    ).map((s) => (
                                        <option key={s.address} value={s.address}>
                                            {s.name} ({s.address})
                                        </option>
                                    ))}
                                </Select>
                                <Select
                                    label="Zona waktu"
                                    value={settings?.ntpTimezone || 'Asia/Jakarta'}
                                    disabled={savingNTP}
                                    onChange={(e) => updateNTPSettings({ ntpTimezone: e.target.value })}
                                >
                                    {(timezones.length > 0
                                        ? timezones
                                        : ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Singapore', 'UTC']
                                    ).map((tz) => (
                                        <option key={tz} value={tz}>
                                            {tz}
                                        </option>
                                    ))}
                                </Select>
                                <Select
                                    label="Interval sinkronisasi"
                                    value={settings?.ntpSyncInterval || 3600}
                                    disabled={savingNTP || !settings?.ntpEnabled}
                                    onChange={(e) =>
                                        updateNTPSettings({ ntpSyncInterval: parseInt(e.target.value, 10) })
                                    }
                                >
                                    <option value={60}>Setiap 1 menit</option>
                                    <option value={300}>Setiap 5 menit</option>
                                    <option value={900}>Setiap 15 menit</option>
                                    <option value={1800}>Setiap 30 menit</option>
                                    <option value={3600}>Setiap 1 jam</option>
                                    <option value={7200}>Setiap 2 jam</option>
                                    <option value={86400}>Setiap 24 jam</option>
                                </Select>
                            </div>

                            <Button
                                variant="secondary"
                                loading={syncing}
                                loadingText="Menyinkronkan…"
                                disabled={!settings?.ntpEnabled}
                                onClick={syncNow}
                                leftIcon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}
                            >
                                Sinkronisasi sekarang
                            </Button>
                        </Card>

                        <Card className="space-y-4">
                            <div>
                                <h2 className="m-0 text-[16px] font-bold text-[#1c1917]">Pengaturan sistem</h2>
                                <p className="m-0 mt-0.5 text-[12.5px] text-[#78716c]">
                                    Konfigurasi batas pemesanan dan aturan blacklist
                                </p>
                            </div>

                            <div className="flex items-center justify-between p-3.5 rounded-[10px] border border-[#e7e5e4]">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[13.5px] font-semibold text-[#1c1917]">
                                            Auto-blacklist (strike)
                                        </span>
                                        <Badge variant={autoBlacklistEnabled ? 'success' : 'danger'}>
                                            {autoBlacklistEnabled ? 'Aktif' : 'Nonaktif'}
                                        </Badge>
                                    </div>
                                    <div className="text-[12px] text-[#78716c] mt-0.5">
                                        {autoBlacklistEnabled
                                            ? 'Strike & blokir otomatis aktif untuk pesanan tidak diambil'
                                            : 'Penilaian strike dimatikan sementara'}
                                    </div>
                                </div>
                                <input
                                    type="checkbox"
                                    aria-label="Aktifkan auto-blacklist"
                                    checked={autoBlacklistEnabled}
                                    onChange={(e) => setAutoBlacklistEnabled(e.target.checked)}
                                    className="w-4 h-4 accent-[#f59e0b] cursor-pointer"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <Input
                                    label="Batas strike blacklist"
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={blacklistStrikes}
                                    onChange={(e) => setBlacklistStrikes(parseInt(e.target.value, 10) || 1)}
                                />
                                <Input
                                    label="Maks. hari pemesanan di muka"
                                    type="number"
                                    min={1}
                                    max={30}
                                    value={maxOrderDaysAhead}
                                    onChange={(e) => setMaxOrderDaysAhead(parseInt(e.target.value, 10) || 7)}
                                />
                                <Input
                                    label="Durasi blacklist (hari)"
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={blacklistDuration}
                                    onChange={(e) => setBlacklistDuration(parseInt(e.target.value, 10) || 1)}
                                />
                            </div>

                            <label className="flex items-center gap-2 text-[13.5px] text-[#1c1917] cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={checkinPhotoEnabled}
                                    onChange={(e) => setCheckinPhotoEnabled(e.target.checked)}
                                    className="w-4 h-4 accent-[#f59e0b]"
                                />
                                <span>Tawarkan foto bukti saat check-in</span>
                            </label>

                            <Button
                                variant="primary"
                                loading={savingSystem}
                                loadingText="Menyimpan…"
                                onClick={handleSaveSystemSettings}
                            >
                                Simpan pengaturan sistem
                            </Button>
                        </Card>

                        <Modal
                            open={showPasswordModal}
                            onClose={() => {
                                setShowPasswordModal(false);
                                setAdminPasswordInput('');
                            }}
                            title="Aktifkan auto-blacklist"
                            size="sm"
                            footer={
                                <>
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            setShowPasswordModal(false);
                                            setAdminPasswordInput('');
                                        }}
                                    >
                                        Batal
                                    </Button>
                                    <Button
                                        variant="primary"
                                        loading={savingSystem}
                                        disabled={!adminPasswordInput}
                                        onClick={() => saveSystemSettings(true)}
                                    >
                                        Aktifkan &amp; reset strike
                                    </Button>
                                </>
                            }
                        >
                            <div className="space-y-3">
                                <div className="flex items-start gap-2.5 p-3 rounded-[10px] bg-[#fef3c7] text-[#92400e] text-[13px]">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                                    <span>
                                        Mengaktifkan Auto-Blacklist akan mereset strike seluruh pengguna menjadi 0.
                                    </span>
                                </div>
                                <Input
                                    label="Password admin"
                                    type="password"
                                    value={adminPasswordInput}
                                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                                    placeholder="Masukkan password admin"
                                    autoFocus
                                />
                            </div>
                        </Modal>
                    </>
                )
            )}
        </div>
    );
}
