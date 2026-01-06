import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, CheckCircle, ArrowUpCircle, GitBranch } from 'lucide-react';
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

export default function UpdatePage() {
    const [currentVersion, setCurrentVersion] = useState<VersionInfo | null>(null);
    const [latestVersion, setLatestVersion] = useState<VersionInfo | null>(null);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
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

                            <div className="mt-4 p-4 bg-white border border-green-300 rounded-xl">
                                <p className="text-sm font-medium text-green-800 mb-2">
                                    Untuk update, jalankan script berikut di server:
                                </p>
                                <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm text-green-400">
                                    <div>cd /path/to/project</div>
                                    <div className="text-amber-400">.\update.ps1</div>
                                    <div className="text-slate-500"># atau di Linux: ./update.sh</div>
                                </div>
                            </div>
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

            {/* Instructions */}
            <div className="card p-6">
                <h2 className="text-lg font-semibold text-[#1a1f37] mb-4">Cara Update Aplikasi</h2>
                <div className="space-y-3 text-sm text-slate-600">
                    <p>Untuk update aplikasi, jalankan script berikut di server/host machine:</p>

                    <div className="bg-slate-900 rounded-xl p-4 font-mono text-sm">
                        <div className="text-slate-400"># Masuk ke direktori project</div>
                        <div className="text-green-400">cd /path/to/Catering-Management</div>
                        <div className="mt-2 text-slate-400"># Jalankan script update</div>
                        <div className="text-amber-400">.\update.ps1</div>
                        <div className="text-slate-500"># atau di Linux: ./update.sh</div>
                    </div>

                    <p className="mt-4">Script akan otomatis:</p>
                    <ul className="list-disc list-inside space-y-1 pl-2 text-slate-500">
                        <li>Backup database</li>
                        <li>Pull kode terbaru dari GitHub</li>
                        <li>Rebuild containers</li>
                        <li>Sync database schema dengan <code className="bg-slate-100 px-1">prisma db push</code></li>
                        <li>Cleanup backup lama</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

