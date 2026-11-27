import { useState, useEffect, useCallback } from 'react';
import {
    DatabaseBackup,
    Download,
    Trash2,
    RotateCcw,
    Plus,
    AlertTriangle,
    Upload,
    Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    Modal,
    Field,
    Input,
    Textarea,
    EmptyState,
    Skeleton,
} from '../../components/ui';

interface BackupInfo {
    id: string;
    filename: string;
    size: number;
    createdAt: string;
    createdByName: string | null;
    notes: string | null;
    status: string;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('id-ID', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function BackupRestorePage() {
    const [backups, setBackups] = useState<BackupInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [uploading, setUploading] = useState(false);

    const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<BackupInfo | null>(null);
    const [createModal, setCreateModal] = useState(false);

    const [notes, setNotes] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [confirmationText, setConfirmationText] = useState('');
    const [retentionDays, setRetentionDays] = useState(30);

    const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
    const [autoBackupInterval, setAutoBackupInterval] = useState(7);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);

    const fetchBackups = useCallback(async () => {
        try {
            const response = await api.get('/api/server/backup');
            const data = response.data;
            setBackups(data.backups || []);
            setRetentionDays(data.retentionDays || 30);
            if (data.settings) {
                setAutoBackupEnabled(Boolean(data.settings.autoBackupEnabled));
                setAutoBackupInterval(data.settings.autoBackupInterval || 7);
            }
        } catch {
            toast.error('Gagal mengambil daftar backup');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBackups();
    }, [fetchBackups]);

    const handleSaveSettings = async () => {
        try {
            await api.put('/api/server/backup/settings', {
                autoBackupEnabled,
                autoBackupInterval: parseInt(String(autoBackupInterval), 10) || 1,
            });
            toast.success('Pengaturan auto backup disimpan');
            fetchBackups();
        } catch {
            toast.error('Gagal menyimpan pengaturan');
        }
    };

    const handleUploadBackup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fileToUpload) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('backup', fileToUpload);
        try {
            await api.post('/api/server/restore/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success('File backup diunggah');
            setFileToUpload(null);
            const fileInput = document.getElementById('backup-upload') as HTMLInputElement | null;
            if (fileInput) fileInput.value = '';
            fetchBackups();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal mengunggah backup');
        } finally {
            setUploading(false);
        }
    };

    const handleCreateBackup = async () => {
        setCreating(true);
        try {
            await api.post('/api/server/backup', { notes: notes || null });
            toast.success('Backup berhasil dibuat');
            setCreateModal(false);
            setNotes('');
            fetchBackups();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal membuat backup');
        } finally {
            setCreating(false);
        }
    };

    const handleDownload = async (backup: BackupInfo) => {
        try {
            const response = await api.get(`/api/server/backup/${backup.id}/download`, {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = backup.filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch {
            toast.error('Gagal mengunduh backup');
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await api.delete(`/api/server/backup/${deleteTarget.id}`, {
                data: { adminPassword },
            });
            toast.success('Backup dihapus');
            setDeleteTarget(null);
            setAdminPassword('');
            fetchBackups();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menghapus backup');
        }
    };

    const handleRestore = async () => {
        if (!restoreTarget) return;
        if (confirmationText !== 'RESTORE DATABASE') {
            toast.error('Ketik "RESTORE DATABASE" untuk konfirmasi');
            return;
        }
        try {
            await api.post(`/api/server/restore/${restoreTarget.id}`, {
                adminPassword,
                confirmationText,
            });
            toast.success('Database direstore');
            setRestoreTarget(null);
            setAdminPassword('');
            setConfirmationText('');
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal restore database');
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-56" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-44" />
                    <Skeleton className="h-44" />
                </div>
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title="Backup & restore"
                subtitle="Kelola cadangan database PostgreSQL otomatis maupun manual"
                actions={
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setCreateModal(true)}
                        leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                        Buat backup sekarang
                    </Button>
                }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <h2 className="text-[15px] font-bold text-[#1c1917] mb-3">Auto backup</h2>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                            <span className="text-[13px] font-semibold text-[#1c1917]">
                                Aktifkan auto backup
                            </span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={autoBackupEnabled}
                                onClick={() => setAutoBackupEnabled(!autoBackupEnabled)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full border-0 cursor-pointer transition-colors ${
                                    autoBackupEnabled ? 'bg-[#16a34a]' : 'bg-[#d6d3d1]'
                                }`}
                            >
                                <span
                                    className={`inline-block h-4 w-4 rounded-full bg-[#fff] transition-transform ${
                                        autoBackupEnabled ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                />
                            </button>
                        </div>

                        <Field label="Interval (hari)">
                            <Input
                                type="number"
                                min={1}
                                max={365}
                                value={autoBackupInterval}
                                onChange={(e) =>
                                    setAutoBackupInterval(parseInt(e.target.value, 10) || 1)
                                }
                            />
                        </Field>

                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleSaveSettings}
                            leftIcon={<Save className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Simpan pengaturan
                        </Button>
                    </div>
                </Card>

                <Card>
                    <h2 className="text-[15px] font-bold text-[#1c1917] mb-3">Unggah file backup (.sql)</h2>
                    <form onSubmit={handleUploadBackup} className="space-y-3">
                        <Field label="Pilih file SQL">
                            <input
                                id="backup-upload"
                                type="file"
                                accept=".sql"
                                onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
                                className="w-full text-[13px] text-[#57534e] file:mr-3 file:py-1.5 file:px-3 file:rounded-[8px] file:border file:border-[#e7e5e4] file:bg-[#fafaf9] file:text-[#1c1917] file:text-[12.5px] file:font-semibold file:cursor-pointer"
                            />
                        </Field>
                        <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            loading={uploading}
                            disabled={!fileToUpload}
                            leftIcon={<Upload className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Unggah ke daftar backup
                        </Button>
                    </form>
                </Card>
            </div>

            <div className="p-3.5 rounded-[12px] bg-[#fffbeb] border border-[#fde68a] flex items-start gap-3 text-[13px] text-[#92400e]">
                <AlertTriangle className="w-4 h-4 text-[#b45309] flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                    <b>Perhatian:</b> Restore akan menimpa seluruh isi database saat ini. Backup otomatis dihapus setelah {retentionDays} hari.
                </div>
            </div>

            <Card padding="none">
                <div className="px-4 py-3.5 border-b border-[#f5f5f4] flex items-center justify-between">
                    <h2 className="text-[15px] font-bold text-[#1c1917]">Daftar backup</h2>
                    <span className="text-[12px] text-[#78716c] tabular-nums">
                        {backups.length} file tersedia
                    </span>
                </div>

                {backups.length === 0 ? (
                    <EmptyState
                        icon={<DatabaseBackup className="w-6 h-6" />}
                        title="Belum ada backup"
                        description='Klik "Buat backup sekarang" untuk membuat cadangan database.'
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="bg-[#fafaf9] border-b border-[#f5f5f4]">
                                    <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Nama file
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Dibuat
                                    </th>
                                    <th className="text-right px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Ukuran
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Status
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Catatan
                                    </th>
                                    <th className="text-right px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-[#78716c]">
                                        Aksi
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#f5f5f4]">
                                {backups.map((b) => (
                                    <tr key={b.id} className="hover:bg-[#fafaf9]">
                                        <td className="px-4 py-2.5 font-mono text-[12px] font-semibold text-[#1c1917]">
                                            {b.filename}
                                        </td>
                                        <td className="px-3 py-2.5 text-[#57534e] whitespace-nowrap">
                                            <div>{formatDate(b.createdAt)}</div>
                                            {b.createdByName && (
                                                <div className="text-[11px] text-[#78716c]">
                                                    oleh {b.createdByName}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-[#57534e]">
                                            {formatBytes(b.size)}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <Badge variant={b.status === 'COMPLETED' ? 'success' : 'neutral'}>
                                                {b.status}
                                            </Badge>
                                        </td>
                                        <td className="px-3 py-2.5 text-[#57534e] max-w-xs truncate">
                                            {b.notes || '-'}
                                        </td>
                                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                            <div className="inline-flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    aria-label={`Unduh ${b.filename}`}
                                                    onClick={() => handleDownload(b)}
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => setRestoreTarget(b)}
                                                    leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                                                >
                                                    Restore
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    aria-label={`Hapus ${b.filename}`}
                                                    onClick={() => setDeleteTarget(b)}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 text-[#b91c1c]" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Create Backup Modal */}
            <Modal
                open={createModal}
                onClose={() => {
                    setCreateModal(false);
                    setNotes('');
                }}
                title="Buat backup database"
                size="md"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setCreateModal(false);
                                setNotes('');
                            }}
                        >
                            Batal
                        </Button>
                        <Button variant="primary" loading={creating} onClick={handleCreateBackup}>
                            Buat backup
                        </Button>
                    </>
                }
            >
                <Field label="Catatan" hint="Opsional">
                    <Textarea
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Contoh: Sebelum migrasi shift baru..."
                    />
                </Field>
            </Modal>

            {/* Delete Modal */}
            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => {
                    setDeleteTarget(null);
                    setAdminPassword('');
                }}
                title="Hapus file backup?"
                size="md"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setDeleteTarget(null);
                                setAdminPassword('');
                            }}
                        >
                            Batal
                        </Button>
                        <Button variant="danger" disabled={!adminPassword} onClick={handleDelete}>
                            Hapus permanen
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <p className="text-[13.5px] text-[#57534e]">
                        Hapus file backup <b className="font-mono">{deleteTarget?.filename}</b>?
                    </p>
                    <Field label="Password admin" required>
                        <Input
                            type="password"
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                            placeholder="Masukkan password Anda"
                        />
                    </Field>
                </div>
            </Modal>

            {/* Restore Modal */}
            <Modal
                open={Boolean(restoreTarget)}
                onClose={() => {
                    setRestoreTarget(null);
                    setAdminPassword('');
                    setConfirmationText('');
                }}
                title="Restore database"
                size="md"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setRestoreTarget(null);
                                setAdminPassword('');
                                setConfirmationText('');
                            }}
                        >
                            Batal
                        </Button>
                        <Button
                            variant="danger"
                            disabled={!adminPassword || confirmationText !== 'RESTORE DATABASE'}
                            onClick={handleRestore}
                        >
                            Restore sekarang
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <div className="p-3 rounded-[10px] bg-[#fef2f2] border border-[#fecaca] text-[13px] text-[#991b1b]">
                        <b>Peringatan:</b> Restore akan menimpa semua data saat ini dengan{' '}
                        <b className="font-mono">{restoreTarget?.filename}</b>.
                    </div>
                    <Field label="Password admin" required>
                        <Input
                            type="password"
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                        />
                    </Field>
                    <Field label="Ketik RESTORE DATABASE untuk konfirmasi" required>
                        <Input
                            value={confirmationText}
                            onChange={(e) => setConfirmationText(e.target.value)}
                            placeholder="RESTORE DATABASE"
                            className="font-mono"
                        />
                    </Field>
                </div>
            </Modal>
        </div>
    );
}
