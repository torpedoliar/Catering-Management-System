import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, CheckCircle, GitBranch } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    Skeleton,
} from '../../components/ui';

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

    const fetchCurrentVersion = useCallback(async () => {
        try {
            const res = await api.get('/api/version');
            setCurrentVersion(res.data.current);
        } catch (error) {
            console.error('Failed to fetch version:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const checkForUpdates = async () => {
        setIsChecking(true);
        try {
            const res = await api.get('/api/version/check');
            const data = res.data;
            setCurrentVersion(data.current);
            setLatestVersion(data.latest);
            setUpdateAvailable(data.updateAvailable);

            if (data.updateAvailable) {
                toast.success(`Pembaruan tersedia: v${data.latest.version}`);
            } else if (data.isNewer) {
                toast.success('Anda menggunakan versi pengembangan terbaru');
            } else {
                toast.success('Aplikasi sudah versi terbaru');
            }
        } catch {
            toast.error('Gagal memeriksa pembaruan');
        } finally {
            setIsChecking(false);
        }
    };

    useEffect(() => {
        fetchCurrentVersion();
    }, [fetchCurrentVersion]);

    if (isLoading) {
        return (
            <div className="space-y-4 max-w-4xl">
                <Skeleton className="h-9 w-56" />
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-36 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-4 max-w-4xl">
            <PageHeader
                title="Pembaruan sistem"
                subtitle="Informasi versi aplikasi saat ini dan panduan update"
                actions={
                    <Button
                        variant="primary"
                        size="sm"
                        loading={isChecking}
                        onClick={checkForUpdates}
                        leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                        Periksa pembaruan
                    </Button>
                }
            />

            <Card>
                <div className="flex items-center gap-2 mb-4">
                    <GitBranch className="w-4 h-4 text-[#b45309]" aria-hidden="true" />
                    <h2 className="text-[15px] font-bold text-[#1c1917]">Versi terpasang</h2>
                </div>

                {currentVersion ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                            <div className="text-[11.5px] font-semibold uppercase text-[#78716c]">Versi</div>
                            <div className="text-[24px] font-extrabold text-[#b45309] tabular-nums mt-0.5">
                                v{currentVersion.version}
                            </div>
                        </div>
                        <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                            <div className="text-[11.5px] font-semibold uppercase text-[#78716c]">Tanggal rilis</div>
                            <div className="text-[14px] font-semibold text-[#1c1917] mt-1">
                                {currentVersion.releaseDate}
                            </div>
                        </div>
                        <div className="p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                            <div className="text-[11.5px] font-semibold uppercase text-[#78716c]">Branch</div>
                            <div className="mt-1">
                                <Badge variant="neutral">{currentVersion.branch || 'main'}</Badge>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="text-[13px] text-[#78716c]">Tidak dapat membaca informasi versi</p>
                )}

                {currentVersion?.changelog && currentVersion.changelog.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-[#f5f5f4]">
                        <div className="text-[12px] font-semibold text-[#57534e] mb-1.5">Catatan perubahan:</div>
                        <ul className="list-disc list-inside text-[13px] text-[#57534e] space-y-1">
                            {currentVersion.changelog.map((item, i) => (
                                <li key={i}>{item}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </Card>

            {updateAvailable && latestVersion && (
                <div className="p-4 rounded-[14px] bg-[#f0fdf4] border border-[#86efac]">
                    <div className="flex items-start gap-3">
                        <Download className="w-5 h-5 text-[#15803d] flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <div className="flex-1 space-y-2">
                            <div className="text-[14.5px] font-bold text-[#166534]">
                                Pembaruan tersedia: v{latestVersion.version}
                            </div>
                            <p className="text-[13px] text-[#15803d]">
                                Dirilis: {latestVersion.releaseDate}
                            </p>
                            {latestVersion.changelog && latestVersion.changelog.length > 0 && (
                                <ul className="list-disc list-inside text-[12.5px] text-[#166534] space-y-0.5">
                                    {latestVersion.changelog.map((item, i) => (
                                        <li key={i}>{item}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {!updateAvailable && latestVersion && (
                <div className="p-4 rounded-[14px] bg-[#f0fdf4] border border-[#bbf7d0] flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-[#15803d]" aria-hidden="true" />
                    <div className="text-[13px] text-[#166534]">
                        <b>Aplikasi sudah versi terbaru</b> (v{currentVersion?.version})
                    </div>
                </div>
            )}

            <Card>
                <h2 className="text-[15px] font-bold text-[#1c1917] mb-3">Panduan pembaruan server</h2>
                <p className="text-[13px] text-[#57534e] mb-3">
                    Untuk memperbarui aplikasi di server produksi, jalankan skrip pembaruan pada direktori proyek:
                </p>
                <pre className="p-3.5 rounded-[10px] bg-[#1c1917] text-[#fafaf9] font-mono text-[12.5px] overflow-x-auto leading-relaxed">
{`cd /path/to/Catering-Management
.\\update.ps1   # Windows
./update.sh   # Linux`}
                </pre>
            </Card>
        </div>
    );
}
