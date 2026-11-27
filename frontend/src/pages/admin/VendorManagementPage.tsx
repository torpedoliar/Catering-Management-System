import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Store, Phone, Power, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, VENDOR_EVENTS } from '../../contexts/SSEContext';
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

interface Vendor {
    id: string;
    name: string;
    description: string | null;
    contact: string | null;
    logoUrl: string | null;
    isActive: boolean;
    _count: { menuItems: number };
}

export default function VendorManagementPage() {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
    const [formData, setFormData] = useState({ name: '', description: '', contact: '' });
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);

    const loadVendors = useCallback(async () => {
        try {
            const res = await api.get('/api/vendors?includeInactive=true');
            setVendors(res.data || []);
        } catch (error) {
            console.error('Load vendors error:', error);
            toast.error('Gagal memuat data vendor');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadVendors();
    }, [loadVendors]);

    useSSERefresh(VENDOR_EVENTS, loadVendors);

    const openModal = (vendor?: Vendor) => {
        if (vendor) {
            setEditingVendor(vendor);
            setFormData({
                name: vendor.name,
                description: vendor.description || '',
                contact: vendor.contact || '',
            });
        } else {
            setEditingVendor(null);
            setFormData({ name: '', description: '', contact: '' });
        }
        setLogoFile(null);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            toast.error('Nama vendor wajib diisi');
            return;
        }
        setSaving(true);
        try {
            const form = new FormData();
            form.append('name', formData.name.trim());
            form.append('description', formData.description.trim());
            form.append('contact', formData.contact.trim());
            if (logoFile) form.append('logo', logoFile);

            if (editingVendor) {
                await api.put(`/api/vendors/${editingVendor.id}`, form);
            } else {
                await api.post('/api/vendors', form);
            }

            setShowModal(false);
            toast.success(editingVendor ? 'Vendor diperbarui' : 'Vendor dibuat');
            loadVendors();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menyimpan vendor');
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (vendor: Vendor) => {
        try {
            const form = new FormData();
            form.append('isActive', (!vendor.isActive).toString());
            await api.put(`/api/vendors/${vendor.id}`, form);
            toast.success(vendor.isActive ? 'Vendor dinonaktifkan' : 'Vendor diaktifkan');
            loadVendors();
        } catch {
            toast.error('Gagal mengubah status vendor');
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await api.delete(`/api/vendors/${deleteTarget.id}`);
            toast.success('Vendor dihapus');
            setDeleteTarget(null);
            loadVendors();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menghapus vendor');
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-56" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-40" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title="Vendor katering"
                subtitle={`${vendors.length} penyedia hidangan terdaftar`}
                actions={
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => openModal()}
                        leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                        Tambah vendor
                    </Button>
                }
            />

            {vendors.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<Store className="w-6 h-6" />}
                        title="Belum ada vendor"
                        description="Tambahkan vendor katering pertama sebelum membuat katalog menu."
                        action={
                            <Button variant="primary" onClick={() => openModal()}>
                                Tambah vendor
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {vendors.map((vendor) => (
                        <Card key={vendor.id} className={!vendor.isActive ? 'opacity-65' : ''}>
                            <div className="flex items-start gap-3.5">
                                <div className="w-14 h-14 rounded-[12px] bg-[#fafaf9] border border-[#e7e5e4] flex items-center justify-center overflow-hidden flex-shrink-0">
                                    {vendor.logoUrl ? (
                                        <img
                                            src={vendor.logoUrl}
                                            alt={vendor.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <Store className="w-6 h-6 text-[#a8a29e]" aria-hidden="true" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <h3 className="text-[14.5px] font-bold text-[#1c1917] truncate">
                                            {vendor.name}
                                        </h3>
                                        <Badge variant={vendor.isActive ? 'success' : 'neutral'} dot={vendor.isActive}>
                                            {vendor.isActive ? 'Aktif' : 'Nonaktif'}
                                        </Badge>
                                    </div>
                                    {vendor.description && (
                                        <p className="text-[12.5px] text-[#57534e] mt-1 line-clamp-2">
                                            {vendor.description}
                                        </p>
                                    )}
                                    {vendor.contact && (
                                        <div className="text-[12px] text-[#78716c] mt-1.5 flex items-center gap-1">
                                            <Phone className="w-3 h-3" aria-hidden="true" />
                                            <span>{vendor.contact}</span>
                                        </div>
                                    )}
                                    <div className="text-[12px] font-semibold text-[#b45309] mt-2">
                                        {vendor._count.menuItems} hidangan
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-1.5 mt-4 pt-3 border-t border-[#f5f5f4]">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleActive(vendor)}
                                    aria-label={vendor.isActive ? `Nonaktifkan ${vendor.name}` : `Aktifkan ${vendor.name}`}
                                >
                                    <Power className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => openModal(vendor)}
                                    leftIcon={<Edit2 className="w-3.5 h-3.5" aria-hidden="true" />}
                                >
                                    Edit
                                </Button>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => setDeleteTarget(vendor)}
                                    aria-label={`Hapus ${vendor.name}`}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Add / Edit Vendor Modal */}
            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                title={editingVendor ? 'Edit vendor' : 'Tambah vendor baru'}
                size="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>
                            Batal
                        </Button>
                        <Button variant="primary" loading={saving} onClick={handleSubmit}>
                            Simpan
                        </Button>
                    </>
                }
            >
                <form onSubmit={handleSubmit} className="space-y-3">
                    <Field label="Nama vendor" required>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                            placeholder="Contoh: PT Rasa Nusantara"
                        />
                    </Field>
                    <Field label="Deskripsi">
                        <Textarea
                            rows={2}
                            value={formData.description}
                            onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                        />
                    </Field>
                    <Field label="Kontak">
                        <Input
                            value={formData.contact}
                            onChange={(e) => setFormData((f) => ({ ...f, contact: e.target.value }))}
                            placeholder="Telepon / Email"
                        />
                    </Field>
                    <Field label="Logo vendor">
                        <label className="flex items-center gap-2 px-3 py-2 border border-[#e7e5e4] rounded-[9px] cursor-pointer hover:bg-[#fafaf9] text-[13px] text-[#57534e]">
                            <ImageIcon className="w-4 h-4 text-[#78716c]" aria-hidden="true" />
                            <span className="truncate">{logoFile ? logoFile.name : 'Pilih gambar logo...'}</span>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                                className="hidden"
                            />
                        </label>
                    </Field>
                </form>
            </Modal>

            {/* Delete Confirm Modal */}
            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Hapus vendor?"
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
                    Hapus vendor <b>{deleteTarget?.name}</b>? Pastikan tidak ada menu aktif yang bergantung pada vendor ini.
                </p>
            </Modal>
        </div>
    );
}
