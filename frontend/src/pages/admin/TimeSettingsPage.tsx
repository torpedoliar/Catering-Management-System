import { useState, useEffect } from 'react';
import { RefreshCw, Clock, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDateTimeShortWIB } from '../../utils/timezone';
import { api } from '../../contexts/AuthContext';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    Field,
    Select,
    Skeleton,
} from '../../components/ui';

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

export default function TimeSettingsPage() {
    const [settings, setSettings] = useState<NTPSettings | null>(null);
    const [timeInfo, setTimeInfo] = useState<TimeInfo | null>(null);
    const [timezones, setTimezones] = useState<string[]>([]);
    const [ntpServers, setNtpServers] = useState<NTPServer[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [currentTime, setCurrentTime] = useState('');
    const [currentDate, setCurrentDate] = useState('');

    const fetchData = async () => {
        try {
            const [settingsRes, timeRes, tzRes, serversRes] = await Promise.all([
                api.get('/api/time/ntp'),
                api.get('/api/time/info'),
                api.get('/api/time/timezones'),
                api.get('/api/time/ntp-servers'),
            ]);
            setSettings(settingsRes.data);
            setTimeInfo(timeRes.data);
            setCurrentTime(timeRes.data.formattedTime || '');
            setCurrentDate(timeRes.data.formattedDate || '');
            setTimezones(tzRes.data || []);
            setNtpServers(serversRes.data || []);
        } catch {
            toast.error('Gagal memuat pengaturan NTP');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Ticking UI clock derived from fetched server time string
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime((prev) => {
                if (!prev) return prev;
                const parts = prev.split(':');
                if (parts.length !== 3) return prev;
                let h = parseInt(parts[0], 10);
                let m = parseInt(parts[1], 10);
                let s = parseInt(parts[2], 10) + 1;
                if (s >= 60) {
                    s = 0;
                    m++;
                }
                if (m >= 60) {
                    m = 0;
                    h++;
                }
                if (h >= 24) h = 0;
                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const updateSettings = async (updates: Partial<NTPSettings>) => {
        setSaving(true);
        try {
            const response = await api.put('/api/time/ntp', updates);
            setSettings(response.data);
            toast.success('Pengaturan NTP disimpan');
            fetchData();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menyimpan pengaturan');
        } finally {
            setSaving(false);
        }
    };

    const syncNow = async () => {
        setSyncing(true);
        try {
            const response = await api.post('/api/time/ntp/sync');
            const result = response.data;
            if (result.success) {
                toast.success(`Sinkronisasi berhasil! Offset: ${result.offset}ms`);
                fetchData();
            } else {
                toast.error(result.error || 'Sinkronisasi gagal');
            }
        } catch {
            toast.error('Gagal melakukan sinkronisasi');
        } finally {
            setSyncing(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4 max-w-4xl">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-4 max-w-4xl">
            <PageHeader
                title="Pengaturan waktu & NTP"
                subtitle="Sinkronisasi jam server catering dengan NTP untuk validasi cutoff & check-in"
                actions={
                    <Button
                        variant="primary"
                        size="sm"
                        loading={syncing}
                        disabled={!settings?.ntpEnabled}
                        onClick={syncNow}
                        leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                        Sinkronisasi sekarang
                    </Button>
                }
            />

            {/* Server Clock Display */}
            <Card>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-[12px] bg-[#fffbeb] border border-[#fde68a] text-[#b45309] flex items-center justify-center flex-shrink-0">
                            <Clock className="w-6 h-6" aria-hidden="true" />
                        </div>
                        <div>
                            <div className="text-[12px] font-semibold uppercase tracking-wider text-[#78716c]">
                                Waktu server saat ini
                            </div>
                            <div className="text-[32px] font-extrabold font-mono text-[#1c1917] tabular-nums leading-tight">
                                {currentTime || '--:--:--'}
                            </div>
                            <div className="text-[13px] text-[#57534e]">
                                {currentDate || '----/--/--'} · {timeInfo?.timezone || 'Asia/Jakarta'}
                            </div>
                        </div>
                    </div>

                    <div className="sm:text-right space-y-1">
                        <Badge variant={timeInfo?.isSynced ? 'success' : 'warning'} dot>
                            {timeInfo?.isSynced ? 'Tersinkronisasi' : 'Belum tersinkron'}
                        </Badge>
                        {timeInfo?.lastSync && (
                            <div className="text-[12px] text-[#78716c]">
                                Terakhir: {formatDateTimeShortWIB(timeInfo.lastSync)}
                            </div>
                        )}
                        {timeInfo?.offset !== undefined && timeInfo.offset !== 0 && (
                            <div className="text-[12px] font-mono text-[#57534e]">
                                Offset: {timeInfo.offset}ms
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {/* NTP Configuration */}
            <Card>
                <h2 className="text-[15px] font-bold text-[#1c1917] mb-4">Konfigurasi NTP</h2>

                <div className="space-y-4">
                    <div className="flex items-center justify-between p-3.5 rounded-[12px] bg-[#fafaf9] border border-[#e7e5e4]">
                        <div>
                            <div className="text-[13.5px] font-semibold text-[#1c1917]">Aktifkan NTP</div>
                            <div className="text-[12px] text-[#78716c]">
                                Sinkronkan waktu server otomatis dengan server NTP
                            </div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(settings?.ntpEnabled)}
                            disabled={saving}
                            onClick={() => updateSettings({ ntpEnabled: !settings?.ntpEnabled })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full border-0 cursor-pointer transition-colors disabled:opacity-50 ${
                                settings?.ntpEnabled ? 'bg-[#16a34a]' : 'bg-[#d6d3d1]'
                            }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 rounded-full bg-[#fff] transition-transform ${
                                    settings?.ntpEnabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Server NTP">
                            <Select
                                value={settings?.ntpServer || 'pool.ntp.org'}
                                onChange={(e) => updateSettings({ ntpServer: e.target.value })}
                                disabled={saving || !settings?.ntpEnabled}
                            >
                                {ntpServers.map((s) => (
                                    <option key={s.address} value={s.address}>
                                        {s.name} ({s.address})
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Zona waktu">
                            <Select
                                value={settings?.ntpTimezone || 'Asia/Jakarta'}
                                onChange={(e) => updateSettings({ ntpTimezone: e.target.value })}
                                disabled={saving}
                            >
                                {timezones.map((tz) => (
                                    <option key={tz} value={tz}>
                                        {tz}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>

                    <Field label="Interval sinkronisasi" className="max-w-xs">
                        <Select
                            value={settings?.ntpSyncInterval || 3600}
                            onChange={(e) =>
                                updateSettings({ ntpSyncInterval: parseInt(e.target.value, 10) })
                            }
                            disabled={saving || !settings?.ntpEnabled}
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
                        </Select>
                    </Field>
                </div>
            </Card>

            <Card padding="sm">
                <div className="flex items-start gap-3">
                    <Info className="w-4 h-4 text-[#2563eb] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="text-[12.5px] text-[#57534e] space-y-1">
                        <div className="font-semibold text-[#1c1917]">Tentang sinkronisasi waktu</div>
                        <p>
                            Waktu yang tersinkronisasi digunakan untuk validasi cutoff pemesanan, penentuan hari transaksi, penandaan no-show otomatis, dan pencatatan audit log.
                        </p>
                    </div>
                </div>
            </Card>
        </div>
    );
}
