import { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Trash2, Edit2, Send, RefreshCw, Clock, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { formatDateTimeShortWIB } from '../../utils/timezone';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    Modal,
    Field,
    Input,
    Select,
    Textarea,
    EmptyState,
    Skeleton,
} from '../../components/ui';

interface Agreement {
    id: string;
    title: string;
    content: string;
    priority: string;
    isActive: boolean;
    expiresAt: string | null;
    createdAt: string;
    type: string;
    createdBy: {
        name: string;
        externalId: string;
    };
}

export default function UserAgreementPage() {
    const [agreements, setAgreements] = useState<Agreement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Agreement | null>(null);

    const [title, setTitle] = useState('Kebijakan Penggunaan Sistem');
    const [content, setContent] = useState('');
    const [priority, setPriority] = useState('high');
    const [expiresAt, setExpiresAt] = useState('');

    const loadAgreements = useCallback(async () => {
        try {
            const res = await api.get('/api/announcements');
            const allItems: Agreement[] = res.data.announcements || [];
            setAgreements(allItems.filter((item) => item.type === 'AGREEMENT'));
        } catch {
            toast.error('Gagal memuat User Agreement');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAgreements();
    }, [loadAgreements]);

    const resetForm = () => {
        setTitle('Kebijakan Penggunaan Sistem');
        setContent('');
        setPriority('high');
        setExpiresAt('');
        setEditingId(null);
        setShowForm(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) {
            toast.error('Judul dan isi kebijakan wajib diisi');
            return;
        }
        setIsSending(true);
        try {
            const payload = {
                title,
                content,
                priority,
                type: 'AGREEMENT',
                expiresAt: expiresAt || null,
            };
            if (editingId) {
                await api.put(`/api/announcements/${editingId}`, payload);
                toast.success('Kebijakan diperbarui');
            } else {
                await api.post('/api/announcements', payload);
                toast.success('Kebijakan dibuat');
            }
            resetForm();
            loadAgreements();
        } catch {
            toast.error('Gagal menyimpan kebijakan');
        } finally {
            setIsSending(false);
        }
    };

    const handleEdit = (a: Agreement) => {
        setTitle(a.title);
        setContent(a.content);
        setPriority(a.priority);
        setExpiresAt(a.expiresAt ? a.expiresAt.slice(0, 16) : '');
        setEditingId(a.id);
        setShowForm(true);
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await api.delete(`/api/announcements/${deleteTarget.id}`);
            toast.success('Kebijakan dihapus');
            setDeleteTarget(null);
            loadAgreements();
        } catch {
            toast.error('Gagal menghapus kebijakan');
        }
    };

    const handleToggleActive = async (id: string, currentActive: boolean) => {
        try {
            await api.put(`/api/announcements/${id}`, { isActive: !currentActive });
            toast.success(currentActive ? 'Kebijakan dinonaktifkan' : 'Kebijakan diaktifkan');
            loadAgreements();
        } catch {
            toast.error('Gagal mengubah status kebijakan');
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-56" />
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title="Ketentuan layanan (User Agreement)"
                subtitle="Kelola dokumen kebijakan penggunaan sistem yang tampil di halaman Syarat & Ketentuan"
                actions={
                    <>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={loadAgreements}
                            leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Muat ulang
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                                resetForm();
                                setShowForm(true);
                            }}
                            leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Buat ketentuan
                        </Button>
                    </>
                }
            />

            {agreements.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<FileText className="w-6 h-6" />}
                        title="Belum ada ketentuan layanan"
                        description="Buat kebijakan penggunaan agar tampil di aplikasi karyawan."
                        action={
                            <Button
                                variant="primary"
                                onClick={() => {
                                    resetForm();
                                    setShowForm(true);
                                }}
                            >
                                Buat ketentuan
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <div className="space-y-3">
                    {agreements.map((a) => (
                        <Card key={a.id} className={!a.isActive ? 'opacity-65' : ''}>
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="info">Kebijakan</Badge>
                                        <Badge variant={a.isActive ? 'success' : 'neutral'} dot={a.isActive}>
                                            {a.isActive ? 'Aktif' : 'Nonaktif'}
                                        </Badge>
                                    </div>
                                    <h3 className="text-[15px] font-bold text-[#1c1917]">{a.title}</h3>
                                    <p className="text-[13.5px] text-[#57534e] whitespace-pre-wrap leading-relaxed">
                                        {a.content}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#78716c] pt-1">
                                        <span className="inline-flex items-center gap-1">
                                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                            {formatDateTimeShortWIB(a.createdAt)}
                                        </span>
                                        <span>oleh {a.createdBy.name}</span>
                                        {a.expiresAt && (
                                            <span className="inline-flex items-center gap-1 text-[#b45309]">
                                                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                                                Berakhir: {formatDateTimeShortWIB(a.expiresAt)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleToggleActive(a.id, a.isActive)}
                                    >
                                        {a.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEdit(a)}
                                        aria-label={`Edit ${a.title}`}
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setDeleteTarget(a)}
                                        aria-label={`Hapus ${a.title}`}
                                    >
                                        <Trash2 className="w-3.5 h-3.5 text-[#b91c1c]" />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Modal
                open={showForm}
                onClose={resetForm}
                title={editingId ? 'Edit ketentuan layanan' : 'Buat ketentuan layanan'}
                size="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={resetForm}>
                            Batal
                        </Button>
                        <Button
                            variant="primary"
                            loading={isSending}
                            onClick={handleSubmit}
                            leftIcon={<Send className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Simpan
                        </Button>
                    </>
                }
            >
                <form onSubmit={handleSubmit} className="space-y-3">
                    <Field label="Judul kebijakan" required>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                    </Field>
                    <Field label="Isi kebijakan" required>
                        <Textarea
                            rows={6}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Tuliskan isi ketentuan layanan..."
                        />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Prioritas">
                            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                                <option value="normal">Normal</option>
                                <option value="high">Tinggi</option>
                                <option value="urgent">Penting</option>
                            </Select>
                        </Field>
                        <Field label="Kadaluarsa" hint="Opsional">
                            <Input
                                type="datetime-local"
                                value={expiresAt}
                                onChange={(e) => setExpiresAt(e.target.value)}
                            />
                        </Field>
                    </div>
                </form>
            </Modal>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Hapus ketentuan layanan?"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                            Batal
                        </Button>
                        <Button variant="danger" onClick={confirmDelete}>
                            Hapus
                        </Button>
                    </>
                }
            >
                <p className="text-[13.5px] text-[#57534e]">
                    Hapus <b>{deleteTarget?.title}</b>?
                </p>
            </Modal>
        </div>
    );
}
