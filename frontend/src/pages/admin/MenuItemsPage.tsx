import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Pizza, Store, Image, Check, X, Filter } from 'lucide-react';
import { api } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

interface Vendor {
    id: string;
    name: string;
    logoUrl: string | null;
}

interface MenuItem {
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    category: string | null;
    vendorId: string;
    isActive: boolean;
    vendor: Vendor;
}

export default function MenuItemsPage() {
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
    const [formData, setFormData] = useState({ name: '', description: '', category: '', vendorId: '' });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [filterVendor, setFilterVendor] = useState('');
    const [filterCategory, setFilterCategory] = useState('');

    const categories = ['Nasi', 'Mie', 'Lauk', 'Sayur', 'Buah', 'Minuman', 'Snack', 'Lainnya'];

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [menuRes, vendorRes] = await Promise.all([
                api.get('/api/menu-items?includeInactive=true'),
                api.get('/api/vendors')
            ]);
            setMenuItems(menuRes.data || []);
            setVendors(vendorRes.data || []);
        } catch (error) {
            console.error('Load data error:', error);
            toast.error('Gagal memuat data');
        } finally {
            setLoading(false);
        }
    };

    const openModal = (item?: MenuItem) => {
        if (item) {
            setEditingItem(item);
            setFormData({
                name: item.name,
                description: item.description || '',
                category: item.category || '',
                vendorId: item.vendorId
            });
        } else {
            setEditingItem(null);
            setFormData({ name: '', description: '', category: '', vendorId: vendors[0]?.id || '' });
        }
        setImageFile(null);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim() || !formData.vendorId) return;

        setSaving(true);
        try {
            const form = new FormData();
            form.append('name', formData.name.trim());
            form.append('description', formData.description.trim());
            form.append('category', formData.category);
            form.append('vendorId', formData.vendorId);
            if (imageFile) form.append('image', imageFile);

            if (editingItem) {
                await api.put(`/api/menu-items/${editingItem.id}`, form);
            } else {
                await api.post('/api/menu-items', form);
            }

            setShowModal(false);
            toast.success(editingItem ? 'Menu berhasil diperbarui' : 'Menu berhasil dibuat');
            loadData();
        } catch (error: any) {
            console.error('Save menu item error:', error);
            toast.error(error.response?.data?.error || 'Gagal menyimpan menu');
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (item: MenuItem) => {
        try {
            const form = new FormData();
            form.append('isActive', (!item.isActive).toString());

            await api.put(`/api/menu-items/${item.id}`, form);
            toast.success(item.isActive ? 'Menu dinonaktifkan' : 'Menu diaktifkan');
            loadData();
        } catch (error) {
            console.error('Toggle active error:', error);
            toast.error('Gagal mengubah status');
        }
    };

    const deleteItem = async (item: MenuItem) => {
        if (!confirm(`Hapus menu "${item.name}"?`)) return;

        try {
            await api.delete(`/api/menu-items/${item.id}`);
            toast.success('Menu berhasil dihapus');
            loadData();
        } catch (error: any) {
            console.error('Delete menu item error:', error);
            toast.error(error.response?.data?.error || 'Gagal menghapus menu');
        }
    };

    const filteredItems = menuItems.filter(item => {
        if (filterVendor && item.vendorId !== filterVendor) return false;
        if (filterCategory && item.category !== filterCategory) return false;
        return true;
    });

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
                    <h1 className="text-2xl font-bold text-slate-800">Menu Items</h1>
                    <p className="text-slate-500">Kelola item menu makanan</p>
                </div>
                <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Tambah Menu
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                        value={filterVendor}
                        onChange={e => setFilterVendor(e.target.value)}
                        className="input-field py-2 min-w-[150px]"
                    >
                        <option value="">Semua Vendor</option>
                        {vendors.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                    </select>
                </div>
                <select
                    value={filterCategory}
                    onChange={e => setFilterCategory(e.target.value)}
                    className="input-field py-2 min-w-[150px]"
                >
                    <option value="">Semua Kategori</option>
                    {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            </div>

            {/* Menu Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredItems.map(item => (
                    <div key={item.id} className={`card overflow-hidden ${!item.isActive ? 'opacity-60' : ''}`}>
                        <div className="h-40 bg-slate-100 flex items-center justify-center">
                            {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                                <Pizza className="w-12 h-12 text-slate-300" />
                            )}
                        </div>
                        <div className="p-4">
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="font-semibold text-slate-800 line-clamp-1">{item.name}</h3>
                                {!item.isActive && (
                                    <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-600 flex-shrink-0">Nonaktif</span>
                                )}
                            </div>
                            {item.category && (
                                <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs bg-teal-100 text-teal-700">
                                    {item.category}
                                </span>
                            )}
                            {item.description && (
                                <p className="text-sm text-slate-500 mt-2 line-clamp-2">{item.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-3 text-xs text-slate-400">
                                <Store className="w-3 h-3" />
                                {item.vendor.name}
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100">
                            <button
                                onClick={() => toggleActive(item)}
                                className={`p-2 rounded-lg transition-colors ${item.isActive ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-50'}`}
                            >
                                {item.isActive ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                            </button>
                            <button onClick={() => openModal(item)} className="p-2 rounded-lg text-blue-600 hover:bg-blue-50">
                                <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteItem(item)} className="p-2 rounded-lg text-red-600 hover:bg-red-50">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {filteredItems.length === 0 && vendors.length > 0 && (
                <div className="text-center py-12 text-slate-500">
                    <Pizza className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>Belum ada menu item</p>
                </div>
            )}

            {vendors.length === 0 && (
                <div className="text-center py-12">
                    <Store className="w-12 h-12 mx-auto mb-4 text-amber-400" />
                    <p className="text-slate-600 font-medium">Belum ada vendor</p>
                    <p className="text-sm text-slate-400 mt-1">Buat vendor terlebih dahulu sebelum menambahkan menu item</p>
                    <a href="/admin/vendors" className="inline-block mt-4 btn-primary">
                        Buat Vendor
                    </a>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">
                            {editingItem ? 'Edit Menu' : 'Tambah Menu'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-500 mb-1">Nama Menu *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                                    className="input-field"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-500 mb-1">Vendor *</label>
                                <select
                                    value={formData.vendorId}
                                    onChange={e => setFormData(f => ({ ...f, vendorId: e.target.value }))}
                                    className="input-field"
                                    required
                                >
                                    <option value="">Pilih Vendor</option>
                                    {vendors.map(v => (
                                        <option key={v.id} value={v.id}>{v.name}</option>
                                    ))}
                                </select>
                            </div>
                            {/* Category field removed - v1.6.3 */}
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
                                <label className="block text-sm text-slate-500 mb-1">Foto</label>
                                <label className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                                    <Image className="w-4 h-4 text-slate-400" />
                                    <span className="text-sm text-slate-600">{imageFile ? imageFile.name : 'Pilih Gambar'}</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={e => setImageFile(e.target.files?.[0] || null)}
                                        className="hidden"
                                    />
                                </label>
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
