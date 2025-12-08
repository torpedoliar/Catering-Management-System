import { useState, useEffect, useCallback } from 'react';
import { Settings, Lock, Eye, EyeOff, Check, AlertCircle, Clock, Shield, Server, RefreshCw, User, Building } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useSSERefresh, SETTINGS_EVENTS } from '../contexts/SSEContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3012';

interface SystemSettings {
    id: string;
    cutoffHours: number;
    blacklistStrikes: number;
    blacklistDuration: number;
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

    const [cutoffHours, setCutoffHours] = useState(6);
    const [blacklistStrikes, setBlacklistStrikes] = useState(3);
    const [blacklistDuration, setBlacklistDuration] = useState(7);

    const getToken = () => localStorage.getItem('token');

    const validatePassword = (password: string) => {
        const checks = {
            length: password.length >= 6,
            hasNumber: /\d/.test(password),
        };
        return checks;
    };

    const passwordChecks = validatePassword(newPassword);
    const isPasswordValid = passwordChecks.length && passwordChecks.hasNumber;
    const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

    const fetchAdminData = useCallback(async () => {
        if (!isAdmin) {
            setLoadingSettings(false);
            return;
        }

        try {
            const token = getToken();
            const headers = { Authorization: `Bearer ${token}` };

            const [settingsRes, ntpRes, timeRes, tzRes, serversRes] = await Promise.all([
                fetch(`${API_URL}/api/settings`, { headers }),
                fetch(`${API_URL}/api/time/ntp`, { headers }),
                fetch(`${API_URL}/api/time/info`, { headers }),
                fetch(`${API_URL}/api/time/timezones`, { headers }),
                fetch(`${API_URL}/api/time/ntp-servers`, { headers }),
            ]);

            let combinedSettings: SystemSettings | null = null;

            if (settingsRes.ok) {
                const data = await settingsRes.json();
                combinedSettings = data;
                setCutoffHours(data.cutoffHours || 6);
                setBlacklistStrikes(data.blacklistStrikes || 3);
                setBlacklistDuration(data.blacklistDuration || 7);
            }

            if (ntpRes.ok) {
                const ntpData = await ntpRes.json();
                if (combinedSettings) {
                    combinedSettings = {
                        ...combinedSettings,
                        ntpEnabled: ntpData.ntpEnabled,
                        ntpServer: ntpData.ntpServer,
                        ntpTimezone: ntpData.ntpTimezone,
                        ntpSyncInterval: ntpData.ntpSyncInterval,
                        ntpLastSync: ntpData.ntpLastSync,
                        ntpOffset: ntpData.ntpOffset,
                    };
                }
            }

            setSettings(combinedSettings);

            if (timeRes.ok) {
                const info = await timeRes.json();
                setTimeInfo(info);
                setCurrentTime(new Date(info.serverTime));
            }
            if (tzRes.ok) {
                const tzData = await tzRes.json();
                setTimezones(tzData);
            }
            if (serversRes.ok) {
                const serverData = await serversRes.json();
                setNtpServers(serverData);
            }
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
            const token = getToken();
            const response = await fetch(`${API_URL}/api/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ currentPassword, newPassword }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Gagal mengubah password');
            }

            toast.success('Password berhasil diubah');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Gagal mengubah password');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveSystemSettings = async () => {
        setSavingSystem(true);
        try {
            const token = getToken();
            const response = await fetch(`${API_URL}/api/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    cutoffHours,
                    blacklistStrikes,
                    blacklistDuration,
                }),
            });

