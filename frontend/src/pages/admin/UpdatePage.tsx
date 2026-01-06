import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, CheckCircle, AlertTriangle, XCircle, ArrowUpCircle, Clock, GitBranch, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3012';

interface VersionInfo {
    version: string;
    releaseDate: string;
    minDatabaseVersion: string;
    changelog: string[];
    repository: string;
    branch: string;
}

interface UpdateStatus {
    isUpdating: boolean;
    currentStep: string;
    progress: number;
    error: string | null;
    logs: string[];
    lastUpdate: string | null;
}

export default function UpdatePage() {
    const [currentVersion, setCurrentVersion] = useState<VersionInfo | null>(null);
    const [latestVersion, setLatestVersion] = useState<VersionInfo | null>(null);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const getToken = () => localStorage.getItem('token');

    const fetchCurrentVersion = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/version`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCurrentVersion(data.current);
            }
        } catch (error) {
            console.error('Failed to fetch version:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const checkForUpdates = async () => {
        setIsChecking(true);
        try {
            const res = await fetch(`${API_URL}/api/version/check`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            if (!res.ok) throw new Error('Failed to check for updates');

            const data = await res.json();
            setCurrentVersion(data.current);
            setLatestVersion(data.latest);
            setUpdateAvailable(data.updateAvailable);

            if (data.updateAvailable) {
                toast.success(`Update tersedia: v${data.latest.version}`);
            } else if (data.isNewer) {
                toast.success('Anda menggunakan versi development terbaru');
            } else {
                toast.success('Aplikasi sudah versi terbaru');
            }
        } catch (error) {
            console.error('Check update error:', error);
            toast.error('Gagal memeriksa update');
        } finally {
            setIsChecking(false);
        }
    };

    const startUpdate = async () => {
        if (!confirm('Apakah Anda yakin ingin memperbarui aplikasi? Proses ini akan menarik kode terbaru dari GitHub dan memperbarui database schema.')) {
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/version/update`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            if (!res.ok) throw new Error('Failed to start update');

            toast.success('Update dimulai...');
            pollUpdateStatus();
        } catch (error) {
            console.error('Start update error:', error);
            toast.error('Gagal memulai update');
        }
    };

    const pollUpdateStatus = async () => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${API_URL}/api/version/update-status`, {
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });

                if (res.ok) {
                    const status = await res.json();
                    setUpdateStatus(status);

                    if (!status.isUpdating && status.progress === 100) {
                        clearInterval(interval);
                        toast.success('Update selesai! Silakan restart container.');
                    } else if (!status.isUpdating && status.error) {
                        clearInterval(interval);
                        toast.error('Update gagal: ' + status.error);
                    }
                }
            } catch (error) {
                // Server might be restarting
                console.log('Polling update status...');
            }
        }, 2000);

        // Stop polling after 5 minutes
        setTimeout(() => clearInterval(interval), 300000);
    };

    const restartServer = async () => {
        if (!confirm('Apakah Anda yakin ingin restart server? Aplikasi akan tidak tersedia beberapa saat.')) {
            return;
        }

        try {
            await fetch(`${API_URL}/api/version/restart`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            toast.success('Server sedang restart...');
        } catch (error) {
            // Expected - server is restarting
            toast.success('Server sedang restart...');
        }
    };

    useEffect(() => {
        fetchCurrentVersion();
    }, [fetchCurrentVersion]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-slate-500 mt-4">Memuat informasi versi...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                        <ArrowUpCircle className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-[#1a1f37]">System Update</h1>
                        <p className="text-slate-500">Kelola update aplikasi</p>
                    </div>
                </div>

                <button
                    onClick={checkForUpdates}
                    disabled={isChecking}
                    className="btn-secondary flex items-center gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
                    Check for Updates
                </button>
            </div>

            {/* Current Version Card */}
            <div className="card p-6">
                <h2 className="text-lg font-semibold text-[#1a1f37] mb-4 flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-purple-500" />
                    Versi Saat Ini
                </h2>

                {currentVersion ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <p className="text-sm text-slate-500">Versi</p>
                            <p className="text-2xl font-bold text-purple-600">v{currentVersion.version}</p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Tanggal Rilis</p>
                            <p className="font-medium text-[#1a1f37]">{currentVersion.releaseDate}</p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Branch</p>
                            <p className="font-medium text-[#1a1f37]">{currentVersion.branch || 'main'}</p>
                        </div>
                    </div>
                ) : (
                    <p className="text-slate-500">Tidak dapat membaca informasi versi</p>
                )}

                {currentVersion?.changelog && currentVersion.changelog.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-sm text-slate-500 mb-2">Changelog:</p>
                        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                            {currentVersion.changelog.map((item, i) => (
                                <li key={i}>{item}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Update Available Card */}
            {updateAvailable && latestVersion && (
                <div className="card p-6 border-2 border-green-200 bg-green-50">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
                            <Download className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-green-800">Update Tersedia!</h3>
                            <p className="text-green-700 mt-1">
                                Versi baru <strong>v{latestVersion.version}</strong> tersedia (rilis: {latestVersion.releaseDate})
                            </p>

                            {latestVersion.changelog && latestVersion.changelog.length > 0 && (
                                <div className="mt-3">
                                    <p className="text-sm text-green-600 font-medium">Perubahan:</p>
                                    <ul className="list-disc list-inside text-sm text-green-700 mt-1">
                                        {latestVersion.changelog.map((item, i) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <button
                                onClick={startUpdate}
                                disabled={updateStatus?.isUpdating}
                                className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2"
                            >
                                {updateStatus?.isUpdating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Updating...
                                    </>
                                ) : (
                                    <>
                                        <ArrowUpCircle className="w-4 h-4" />
                                        Update Sekarang
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* No Update Card */}
            {!updateAvailable && latestVersion && (
                <div className="card p-6 border-2 border-emerald-200 bg-emerald-50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center">
                            <CheckCircle className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-emerald-800">Aplikasi Sudah Terbaru</h3>
                            <p className="text-emerald-700">
                                Anda sudah menggunakan versi terbaru (v{currentVersion?.version})
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Update Progress */}
            {updateStatus && (updateStatus.isUpdating || updateStatus.logs.length > 0) && (
                <div className="card p-6">
                    <h2 className="text-lg font-semibold text-[#1a1f37] mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-blue-500" />
                        Progress Update
                    </h2>

                    <div className="mb-4">
                        <div className="flex justify-between text-sm text-slate-600 mb-2">
                            <span>{updateStatus.currentStep}</span>
                            <span>{updateStatus.progress}%</span>
                        </div>
                        <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-500 ${updateStatus.error ? 'bg-red-500' :
                                        updateStatus.progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                                    }`}
                                style={{ width: `${updateStatus.progress}%` }}
                            />
                        </div>
                    </div>

                    {/* Logs */}
                    <div className="bg-slate-900 rounded-xl p-4 max-h-64 overflow-y-auto font-mono text-sm">
                        {updateStatus.logs.map((log, i) => (
                            <div key={i} className={`${log.includes('ERROR') ? 'text-red-400' :
                                    log.includes('OK') || log.includes('completed') ? 'text-green-400' :
                                        'text-slate-300'
                                }`}>
                                {log}
                            </div>
                        ))}
                    </div>

                    {updateStatus.error && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-red-800">Update Gagal</p>
                                <p className="text-sm text-red-600">{updateStatus.error}</p>
                            </div>
                        </div>
                    )}

                    {updateStatus.progress === 100 && !updateStatus.error && (
                        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium text-amber-800">Restart Diperlukan</p>
                                    <p className="text-sm text-amber-600 mb-3">
                                        Update selesai. Restart container untuk menerapkan perubahan.
                                    </p>
                                    <button
                                        onClick={restartServer}
                                        className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        Restart Server
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Instructions */}
            <div className="card p-6">
                <h2 className="text-lg font-semibold text-[#1a1f37] mb-4">Cara Manual Update</h2>
                <div className="space-y-3 text-sm text-slate-600">
                    <p>Jika update otomatis gagal, Anda bisa melakukan update manual:</p>
                    <ol className="list-decimal list-inside space-y-2 pl-2">
                        <li>SSH ke server atau akses terminal</li>
                        <li>Masuk ke direktori project</li>
                        <li>Jalankan: <code className="bg-slate-100 px-2 py-0.5 rounded">git pull origin main</code></li>
                        <li>Jalankan: <code className="bg-slate-100 px-2 py-0.5 rounded">docker-compose down</code></li>
                        <li>Jalankan: <code className="bg-slate-100 px-2 py-0.5 rounded">docker-compose build --no-cache</code></li>
                        <li>Jalankan: <code className="bg-slate-100 px-2 py-0.5 rounded">docker-compose up -d</code></li>
                        <li>Jalankan: <code className="bg-slate-100 px-2 py-0.5 rounded">docker exec catering-backend npx prisma db push</code></li>
                    </ol>
                </div>
            </div>
        </div>
    );
}
