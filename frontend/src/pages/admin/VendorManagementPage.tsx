import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Store, Phone, Check, X, Image } from 'lucide-react';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, VENDOR_EVENTS } from '../../contexts/SSEContext';
import toast from 'react-hot-toast';

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
    const [formData, setFormData] = useState({ name: '', description: '', contact: '' });
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadVendors();
    }, []);

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

    // SSE integration for real-time updates
    useSSERefresh(VENDOR_EVENTS, loadVendors);

    const openModal = (vendor?: Vendor) => {
        if (vendor) {
            setEditingVendor(vendor);
            setFormData({
                name: vendor.name,
                description: vendor.description || '',
                contact: vendor.contact || ''
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
        if (!formData.name.trim()) return;

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
            toast.success(editingVendor ? 'Vendor berhasil diperbarui' : 'Vendor berhasil dibuat');
            loadVendors();
        } catch (error: any) {
            console.error('Save vendor error:', error);
            toast.error(error.response?.data?.error || 'Gagal menyimpan vendor');
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
        } catch (error) {
            console.error('Toggle active error:', error);
            toast.error('Gagal mengubah status vendor');
        }
    };

    const deleteVendor = async (vendor: Vendor) => {
        if (!confirm(`Hapus vendor "${vendor.name}"?`)) return;

        try {
            await api.delete(`/api/vendors/${vendor.id}`);
            toast.success('Vendor berhasil dihapus');
            loadVendors();
        } catch (error: any) {
            console.error('Delete vendor error:', error);
            toast.error(error.response?.data?.error || 'Gagal menghapus vendor');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Manajemen Vendor</h1>
                    <p className="text-slate-500">Kelola vendor penyedia makanan</p>
                </div>
                <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Tambah Vendor
                </button>
            </div>

            {/* Vendor Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vendors.map(vendor => (
                    <div key={vendor.id} className={`card p-4 ${!vendor.isActive ? 'opacity-60' : ''}`}>
                        <div className="flex items-start gap-4">
                            <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                {vendor.logoUrl ? (
                                    <img src={vendor.logoUrl} alt={vendor.name} className="w-full h-full object-cover" />
                                ) : (
                                    <Store className="w-8 h-8 text-slate-400" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-slate-800 truncate">{vendor.name}</h3>
                                    {!vendor.isActive && (
                                        <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-600">Nonaktif</span>
                                    )}
                                </div>
                                {vendor.description && (
                                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{vendor.description}</p>
                                )}
                                {vendor.contact && (
                                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                        <Phone className="w-3 h-3" />
                                        {vendor.contact}
                                    </p>
                                )}
                                <p className="text-xs text-teal-600 mt-2">{vendor._count.menuItems} menu items</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-slate-100">
                            <button
                                onClick={() => toggleActive(vendor)}
                                className={`p-2 rounded-lg transition-colors ${vendor.isActive ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-50'}`}
                                title={vendor.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                            >
                                {vendor.isActive ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                            </button>
                            <button onClick={() => openModal(vendor)} className="p-2 rounded-lg text-blue-600 hover:bg-blue-50" title="Edit">
                                <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteVendor(vendor)} className="p-2 rounded-lg text-red-600 hover:bg-red-50" title="Hapus">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {vendors.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                    <Store className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>Belum ada vendor</p>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">
                            {editingVendor ? 'Edit Vendor' : 'Tambah Vendor'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-500 mb-1">Nama Vendor *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                                    className="input-field"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-500 mb-1">Deskripsi</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                                    className="input-field"
                                    rows={3}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-500 mb-1">Kontak</label>
                                <input
                                    type="text"
                                    value={formData.contact}
                                    onChange={e => setFormData(f => ({ ...f, contact: e.target.value }))}
                                    className="input-field"
                                    placeholder="Telepon / Email"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-500 mb-1">Logo</label>
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                                        <Image className="w-4 h-4 text-slate-400" />
                                        <span className="text-sm text-slate-600">{logoFile ? logoFile.name : 'Pilih Gambar'}</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={e => setLogoFile(e.target.files?.[0] || null)}
                                            className="hidden"
                                        />
                                    </label>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                                    Batal
                                </button>
                                <button type="submit" disabled={saving} className="btn-primary">
                                    {saving ? 'Menyimpan...' : 'Simpan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
