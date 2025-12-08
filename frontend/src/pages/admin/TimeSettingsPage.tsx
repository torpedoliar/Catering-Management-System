import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3012/api';

interface NTPSettings {
    ntpEnabled: boolean;
    ntpServer: string;
    ntpTimezone: string;
    ntpSyncInterval: number;
    ntpLastSync: string | null;
    ntpOffset: number;
}

interface TimeInfo {
    serverTime: string;
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

export default function TimeSettingsPage() {
    const [settings, setSettings] = useState<NTPSettings | null>(null);
    const [timeInfo, setTimeInfo] = useState<TimeInfo | null>(null);
    const [timezones, setTimezones] = useState<string[]>([]);
    const [ntpServers, setNtpServers] = useState<NTPServer[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [currentTime, setCurrentTime] = useState<Date>(new Date());

    const getToken = () => localStorage.getItem('token');

    const fetchData = async () => {
        try {
            const token = getToken();
            const headers = { Authorization: `Bearer ${token}` };

            const [settingsRes, timeRes, tzRes, serversRes] = await Promise.all([
                fetch(`${API_URL}/time/ntp`, { headers }),
                fetch(`${API_URL}/time/info`, { headers }),
                fetch(`${API_URL}/time/timezones`, { headers }),
                fetch(`${API_URL}/time/ntp-servers`, { headers }),
            ]);

            if (settingsRes.ok) {
                setSettings(await settingsRes.json());
            }
            if (timeRes.ok) {
                const info = await timeRes.json();
                setTimeInfo(info);
                setCurrentTime(new Date(info.serverTime));
            }
            if (tzRes.ok) {
                setTimezones(await tzRes.json());
            }
            if (serversRes.ok) {
                setNtpServers(await serversRes.json());
            }
        } catch (error) {
            console.error('Error fetching NTP data:', error);
            toast.error('Gagal memuat pengaturan NTP');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime((prev) => new Date(prev.getTime() + 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const updateSettings = async (updates: Partial<NTPSettings>) => {
        setSaving(true);
        try {
            const token = getToken();
            const response = await fetch(`${API_URL}/time/ntp`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(updates),
            });

            if (response.ok) {
                const updated = await response.json();
                setSettings(updated);
                toast.success('Pengaturan NTP berhasil disimpan');
                fetchData();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Gagal menyimpan pengaturan');
            }
        } catch (error) {
            toast.error('Gagal menyimpan pengaturan');
        } finally {
            setSaving(false);
        }
    };

    const syncNow = async () => {
        setSyncing(true);
        try {
            const token = getToken();
            const response = await fetch(`${API_URL}/time/ntp/sync`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });

            const result = await response.json();
            if (result.success) {
                toast.success(`Sinkronisasi berhasil! Offset: ${result.offset}ms`);
                fetchData();
            } else {
                toast.error(result.error || 'Sinkronisasi gagal');
            }
        } catch (error) {
            toast.error('Gagal melakukan sinkronisasi');
        } finally {
            setSyncing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-100">Pengaturan Waktu & NTP</h1>
            </div>

            {/* Current Time Display */}
            <div className="bg-gradient-to-r from-cyan-900/50 to-blue-900/50 rounded-xl p-6 border border-cyan-500/30">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-cyan-400 mb-2">Waktu Server Saat Ini</h2>
                        <p className="text-4xl font-mono text-white">
                            {format(currentTime, 'HH:mm:ss')}
                        </p>
                        <p className="text-lg text-slate-300 mt-1">
                            {format(currentTime, 'EEEE, dd MMMM yyyy')}
                        </p>
                        <p className="text-sm text-slate-400 mt-2">
                            Timezone: {timeInfo?.timezone || 'Asia/Jakarta'}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
                            timeInfo?.isSynced 
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                        }`}>
                            <span className={`w-2 h-2 rounded-full mr-2 ${
                                timeInfo?.isSynced ? 'bg-green-400' : 'bg-yellow-400'
                            }`}></span>
                            {timeInfo?.isSynced ? 'Tersinkronisasi' : 'Belum Sync'}
                        </div>
                        {timeInfo?.lastSync && (
                            <p className="text-xs text-slate-400 mt-2">
                                Terakhir sync: {format(new Date(timeInfo.lastSync), 'dd/MM/yyyy HH:mm:ss')}
                            </p>
                        )}
                        {timeInfo?.offset !== undefined && timeInfo.offset !== 0 && (
                            <p className="text-xs text-slate-400 mt-1">
                                Offset: {timeInfo.offset}ms
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* NTP Settings Card */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700">
                    <h2 className="text-lg font-semibold text-slate-100">Pengaturan NTP</h2>
                    <p className="text-sm text-slate-400">Konfigurasi sinkronisasi waktu dengan server NTP</p>
                </div>

                <div className="p-6 space-y-6">
                    {/* Enable NTP */}
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="font-medium text-slate-200">Aktifkan NTP</label>
                            <p className="text-sm text-slate-400">Sinkronisasi waktu server dengan NTP server</p>
                        </div>
                        <button
                            onClick={() => updateSettings({ ntpEnabled: !settings?.ntpEnabled })}
                            disabled={saving}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                settings?.ntpEnabled ? 'bg-cyan-600' : 'bg-slate-600'
                            }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    settings?.ntpEnabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>

                    {/* NTP Server */}
                    <div>
                        <label className="block font-medium text-slate-200 mb-2">Server NTP</label>
                        <select
                            value={settings?.ntpServer || 'pool.ntp.org'}
                            onChange={(e) => updateSettings({ ntpServer: e.target.value })}
                            disabled={saving || !settings?.ntpEnabled}
                            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                        >
                            {ntpServers.map((server) => (
                                <option key={server.address} value={server.address}>
                                    {server.name} ({server.address})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Timezone */}
                    <div>
                        <label className="block font-medium text-slate-200 mb-2">Zona Waktu</label>
                        <select
                            value={settings?.ntpTimezone || 'Asia/Jakarta'}
                            onChange={(e) => updateSettings({ ntpTimezone: e.target.value })}
                            disabled={saving}
                            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                        >
                            {timezones.map((tz) => (
                                <option key={tz} value={tz}>{tz}</option>
                            ))}
                        </select>
                    </div>

                    {/* Sync Interval */}
                    <div>
                        <label className="block font-medium text-slate-200 mb-2">Interval Sinkronisasi</label>
                        <select
                            value={settings?.ntpSyncInterval || 3600}
                            onChange={(e) => updateSettings({ ntpSyncInterval: parseInt(e.target.value) })}
                            disabled={saving || !settings?.ntpEnabled}
                            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                        >
                            <option value={60}>Setiap 1 menit</option>
                            <option value={300}>Setiap 5 menit</option>
                            <option value={900}>Setiap 15 menit</option>
                            <option value={1800}>Setiap 30 menit</option>
                            <option value={3600}>Setiap 1 jam</option>
                            <option value={7200}>Setiap 2 jam</option>
                            <option value={14400}>Setiap 4 jam</option>
                            <option value={28800}>Setiap 8 jam</option>
                            <option value={43200}>Setiap 12 jam</option>
                            <option value={86400}>Setiap 24 jam</option>
                        </select>
                    </div>

                    {/* Manual Sync Button */}
                    <div className="pt-4 border-t border-slate-700">
                        <button
                            onClick={syncNow}
                            disabled={syncing || !settings?.ntpEnabled}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                        >
                            {syncing ? (
                                <>
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Menyinkronkan...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Sinkronisasi Sekarang
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Info Box */}
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
                <div className="flex gap-3">
                    <svg className="w-6 h-6 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                        <h3 className="font-medium text-blue-400">Tentang Sinkronisasi Waktu</h3>
                        <p className="text-sm text-slate-300 mt-1">
                            Pengaturan NTP memastikan waktu server selalu akurat dan konsisten. 
                            Waktu yang tersinkronisasi digunakan untuk:
                        </p>
                        <ul className="text-sm text-slate-400 mt-2 list-disc list-inside space-y-1">
                            <li>Validasi cutoff time pemesanan makanan</li>
                            <li>Penentuan tanggal order dan check-in</li>
                            <li>Proses otomatis no-show berdasarkan jadwal shift</li>
                            <li>Pencatatan waktu transaksi dan log aktivitas</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