            if (response.ok) {
                const updated = await response.json();
                setSettings(updated);
                toast.success('Pengaturan sistem berhasil disimpan');
            } else {
                const error = await response.json();
                toast.error(error.error || 'Gagal menyimpan pengaturan');
            }
        } catch (error) {
            toast.error('Gagal menyimpan pengaturan sistem');
        } finally {
            setSavingSystem(false);
        }
    };

    const updateNTPSettings = async (updates: Partial<SystemSettings>) => {
        setSavingNTP(true);
        try {
            const token = getToken();
            const response = await fetch(`${API_URL}/api/time/ntp`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(updates),
            });

            if (response.ok) {
                toast.success('Pengaturan NTP berhasil disimpan');
                fetchAdminData();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Gagal menyimpan pengaturan NTP');
            }
        } catch (error) {
            toast.error('Gagal menyimpan pengaturan NTP');
        } finally {
            setSavingNTP(false);
        }
    };

    const syncNow = async () => {
        setSyncing(true);
        try {
            const token = getToken();
            const response = await fetch(`${API_URL}/api/time/ntp/sync`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });

            const result = await response.json();
            if (result.success) {
                toast.success(`Sinkronisasi berhasil! Offset: ${result.offset}ms`);
                fetchAdminData();
            } else {
                toast.error(result.error || 'Sinkronisasi gagal');
            }
        } catch (error) {
            toast.error('Gagal melakukan sinkronisasi');
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-apple-lg bg-dark-bg-tertiary flex items-center justify-center">
                    <Settings className="w-7 h-7 text-dark-text-secondary" />
                </div>
                <div>
                    <h1 className="text-title-1 text-white">Pengaturan</h1>
                    <p className="text-body text-dark-text-secondary">
                        {isAdmin ? 'Kelola sistem dan akun Anda' : 'Kelola akun Anda'}
                    </p>
                </div>
            </div>

            {/* User Info Card */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="stat-icon bg-apple-blue/15">
                        <User className="w-6 h-6 text-apple-blue" />
                    </div>
                    <div>
                        <h2 className="text-title-3 text-white">Informasi Akun</h2>
                        <p className="text-callout text-dark-text-secondary">Detail akun Anda</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                        <label className="text-caption text-dark-text-secondary uppercase tracking-wide">ID Karyawan</label>
                        <p className="text-body text-white font-medium">{user?.externalId}</p>
                    </div>
                    <div className="space-y-1">
                        <label className="text-caption text-dark-text-secondary uppercase tracking-wide">Nama</label>
                        <p className="text-body text-white font-medium">{user?.name}</p>
                    </div>
                    <div className="space-y-1">
                        <label className="text-caption text-dark-text-secondary uppercase tracking-wide">Perusahaan</label>
                        <p className="text-body text-white font-medium">{user?.company || '-'}</p>
                    </div>
                    <div className="space-y-1">
                        <label className="text-caption text-dark-text-secondary uppercase tracking-wide">Divisi</label>
                        <p className="text-body text-white font-medium">{user?.division || '-'}</p>
                    </div>
                    <div className="space-y-1">
                        <label className="text-caption text-dark-text-secondary uppercase tracking-wide">Departemen</label>
                        <p className="text-body text-white font-medium">{user?.department || '-'}</p>
                    </div>
                    <div className="space-y-1">
                        <label className="text-caption text-dark-text-secondary uppercase tracking-wide">Role</label>
                        <span className={`badge ${
                            user?.role === 'ADMIN' ? 'badge-info' :
                            user?.role === 'CANTEEN' ? 'badge-warning' : 'badge-neutral'
                        }`}>
                            {user?.role}
                        </span>
                    </div>
                </div>
            </div>

            {/* Change Password Card */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="stat-icon bg-apple-orange/15">
                        <Lock className="w-6 h-6 text-apple-orange" />
                    </div>
                    <div>
                        <h2 className="text-title-3 text-white">Ubah Password</h2>
                        <p className="text-callout text-dark-text-secondary">Pastikan password baru Anda aman</p>
                    </div>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-5">
                    <div>
                        <label className="block text-callout font-medium text-dark-text-secondary mb-2">
                            Password Saat Ini
                        </label>
                        <div className="relative">
                            <input
                                type={showCurrentPassword ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="input-field pr-12"
                                placeholder="Masukkan password saat ini"
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 btn-icon"
                            >
                                {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-callout font-medium text-dark-text-secondary mb-2">
                            Password Baru
                        </label>
                        <div className="relative">
                            <input
                                type={showNewPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="input-field pr-12"
                                placeholder="Masukkan password baru"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 btn-icon"
                            >
                                {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>

                        {newPassword && (
                            <div className="mt-3 space-y-2">
                                <div className={`flex items-center gap-2 text-callout ${passwordChecks.length ? 'text-apple-green' : 'text-dark-text-secondary'}`}>
                                    {passwordChecks.length ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                    Minimal 6 karakter
                                </div>
                                <div className={`flex items-center gap-2 text-callout ${passwordChecks.hasNumber ? 'text-apple-green' : 'text-dark-text-secondary'}`}>
                                    {passwordChecks.hasNumber ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                    Mengandung angka
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-callout font-medium text-dark-text-secondary mb-2">
                            Konfirmasi Password Baru
                        </label>
                        <div className="relative">
                            <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="input-field pr-12"
                                placeholder="Konfirmasi password baru"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 btn-icon"
                            >
                                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>

                        {confirmPassword && (
                            <div className={`flex items-center gap-2 text-callout mt-2 ${passwordsMatch ? 'text-apple-green' : 'text-apple-red'}`}>
                                {passwordsMatch ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                {passwordsMatch ? 'Password cocok' : 'Password tidak cocok'}
                            </div>
                        )}
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={isLoading || !isPasswordValid || !passwordsMatch || !currentPassword}
                            className="btn-primary"
                        >
                            {isLoading ? 'Menyimpan...' : 'Ubah Password'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Admin Settings */}
            {isAdmin && (
                <>
                    {loadingSettings ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-apple-blue"></div>
                        </div>
                    ) : (
                        <>
                            {/* NTP Settings */}
                            <div className="card">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="stat-icon bg-apple-teal/15">
                                        <Server className="w-6 h-6 text-apple-teal" />
                                    </div>
                                    <div>
                                        <h2 className="text-title-3 text-white">Pengaturan Waktu & NTP</h2>
                                        <p className="text-callout text-dark-text-secondary">Sinkronisasi waktu server</p>
                                    </div>
                                </div>

                                {/* Current Time Display */}
                                <div className="bg-dark-bg-tertiary rounded-apple-lg p-5 mb-6 border border-white/5">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                        <div>
                                            <p className="text-caption text-apple-teal mb-1">Waktu Server ({timeInfo?.timezone || 'Asia/Jakarta'})</p>
                                            <p className="text-display text-white font-mono">
                                                {timeInfo?.formattedTime || format(currentTime, 'HH:mm:ss')}
                                            </p>
                                            <p className="text-callout text-dark-text-secondary mt-1">
                                                {timeInfo?.formattedDate || format(currentTime, 'yyyy-MM-dd')}
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-start md:items-end gap-2">
                                            <span className={`badge ${timeInfo?.isSynced ? 'badge-success' : 'badge-warning'}`}>
                                                {timeInfo?.isSynced ? 'Tersinkronisasi' : 'Belum Sync'}
                                            </span>
                                            {timeInfo?.lastSync && (
                                                <p className="text-caption text-dark-text-secondary">
                                                    Terakhir sync: {format(new Date(timeInfo.lastSync), 'dd/MM/yyyy HH:mm')}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    {/* Enable NTP Toggle */}
                                    <div className="flex items-center justify-between p-4 bg-dark-bg-tertiary rounded-apple">
                                        <div>
                                            <label className="text-body font-medium text-white">Aktifkan NTP</label>
                                            <p className="text-callout text-dark-text-secondary">Sinkronisasi waktu dengan server NTP</p>
                                        </div>
                                        <button
                                            onClick={() => updateNTPSettings({ ntpEnabled: !settings?.ntpEnabled })}
                                            disabled={savingNTP}
                                            className={`toggle ${settings?.ntpEnabled ? 'toggle-enabled' : 'toggle-disabled'}`}
                                        >
                                            <span className={`toggle-knob ${settings?.ntpEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                                        </button>
                                    </div>

                                    <div>
                                        <label className="block text-callout font-medium text-dark-text-secondary mb-2">Server NTP</label>
                                        <select
                                            value={settings?.ntpServer || 'pool.ntp.org'}
                                            onChange={(e) => updateNTPSettings({ ntpServer: e.target.value })}
                                            disabled={savingNTP || !settings?.ntpEnabled}
                                            className="input-field disabled:opacity-50"
                                        >
                                            {(ntpServers.length > 0 ? ntpServers : [
                                                { name: 'Pool NTP (Global)', address: 'pool.ntp.org' },
                                                { name: 'Google NTP', address: 'time.google.com' },
                                                { name: 'Cloudflare NTP', address: 'time.cloudflare.com' },
                                            ]).map((server) => (
                                                <option key={server.address} value={server.address}>
                                                    {server.name} ({server.address})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-callout font-medium text-dark-text-secondary mb-2">Zona Waktu</label>
                                        <select
                                            value={settings?.ntpTimezone || 'Asia/Jakarta'}
                                            onChange={(e) => updateNTPSettings({ ntpTimezone: e.target.value })}
                                            disabled={savingNTP}
                                            className="input-field disabled:opacity-50"
                                        >
                                            {(timezones.length > 0 ? timezones : [
                                                'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Singapore', 'UTC'
                                            ]).map((tz) => (
                                                <option key={tz} value={tz}>{tz}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-callout font-medium text-dark-text-secondary mb-2">Interval Sinkronisasi</label>
                                        <select
                                            value={settings?.ntpSyncInterval || 3600}
                                            onChange={(e) => updateNTPSettings({ ntpSyncInterval: parseInt(e.target.value) })}
                                            disabled={savingNTP || !settings?.ntpEnabled}
                                            className="input-field disabled:opacity-50"
                                        >
                                            <option value={60}>Setiap 1 menit</option>
                                            <option value={300}>Setiap 5 menit</option>
                                            <option value={900}>Setiap 15 menit</option>
                                            <option value={1800}>Setiap 30 menit</option>
                                            <option value={3600}>Setiap 1 jam</option>
                                            <option value={7200}>Setiap 2 jam</option>
                                            <option value={86400}>Setiap 24 jam</option>
                                        </select>
                                    </div>

                                    <button
                                        onClick={syncNow}
                                        disabled={syncing || !settings?.ntpEnabled}
                                        className="btn-secondary flex items-center gap-2"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                                        {syncing ? 'Menyinkronkan...' : 'Sinkronisasi Sekarang'}
                                    </button>
                                </div>
                            </div>

                            {/* System Settings */}
                            <div className="card">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="stat-icon bg-apple-purple/15">
                                        <Shield className="w-6 h-6 text-apple-purple" />
                                    </div>
                                    <div>
                                        <h2 className="text-title-3 text-white">Pengaturan Sistem</h2>
                                        <p className="text-callout text-dark-text-secondary">Konfigurasi order dan blacklist</p>
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    <div>
                                        <label className="flex items-center gap-2 text-callout font-medium text-dark-text-secondary mb-2">
                                            <Clock className="w-4 h-4" />
                                            Cutoff Time (Jam)
                                        </label>
                                        <p className="text-caption text-dark-text-secondary mb-2">
                                            Batas waktu order sebelum shift dimulai
                                        </p>
                                        <input
                                            type="number"
                                            min={0}
                                            max={24}
                                            value={cutoffHours}
                                            onChange={(e) => setCutoffHours(parseInt(e.target.value) || 0)}
                                            className="input-field"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-callout font-medium text-dark-text-secondary mb-2">
                                            Batas No-Show (Strike)
                                        </label>
                                        <p className="text-caption text-dark-text-secondary mb-2">
                                            Jumlah no-show sebelum user di-blacklist
                                        </p>
                                        <input
                                            type="number"
                                            min={1}
                                            max={10}
                                            value={blacklistStrikes}
                                            onChange={(e) => setBlacklistStrikes(parseInt(e.target.value) || 1)}
                                            className="input-field"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-callout font-medium text-dark-text-secondary mb-2">
                                            Durasi Blacklist (Hari)
                                        </label>
                                        <p className="text-caption text-dark-text-secondary mb-2">
                                            Lama user di-blacklist setelah melebihi batas no-show
                                        </p>
                                        <input
                                            type="number"
                                            min={1}
                                            max={365}
                                            value={blacklistDuration}
                                            onChange={(e) => setBlacklistDuration(parseInt(e.target.value) || 1)}
                                            className="input-field"
                                        />
                                    </div>

                                    <div className="pt-2">
                                        <button
                                            onClick={handleSaveSystemSettings}
                                            disabled={savingSystem}
                                            className="btn-primary"
                                        >
                                            {savingSystem ? 'Menyimpan...' : 'Simpan Pengaturan Sistem'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
