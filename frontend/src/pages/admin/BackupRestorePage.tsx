import { useState, useEffect } from 'react';
import { DatabaseBackup, Download, Trash2, RotateCcw, Plus, AlertTriangle, Clock, FileText, Upload, Save } from 'lucide-react';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3012';

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
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('id-ID', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export default function BackupRestorePage() {
    const [backups, setBackups] = useState<BackupInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [restoreModal, setRestoreModal] = useState<{ open: boolean; backup: BackupInfo | null }>({ open: false, backup: null });
    const [deleteModal, setDeleteModal] = useState<{ open: boolean; backup: BackupInfo | null }>({ open: false, backup: null });
    const [createModal, setCreateModal] = useState(false);
    const [notes, setNotes] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [confirmationText, setConfirmationText] = useState('');
    const [retentionDays, setRetentionDays] = useState(30);

    // Auto Backup State
    const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
    const [autoBackupInterval, setAutoBackupInterval] = useState(7);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);

    const getToken = () => localStorage.getItem('token');

    const fetchBackups = async () => {
        try {
            const response = await fetch(`${API_URL}/api/server/backup`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });

            if (response.ok) {
                const data = await response.json();
                setBackups(data.backups);
                setRetentionDays(data.retentionDays);
                if (data.settings) {
                    setAutoBackupEnabled(data.settings.autoBackupEnabled);
                    setAutoBackupInterval(data.settings.autoBackupInterval);
                }
            }
        } catch (error) {
            console.error('Error fetching backups:', error);
            toast.error('Gagal mengambil daftar backup');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSettings = async () => {
        try {
            const response = await fetch(`${API_URL}/api/server/backup/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getToken()}`
                },
                body: JSON.stringify({
                    autoBackupEnabled,
                    autoBackupInterval: parseInt(autoBackupInterval.toString())
                })
            });

            if (response.ok) {
                toast.success('Pengaturan backup disimpan');
                fetchBackups();
            } else {
                toast.error('Gagal menyimpan pengaturan');
            }
        } catch (error) {
            toast.error('Gagal menyimpan pengaturan');
        }
    }

    const handleUploadBackup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fileToUpload) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('backup', fileToUpload);

        try {
            const response = await fetch(`${API_URL}/api/server/restore/upload`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${getToken()}`
                },
                body: formData
            });

            if (response.ok) {
                toast.success('Backup berhasil diunggah');
                setFileToUpload(null);
                // Reset file input
                const fileInput = document.getElementById('backup-upload') as HTMLInputElement;
                if (fileInput) fileInput.value = '';

                fetchBackups();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Gagal mengunggah backup');
            }
        } catch (error) {
            toast.error('Gagal mengunggah backup');
        } finally {
            setUploading(false);
        }
    }

    useEffect(() => {
        fetchBackups();
    }, []);

    const handleCreateBackup = async () => {
        setCreating(true);
        try {
            const response = await fetch(`${API_URL}/api/server/backup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getToken()}`
                },
                body: JSON.stringify({ notes: notes || null })
            });

            if (response.ok) {
                toast.success('Backup berhasil dibuat');
                setCreateModal(false);
                setNotes('');
                fetchBackups();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Gagal membuat backup');
            }
        } catch (error) {
            toast.error('Gagal membuat backup');
        } finally {
            setCreating(false);
        }
    };

    const handleDownload = async (backup: BackupInfo) => {
        try {
            const response = await fetch(`${API_URL}/api/server/backup/${backup.id}/download`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });

            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = backup.filename; // Force filename from backup object
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download error:', error);
            toast.error('Gagal mengunduh backup');
        }
    };

    const handleDelete = async () => {
        if (!deleteModal.backup) return;

        try {
            const response = await fetch(`${API_URL}/api/server/backup/${deleteModal.backup.id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getToken()}`
                },
                body: JSON.stringify({ adminPassword })
            });

            if (response.ok) {
                toast.success('Backup berhasil dihapus');
                setDeleteModal({ open: false, backup: null });
                setAdminPassword('');
                fetchBackups();
            } else {
                const error = await response.json();
                toast.error(error.error || 'Gagal menghapus backup');
            }
        } catch (error) {
            toast.error('Gagal menghapus backup');
        }
    };

    const handleRestore = async () => {
        if (!restoreModal.backup) return;

        if (confirmationText !== 'RESTORE DATABASE') {
            toast.error('Ketik "RESTORE DATABASE" untuk konfirmasi');
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/server/restore/${restoreModal.backup.id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getToken()}`
                },
                body: JSON.stringify({ adminPassword, confirmationText })
            });

            if (response.ok) {
                toast.success('Database berhasil direstore');
                setRestoreModal({ open: false, backup: null });
                setAdminPassword('');
                setConfirmationText('');
            } else {
                const error = await response.json();
                toast.error(error.error || 'Gagal restore database');
            }
        } catch (error) {
            toast.error('Gagal restore database');
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
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                        <DatabaseBackup className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-100">Backup & Restore</h1>
                        <p className="text-sm text-slate-400">Kelola backup database PostgreSQL</p>
                    </div>
                </div>
                <button
                    onClick={() => setCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Buat Backup
                </button>
            </div>

            {/* Configuration & Upload Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Auto Backup Settings */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-100">Auto Backup</h3>
                            <p className="text-sm text-slate-400">Jadwalkan backup otomatis</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-300">Aktifkan Auto Backup</label>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={autoBackupEnabled}
                                    onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-300">Interval (Hari)</label>
                            <input
                                type="number"
                                min="1"
                                max="365"
                                value={autoBackupInterval}
                                onChange={(e) => setAutoBackupInterval(parseInt(e.target.value) || 1)}
                                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <button
                            onClick={handleSaveSettings}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors mt-2"
                        >
                            <Save className="w-4 h-4" />
                            Simpan Pengaturan
                        </button>
                    </div>
                </div>

                {/* Restore from File */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                            <Upload className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-100">Restore dari File</h3>
                            <p className="text-sm text-slate-400">Upload file backup (.sql)</p>
                        </div>
                    </div>

                    <form onSubmit={handleUploadBackup} className="space-y-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-300">Pilih File Backup</label>
                            <input
                                id="backup-upload"
                                type="file"
                                accept=".sql"
                                onChange={(e) => setFileToUpload(e.target.files ? e.target.files[0] : null)}
                                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-amber-500/10 file:text-amber-400 hover:file:bg-amber-500/20"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!fileToUpload || uploading}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors mt-2"
                        >
                            {uploading ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                            ) : (
                                <Upload className="w-4 h-4" />
                            )}
                            {uploading ? 'Mengupload...' : 'Upload & Tambahkan ke List'}
                        </button>
                    </form>
                </div>
            </div>
            {/* Warning */}
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
                <div className="flex gap-3">
                    <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0" />
                    <div>
                        <h3 className="font-medium text-amber-400">Perhatian</h3>
                        <p className="text-sm text-slate-300 mt-1">
                            Restore database akan <strong>mengganti semua data saat ini</strong>. Pastikan Anda memiliki backup terbaru sebelum melakukan restore.
                            Backup otomatis dihapus setelah {retentionDays} hari.
                        </p>
                    </div>
                </div>
            </div>

            {/* Backup List */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700">
                    <h2 className="text-lg font-semibold text-slate-100">Daftar Backup</h2>
                    <p className="text-sm text-slate-400">{backups.length} backup tersedia</p>
                </div>

                {backups.length === 0 ? (
                    <div className="p-12 text-center">
                        <DatabaseBackup className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <p className="text-slate-400">Belum ada backup</p>
                        <p className="text-sm text-slate-500 mt-1">Klik "Buat Backup" untuk membuat backup pertama</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Filename</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Dibuat</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Size</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Notes</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {backups.map((backup) => (
                                    <tr key={backup.id} className="hover:bg-slate-700/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <FileText className="w-5 h-5 text-slate-500" />
                                                <span className="text-sm font-mono text-slate-200">{backup.filename}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-sm text-slate-300">
                                                <Clock className="w-4 h-4 text-slate-500" />
                                                {formatDate(backup.createdAt)}
                                            </div>
                                            {backup.createdByName && (
                                                <p className="text-xs text-slate-500 mt-1">by {backup.createdByName}</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-300">{formatBytes(backup.size)}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${backup.status === 'COMPLETED'
                                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                                : backup.status === 'IN_PROGRESS'
                                                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                                }`}>
                                                {backup.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-400 max-w-[200px] truncate">
                                            {backup.notes || '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleDownload(backup)}
                                                    disabled={backup.status !== 'COMPLETED'}
                                                    className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Download"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setRestoreModal({ open: true, backup })}
                                                    disabled={backup.status !== 'COMPLETED'}
                                                    className="p-2 text-amber-400 hover:bg-amber-500/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Restore"
                                                >
                                                    <RotateCcw className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteModal({ open: true, backup })}
                                                    className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create Backup Modal */}
            {
                createModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700">
                            <h3 className="text-lg font-semibold text-slate-100 mb-4">Buat Backup Baru</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Catatan (opsional)</label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Contoh: Backup sebelum update sistem..."
                                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        rows={3}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => { setCreateModal(false); setNotes(''); }}
                                    className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    Batal
                                </button>
                                <button
                                    onClick={handleCreateBackup}
                                    disabled={creating}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    {creating ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                                            Membuat...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="w-4 h-4" />
                                            Buat Backup
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Modal */}
            {
                deleteModal.open && deleteModal.backup && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700">
                            <h3 className="text-lg font-semibold text-slate-100 mb-2">Hapus Backup</h3>
                            <p className="text-sm text-slate-400 mb-4">
                                Hapus backup <strong className="text-slate-200">{deleteModal.backup.filename}</strong>?
                            </p>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Password Admin</label>
                                    <input
                                        type="password"
                                        value={adminPassword}
                                        onChange={(e) => setAdminPassword(e.target.value)}
                                        placeholder="Masukkan password Anda"
                                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => { setDeleteModal({ open: false, backup: null }); setAdminPassword(''); }}
                                    className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    Batal
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={!adminPassword}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
                                >
                                    Hapus
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Restore Modal */}
            {
                restoreModal.open && restoreModal.backup && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-red-500/50">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-red-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-red-400">Restore Database</h3>
                                    <p className="text-sm text-slate-400">Aksi ini tidak dapat dibatalkan!</p>
                                </div>
                            </div>

                            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-4">
                                <p className="text-sm text-red-300">
                                    <strong>PERINGATAN:</strong> Restore akan mengganti SEMUA data database saat ini dengan data dari backup <strong>{restoreModal.backup.filename}</strong>.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Password Admin</label>
                                    <input
                                        type="password"
                                        value={adminPassword}
                                        onChange={(e) => setAdminPassword(e.target.value)}
                                        placeholder="Masukkan password Anda"
                                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Ketik <span className="font-mono text-red-400">RESTORE DATABASE</span> untuk konfirmasi
                                    </label>
                                    <input
                                        type="text"
                                        value={confirmationText}
                                        onChange={(e) => setConfirmationText(e.target.value)}
                                        placeholder="RESTORE DATABASE"
                                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => {
                                        setRestoreModal({ open: false, backup: null });
                                        setAdminPassword('');
                                        setConfirmationText('');
                                    }}
                                    className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    Batal
                                </button>
                                <button
                                    onClick={handleRestore}
                                    disabled={!adminPassword || confirmationText !== 'RESTORE DATABASE'}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
                                >
                                    Restore Database
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
