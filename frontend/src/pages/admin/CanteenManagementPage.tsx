import { useState, useEffect, useCallback } from 'react';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, CANTEEN_EVENTS } from '../../contexts/SSEContext';
import { MapPin, Plus, Edit2, Trash2, Loader2, RefreshCw, Check, X, Building2, Users, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

interface Canteen {
    id: string;
    name: string;
    location: string | null;
    capacity: number | null;
    isActive: boolean;
    createdAt: string;
    _count?: {
        orders: number;
        preferredUsers: number;
    };
    canteenShifts?: Array<{
        id: string;
        capacity: number | null;
        shift: {
            id: string;
            name: string;
            startTime: string;
            endTime: string;
        };
    }>;
}

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
}

export default function CanteenManagementPage() {
    const [canteens, setCanteens] = useState<Canteen[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingCanteen, setEditingCanteen] = useState<Canteen | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        location: '',
        capacity: '',
        isActive: true,
        selectedShifts: [] as string[]
    });
    const [isSaving, setIsSaving] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [canteensRes, shiftsRes] = await Promise.all([
                api.get('/api/canteens?active=false'),
                api.get('/api/shifts')
            ]);
            setCanteens(canteensRes.data.canteens || []);
            setShifts(shiftsRes.data.shifts?.filter((s: Shift & { isActive: boolean }) => s.isActive) || []);
        } catch (error) {
            console.error('Failed to load canteens:', error);
            toast.error('Gagal memuat data kantin');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // SSE refresh on canteen events
    useSSERefresh(CANTEEN_EVENTS, loadData);

    const openAddModal = () => {
        setEditingCanteen(null);
        setFormData({
            name: '',
            location: '',
            capacity: '',
            isActive: true,
            selectedShifts: shifts.map(s => s.id) // Default: all shifts selected
        });
        setShowModal(true);
    };

    const openEditModal = (canteen: Canteen) => {
        setEditingCanteen(canteen);
        setFormData({
            name: canteen.name,
            location: canteen.location || '',
            capacity: canteen.capacity?.toString() || '',
            isActive: canteen.isActive,
            selectedShifts: canteen.canteenShifts?.map(cs => cs.shift.id) || shifts.map(s => s.id)
        });
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingCanteen(null);
    };

    const handleSave = async () => {
        if (!formData.name.trim()) {
            toast.error('Nama kantin harus diisi');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                name: formData.name.trim(),
                location: formData.location.trim() || null,
                capacity: formData.capacity ? parseInt(formData.capacity) : null,
                isActive: formData.isActive
            };

            if (editingCanteen) {
                await api.put(`/api/canteens/${editingCanteen.id}`, payload);
                // Update shift associations
                await api.post(`/api/canteens/${editingCanteen.id}/shifts`, {
                    shiftIds: formData.selectedShifts
                });
                toast.success('Kantin berhasil diperbarui');
            } else {
                const res = await api.post('/api/canteens', payload);
                // Set shift associations for new canteen
                await api.post(`/api/canteens/${res.data.canteen.id}/shifts`, {
                    shiftIds: formData.selectedShifts
                });
                toast.success('Kantin berhasil dibuat');
            }

            closeModal();
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal menyimpan kantin');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (canteen: Canteen) => {
        if (!confirm(`Nonaktifkan kantin "${canteen.name}"?`)) return;

        try {
            await api.delete(`/api/canteens/${canteen.id}`);
            toast.success('Kantin berhasil dinonaktifkan');
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal menghapus kantin');
        }
    };

    const toggleShift = (shiftId: string) => {
        setFormData(prev => ({
            ...prev,
            selectedShifts: prev.selectedShifts.includes(shiftId)
                ? prev.selectedShifts.filter(id => id !== shiftId)
                : [...prev.selectedShifts, shiftId]
        }));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10">
                        <MapPin className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Manajemen Kantin</h1>
                        <p className="text-slate-400 text-sm">Kelola lokasi kantin untuk pemesanan makanan</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={loadData} className="btn-secondary flex items-center gap-2">
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button onClick={openAddModal} className="btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Tambah Kantin
                    </button>
                </div>
            </div>

            {/* Loading State */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : (
                /* Canteen Cards */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {canteens.length === 0 ? (
                        <div className="col-span-full text-center py-12 text-slate-400">
                            <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>Belum ada kantin. Klik "Tambah Kantin" untuk membuat.</p>
                        </div>
                    ) : (
                        canteens.map(canteen => (
                            <div
                                key={canteen.id}
                                className={`card p-5 ${!canteen.isActive ? 'opacity-60' : ''}`}
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${canteen.isActive ? 'bg-primary/20' : 'bg-slate-600'}`}>
                                            <Building2 className={`w-5 h-5 ${canteen.isActive ? 'text-primary' : 'text-slate-400'}`} />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-white">{canteen.name}</h3>
                                            {canteen.location && (
                                                <p className="text-sm text-slate-400">{canteen.location}</p>
                                            )}
                                        </div>
                                    </div>
                                    <span className={`px-2 py-1 rounded-full text-xs ${canteen.isActive ? 'bg-success/20 text-success' : 'bg-slate-600 text-slate-400'}`}>
                                        {canteen.isActive ? 'Aktif' : 'Nonaktif'}
                                    </span>
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-2 gap-2 mb-4">
                                    <div className="bg-dark-lighter p-2 rounded-lg">
                                        <div className="flex items-center gap-1 text-slate-400 text-xs mb-1">
                                            <Users className="w-3 h-3" />
                                            <span>Pengguna</span>
                                        </div>
                                        <p className="text-lg font-semibold text-white">{canteen._count?.preferredUsers || 0}</p>
                                    </div>
                                    <div className="bg-dark-lighter p-2 rounded-lg">
                                        <div className="flex items-center gap-1 text-slate-400 text-xs mb-1">
                                            <Clock className="w-3 h-3" />
                                            <span>Kapasitas</span>
                                        </div>
                                        <p className="text-lg font-semibold text-white">
                                            {canteen.capacity ? `${canteen.capacity}/hari` : '∞'}
                                        </p>
                                    </div>
                                </div>

                                {/* Shifts */}
                                {canteen.canteenShifts && canteen.canteenShifts.length > 0 && (
                                    <div className="mb-4">
                                        <p className="text-xs text-slate-400 mb-2">Shift Tersedia:</p>
                                        <div className="flex flex-wrap gap-1">
                                            {canteen.canteenShifts.map(cs => (
                                                <span key={cs.id} className="px-2 py-0.5 bg-dark-lighter rounded text-xs text-slate-300">
                                                    {cs.shift.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => openEditModal(canteen)}
                                        className="flex-1 btn-secondary py-2 text-sm flex items-center justify-center gap-1"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                        Edit
                                    </button>
                                    {canteen.isActive && (
                                        <button
                                            onClick={() => handleDelete(canteen)}
                                            className="btn-secondary py-2 text-sm flex items-center justify-center gap-1 text-warning hover:bg-warning/20"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="card p-6 w-full max-w-md">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">
                                {editingCanteen ? 'Edit Kantin' : 'Tambah Kantin'}
                            </h2>
                            <button onClick={closeModal} className="btn-icon">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Name */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Nama Kantin *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                                    className="input-field"
                                    placeholder="Contoh: Kantin Gedung A"
                                />
                            </div>

                            {/* Location */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Lokasi (Opsional)</label>
                                <input
                                    type="text"
                                    value={formData.location}
                                    onChange={(e) => setFormData(f => ({ ...f, location: e.target.value }))}
                                    className="input-field"
                                    placeholder="Contoh: Lantai 1, Gedung Utama"
                                />
                            </div>

                            {/* Capacity */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Kapasitas Harian (Opsional)</label>
                                <input
                                    type="number"
                                    value={formData.capacity}
                                    onChange={(e) => setFormData(f => ({ ...f, capacity: e.target.value }))}
                                    className="input-field"
                                    placeholder="Kosongkan untuk unlimited"
                                    min="1"
                                />
                            </div>

                            {/* Shifts */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">Shift Tersedia</label>
                                <div className="flex flex-wrap gap-2">
                                    {shifts.map(shift => (
                                        <button
                                            key={shift.id}
                                            type="button"
                                            onClick={() => toggleShift(shift.id)}
                                            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 transition-colors ${formData.selectedShifts.includes(shift.id)
                                                ? 'bg-primary text-white'
                                                : 'bg-dark-lighter text-slate-400 hover:bg-dark-light'
                                                }`}
                                        >
                                            {formData.selectedShifts.includes(shift.id) && <Check className="w-3 h-3" />}
                                            {shift.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Active Status */}
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData(f => ({ ...f, isActive: e.target.checked }))}
                                        className="w-4 h-4 rounded border-slate-600 text-primary focus:ring-primary"
                                    />
                                    <span className="text-white">Aktif</span>
                                </label>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 mt-6">
                            <button onClick={closeModal} className="flex-1 btn-secondary">
                                Batal
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 btn-primary flex items-center justify-center gap-2"
                            >
                                {isSaving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Check className="w-4 h-4" />
                                )}
                                {editingCanteen ? 'Simpan' : 'Tambah'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
