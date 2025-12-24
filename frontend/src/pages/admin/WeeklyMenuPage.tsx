import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Copy, Trash2, Pizza, Store, Plus, Edit2, Image, X } from 'lucide-react';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, VENDOR_EVENTS, MENU_EVENTS } from '../../contexts/SSEContext';
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
    vendor: Vendor;
    vendorId: string;
}

interface DayMenu {
    id: string;
    menuMode: string;
    shiftId: string | null;
    shiftName: string | null;
    notes: string | null;
    menuItem: MenuItem;
}

interface DailyMenuData {
    date: string;
    dayOfWeek: number;
    dayName: string;
    menus: DayMenu[];
}

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
}

const categories = ['Nasi', 'Mie', 'Lauk', 'Sayur', 'Buah', 'Minuman', 'Snack', 'Lainnya'];

export default function WeeklyMenuPage() {
    const [weekData, setWeekData] = useState<{ week: number; year: number; weekStart: string; weekEnd: string; shifts: Shift[]; dailyMenus: DailyMenuData[] } | null>(null);
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedWeek, setSelectedWeek] = useState<{ week: number; year: number } | null>(null);
    const [showMenuSelector, setShowMenuSelector] = useState<{ dayOfWeek: number; shiftId: string | null } | null>(null);
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [copyTarget, setCopyTarget] = useState({ week: 1, year: 2025 });
    const [menuMode, setMenuMode] = useState<'SAME_ALL_SHIFTS' | 'DIFFERENT_PER_SHIFT'>('SAME_ALL_SHIFTS');

    // Menu item form state
    const [showMenuItemForm, setShowMenuItemForm] = useState(false);
    const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
    const [menuItemForm, setMenuItemForm] = useState({ name: '', description: '', category: '', vendorId: '' });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [savingMenuItem, setSavingMenuItem] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const weekParam = selectedWeek ? `?week=${selectedWeek.week}&year=${selectedWeek.year}` : '';
            const [weekRes, menuRes, vendorRes] = await Promise.all([
                api.get(`/api/weekly-menu${weekParam}`),
                api.get('/api/menu-items'),
                api.get('/api/vendors')
            ]);

            if (weekRes.data) {
                setWeekData(weekRes.data);
                if (!selectedWeek) {
                    setSelectedWeek({ week: weekRes.data.week, year: weekRes.data.year });
                    setCopyTarget({ week: weekRes.data.week + 1, year: weekRes.data.year });
                }
            }
            setMenuItems(menuRes.data || []);
            setVendors(vendorRes.data || []);
        } catch (error) {
            console.error('Load data error:', error);
            toast.error('Gagal memuat data');
        } finally {
            setLoading(false);
        }
    }, [selectedWeek]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // SSE integration for real-time updates
    useSSERefresh([...VENDOR_EVENTS, ...MENU_EVENTS], loadData);

    const navigateWeek = (direction: number) => {
        if (!selectedWeek) return;
        let newWeek = selectedWeek.week + direction;
        let newYear = selectedWeek.year;

        if (newWeek < 1) {
            newWeek = 52;
            newYear--;
        } else if (newWeek > 52) {
            newWeek = 1;
            newYear++;
        }

        setSelectedWeek({ week: newWeek, year: newYear });
    };

    const setMenu = async (dayOfWeek: number, shiftId: string | null, menuItemId: string) => {
        if (!selectedWeek) return;

        try {
            await api.post('/api/weekly-menu', {
                weekNumber: selectedWeek.week,
                year: selectedWeek.year,
                dayOfWeek,
                shiftId: menuMode === 'DIFFERENT_PER_SHIFT' ? shiftId : null,
                menuMode,
                menuItemId
            });
            setShowMenuSelector(null);
            toast.success('Menu berhasil ditambahkan');
            loadData();
        } catch (error) {
            console.error('Set menu error:', error);
            toast.error('Gagal menambahkan menu');
        }
    };

    const deleteMenu = async (menuId: string) => {
        if (!confirm('Hapus menu ini?')) return;

        try {
            await api.delete(`/api/weekly-menu/${menuId}`);
            toast.success('Menu dihapus');
            loadData();
        } catch (error) {
            console.error('Delete menu error:', error);
            toast.error('Gagal menghapus menu');
        }
    };

    const copyWeek = async () => {
        if (!selectedWeek) return;

        try {
            const res = await api.post('/api/weekly-menu/copy', {
                fromWeek: selectedWeek.week,
                fromYear: selectedWeek.year,
                toWeek: copyTarget.week,
                toYear: copyTarget.year
            });
            toast.success(res.data?.message || 'Menu berhasil dicopy');
            setShowCopyModal(false);
        } catch (error: any) {
            console.error('Copy week error:', error);
            toast.error(error.response?.data?.error || 'Gagal copy menu');
        }
    };

    // Menu Item CRUD
    const openMenuItemForm = (item?: MenuItem) => {
        if (item) {
            setEditingMenuItem(item);
            setMenuItemForm({
                name: item.name,
                description: item.description || '',
                category: item.category || '',
                vendorId: item.vendorId
            });
        } else {
            setEditingMenuItem(null);
            setMenuItemForm({ name: '', description: '', category: '', vendorId: vendors[0]?.id || '' });
        }
        setImageFile(null);
        setShowMenuItemForm(true);
    };

    const saveMenuItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!menuItemForm.name.trim() || !menuItemForm.vendorId) {
            toast.error('Nama dan Vendor wajib diisi');
            return;
        }

        setSavingMenuItem(true);
        try {
            const form = new FormData();
            form.append('name', menuItemForm.name.trim());
            form.append('description', menuItemForm.description.trim());
            form.append('category', menuItemForm.category);
            form.append('vendorId', menuItemForm.vendorId);
            if (imageFile) form.append('image', imageFile);

            if (editingMenuItem) {
                await api.put(`/api/menu-items/${editingMenuItem.id}`, form);
                toast.success('Menu berhasil diperbarui');
            } else {
                await api.post('/api/menu-items', form);
                toast.success('Menu berhasil dibuat');
            }

            setShowMenuItemForm(false);
            loadData();
        } catch (error: any) {
            console.error('Save menu item error:', error);
            toast.error(error.response?.data?.error || 'Gagal menyimpan menu');
        } finally {
            setSavingMenuItem(false);
        }
    };

    const deleteMenuItem = async (item: MenuItem) => {
        if (!confirm(`Hapus menu "${item.name}"? Menu yang sudah dijadwalkan juga akan terhapus.`)) return;

        try {
            await api.delete(`/api/menu-items/${item.id}`);
            toast.success('Menu berhasil dihapus');
            loadData();
        } catch (error: any) {
            console.error('Delete menu item error:', error);
            toast.error(error.response?.data?.error || 'Gagal menghapus menu');
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    };

    if (loading && !weekData) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Menu Mingguan</h1>
                    <p className="text-slate-500">Atur menu makanan per minggu</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => openMenuItemForm()} className="btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Tambah Menu Baru
                    </button>
                    <button onClick={() => setShowCopyModal(true)} className="btn-secondary flex items-center gap-2">
                        <Copy className="w-4 h-4" />
                        Copy Minggu
                    </button>
                </div>
            </div>

            {/* Check vendors */}
            {vendors.length === 0 && (
                <div className="card p-6 text-center">
                    <Store className="w-12 h-12 mx-auto mb-4 text-amber-400" />
                    <p className="text-slate-600 font-medium">Belum ada vendor</p>
                    <p className="text-sm text-slate-400 mt-1">Buat vendor terlebih dahulu sebelum membuat menu</p>
                    <a href="/admin/vendors" className="inline-block mt-4 btn-primary">
                        Buat Vendor
                    </a>
                </div>
            )}

            {vendors.length > 0 && (
                <>
                    {/* Week Navigator */}
                    <div className="card p-4">
                        <div className="flex items-center justify-between">
                            <button onClick={() => navigateWeek(-1)} className="p-2 rounded-lg hover:bg-slate-100">
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <div className="text-center">
                                <p className="font-semibold text-slate-800">Week {selectedWeek?.week}, {selectedWeek?.year}</p>
                                {weekData && (
                                    <p className="text-sm text-slate-500">{formatDate(weekData.weekStart)} - {formatDate(weekData.weekEnd)}</p>
                                )}
                            </div>
                            <button onClick={() => navigateWeek(1)} className="p-2 rounded-lg hover:bg-slate-100">
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Mode Toggle */}
                        <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-slate-100">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={menuMode === 'SAME_ALL_SHIFTS'}
                                    onChange={() => setMenuMode('SAME_ALL_SHIFTS')}
                                    className="text-teal-600"
                                />
                                <span className="text-sm text-slate-600">Menu Sama Semua Shift</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={menuMode === 'DIFFERENT_PER_SHIFT'}
                                    onChange={() => setMenuMode('DIFFERENT_PER_SHIFT')}
                                    className="text-teal-600"
                                />
                                <span className="text-sm text-slate-600">Menu Berbeda Per Shift</span>
                            </label>
                        </div>
                    </div>

                    {/* Calendar Grid */}
                    {weekData && (
                        <div className="card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50">
                                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">
                                                {menuMode === 'DIFFERENT_PER_SHIFT' ? 'Shift' : 'Hari'}
                                            </th>
                                            {weekData.dailyMenus.map(day => (
                                                <th key={day.date} className="text-center px-2 py-3 min-w-[120px]">
                                                    <div className="text-xs font-semibold text-slate-600">{day.dayName}</div>
                                                    <div className="text-xs text-slate-400">{formatDate(day.date)}</div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {menuMode === 'SAME_ALL_SHIFTS' ? (
                                            <tr className="border-t border-slate-100">
                                                <td className="px-4 py-3 text-sm font-medium text-slate-700">Menu</td>
                                                {weekData.dailyMenus.map(day => {
                                                    const menu = day.menus.find(m => !m.shiftId);
                                                    return (
                                                        <td key={day.date} className="px-2 py-3">
                                                            {menu ? (
                                                                <div className="bg-slate-50 rounded-lg p-2 relative group">
                                                                    {menu.menuItem.imageUrl && (
                                                                        <img src={menu.menuItem.imageUrl} alt="" className="w-full h-16 object-cover rounded mb-2" />
                                                                    )}
                                                                    <p className="text-xs font-medium text-slate-800 line-clamp-2">{menu.menuItem.name}</p>
                                                                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                                                                        <Store className="w-2.5 h-2.5" />
                                                                        {menu.menuItem.vendor.name}
                                                                    </p>
                                                                    <button
                                                                        onClick={() => deleteMenu(menu.id)}
                                                                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    >
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => setShowMenuSelector({ dayOfWeek: day.dayOfWeek, shiftId: null })}
                                                                    className="w-full h-20 border-2 border-dashed border-slate-200 rounded-lg hover:border-teal-400 hover:bg-teal-50/50 transition-colors flex items-center justify-center"
                                                                >
                                                                    <Pizza className="w-5 h-5 text-slate-300" />
                                                                </button>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ) : (
                                            weekData.shifts.map(shift => (
                                                <tr key={shift.id} className="border-t border-slate-100">
                                                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{shift.name}</td>
                                                    {weekData.dailyMenus.map(day => {
                                                        const menu = day.menus.find(m => m.shiftId === shift.id);
                                                        return (
                                                            <td key={`${day.date}-${shift.id}`} className="px-2 py-3">
                                                                {menu ? (
                                                                    <div className="bg-slate-50 rounded-lg p-2 relative group">
                                                                        <p className="text-xs font-medium text-slate-800 line-clamp-2">{menu.menuItem.name}</p>
                                                                        <p className="text-[10px] text-slate-400">{menu.menuItem.vendor.name}</p>
                                                                        <button
                                                                            onClick={() => deleteMenu(menu.id)}
                                                                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                                        >
                                                                            <Trash2 className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => setShowMenuSelector({ dayOfWeek: day.dayOfWeek, shiftId: shift.id })}
                                                                        className="w-full h-12 border-2 border-dashed border-slate-200 rounded-lg hover:border-teal-400 hover:bg-teal-50/50 transition-colors flex items-center justify-center"
                                                                    >
                                                                        <Pizza className="w-4 h-4 text-slate-300" />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Menu Item List */}
                    <div className="card p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold text-slate-800">Daftar Menu</h2>
                            <span className="text-sm text-slate-400">{menuItems.length} menu</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {menuItems.map(item => (
                                <div key={item.id} className="relative group">
                                    <div className="bg-slate-50 rounded-lg p-2">
                                        {item.imageUrl ? (
                                            <img src={item.imageUrl} alt={item.name} className="w-full h-16 object-cover rounded mb-2" />
                                        ) : (
                                            <div className="w-full h-16 bg-slate-200 rounded mb-2 flex items-center justify-center">
                                                <Pizza className="w-6 h-6 text-slate-400" />
                                            </div>
                                        )}
                                        <p className="text-xs font-medium text-slate-800 line-clamp-1">{item.name}</p>
                                        <p className="text-[10px] text-slate-400">{item.vendor.name}</p>
                                    </div>
                                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => openMenuItemForm(item)}
                                            className="p-1 bg-blue-500 text-white rounded"
                                        >
                                            <Edit2 className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => deleteMenuItem(item)}
                                            className="p-1 bg-red-500 text-white rounded"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {menuItems.length === 0 && (
                                <div className="col-span-full text-center py-8 text-slate-400">
                                    <Pizza className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">Belum ada menu, klik "Tambah Menu Baru"</p>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Menu Selector Modal */}
            {showMenuSelector && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-800">Pilih Menu</h2>
                            <button onClick={() => setShowMenuSelector(null)} className="p-1 rounded hover:bg-slate-100">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto max-h-[60vh]">
                            {menuItems.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {menuItems.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => setMenu(showMenuSelector.dayOfWeek, showMenuSelector.shiftId, item.id)}
                                            className="p-3 border border-slate-200 rounded-xl hover:border-teal-400 hover:bg-teal-50 transition-colors text-left"
                                        >
                                            {item.imageUrl ? (
                                                <img src={item.imageUrl} alt="" className="w-full h-20 object-cover rounded-lg mb-2" />
                                            ) : (
                                                <div className="w-full h-20 bg-slate-100 rounded-lg mb-2 flex items-center justify-center">
                                                    <Pizza className="w-8 h-8 text-slate-300" />
                                                </div>
                                            )}
                                            <p className="text-sm font-medium text-slate-800 line-clamp-2">{item.name}</p>
                                            <p className="text-xs text-slate-400 mt-1">{item.vendor.name}</p>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <Pizza className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                                    <p className="text-slate-500">Belum ada menu</p>
                                    <button onClick={() => { setShowMenuSelector(null); openMenuItemForm(); }} className="mt-4 btn-primary">
                                        Tambah Menu Baru
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-100">
                            <button onClick={() => setShowMenuSelector(null)} className="w-full btn-secondary">
                                Batal
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Menu Item Form Modal */}
            {showMenuItemForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6">
                        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Pizza className="w-5 h-5 text-teal-500" />
                            {editingMenuItem ? 'Edit Menu' : 'Tambah Menu Baru'}
                        </h2>
                        <form onSubmit={saveMenuItem} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-500 mb-1">Nama Menu *</label>
                                <input
                                    type="text"
                                    value={menuItemForm.name}
                                    onChange={e => setMenuItemForm(f => ({ ...f, name: e.target.value }))}
                                    className="input-field"
                                    placeholder="Contoh: Nasi Goreng Spesial"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-500 mb-1">Vendor *</label>
                                <select
                                    value={menuItemForm.vendorId}
                                    onChange={e => setMenuItemForm(f => ({ ...f, vendorId: e.target.value }))}
                                    className="input-field"
                                    required
                                >
                                    <option value="">Pilih Vendor</option>
                                    {vendors.map(v => (
                                        <option key={v.id} value={v.id}>{v.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-500 mb-1">Kategori</label>
                                <select
                                    value={menuItemForm.category}
                                    onChange={e => setMenuItemForm(f => ({ ...f, category: e.target.value }))}
                                    className="input-field"
                                >
                                    <option value="">Pilih Kategori</option>
                                    {categories.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-500 mb-1">Deskripsi</label>
                                <textarea
                                    value={menuItemForm.description}
                                    onChange={e => setMenuItemForm(f => ({ ...f, description: e.target.value }))}
                                    className="input-field"
                                    rows={2}
                                    placeholder="Deskripsi singkat menu"
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
                                <button type="button" onClick={() => setShowMenuItemForm(false)} className="btn-secondary">
                                    Batal
                                </button>
                                <button type="submit" disabled={savingMenuItem} className="btn-primary">
                                    {savingMenuItem ? 'Menyimpan...' : 'Simpan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Copy Modal */}
            {showCopyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm p-6">
                        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <Copy className="w-5 h-5" />
                            Copy ke Minggu Lain
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-500 mb-1">Target Week</label>
                                <input
                                    type="number"
                                    value={copyTarget.week}
                                    onChange={e => setCopyTarget(t => ({ ...t, week: parseInt(e.target.value) || 1 }))}
                                    className="input-field"
                                    min={1}
                                    max={53}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-500 mb-1">Target Year</label>
                                <input
                                    type="number"
                                    value={copyTarget.year}
                                    onChange={e => setCopyTarget(t => ({ ...t, year: parseInt(e.target.value) || 2025 }))}
                                    className="input-field"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowCopyModal(false)} className="btn-secondary">Batal</button>
                            <button onClick={copyWeek} className="btn-primary">Copy</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
