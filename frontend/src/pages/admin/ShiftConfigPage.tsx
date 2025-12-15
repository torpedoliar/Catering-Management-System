import { useState, useEffect, useCallback } from 'react';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, SHIFT_EVENTS, SETTINGS_EVENTS } from '../../contexts/SSEContext';
import { Clock, Save, Loader2, Plus, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import TimeInput from '../../components/TimeInput';


interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    mealPrice: number;
    isActive: boolean;
}

interface Settings {
    cutoffHours: number;
    blacklistStrikes: number;
    blacklistDuration: number;
    maxOrderDaysAhead: number;
}

export default function ShiftConfigPage() {
    const [originalShifts, setOriginalShifts] = useState<Shift[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [newShift, setNewShift] = useState({ name: '', startTime: '', endTime: '', mealPrice: 25000 });
    const [showAddForm, setShowAddForm] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [shiftsRes, settingsRes] = await Promise.all([
                api.get('/api/shifts?includeInactive=true'),
                api.get('/api/settings'),
            ]);
            setShifts(shiftsRes.data.shifts);
            setOriginalShifts(shiftsRes.data.shifts);
            setSettings(settingsRes.data);
            setOriginalSettings(settingsRes.data);
        } catch (error) {
            console.error('Failed to load config:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Auto-refresh on shift or settings events (SSE)
    useSSERefresh([...SHIFT_EVENTS, ...SETTINGS_EVENTS], loadData);

    // Check for changes whenever shifts or settings change
    useEffect(() => {
        const shiftsChanged = JSON.stringify(shifts) !== JSON.stringify(originalShifts);
        const settingsChanged = JSON.stringify(settings) !== JSON.stringify(originalSettings);
        setHasChanges(shiftsChanged || settingsChanged);
    }, [shifts, settings, originalShifts, originalSettings]);

    // Update shift in local state only (not database)
    const updateShiftLocal = (id: string, data: Partial<Shift>) => {
        setShifts(prevShifts =>
            prevShifts.map(shift =>
                shift.id === id ? { ...shift, ...data } : shift
            )
        );
    };

    // Reset all changes
    const resetChanges = () => {
        setShifts([...originalShifts]);
        setSettings(originalSettings ? { ...originalSettings } : null);
        toast.success('Perubahan direset');
    };

    // Save all changes to database
    const saveAllChanges = async () => {
        setIsSaving(true);
        try {
            // Find shifts that changed
            const changedShifts = shifts.filter((shift, index) => {
                const original = originalShifts.find(s => s.id === shift.id);
                return JSON.stringify(shift) !== JSON.stringify(original);
            });

            // Update each changed shift
            for (const shift of changedShifts) {
                await api.put(`/api/shifts/${shift.id}`, {
                    name: shift.name,
                    startTime: shift.startTime,
                    endTime: shift.endTime,
                    mealPrice: shift.mealPrice,
                    isActive: shift.isActive
                });
            }

            // Save settings if changed
            if (settings && JSON.stringify(settings) !== JSON.stringify(originalSettings)) {
                await api.put('/api/settings', settings);
            }

            toast.success('Semua perubahan berhasil disimpan');

            // Reload data to get fresh state
            await loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal menyimpan perubahan');
        } finally {
            setIsSaving(false);
        }
    };

    const createShift = async () => {
        if (!newShift.name || !newShift.startTime || !newShift.endTime) {
            toast.error('Harap isi semua field');
            return;
        }

        try {
            await api.post('/api/shifts', {
                ...newShift,
                mealPrice: newShift.mealPrice || 25000
            });
            toast.success('Shift berhasil dibuat');
            setNewShift({ name: '', startTime: '', endTime: '', mealPrice: 25000 });
            setShowAddForm(false);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal membuat shift');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[#1a1f37]">Konfigurasi Shift</h1>
                    <p className="text-slate-500">Atur shift makan dan waktu cutoff</p>
                </div>
                {hasChanges && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={resetChanges}
                            className="btn-secondary flex items-center gap-2"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Reset
                        </button>
                        <button
                            onClick={saveAllChanges}
                            disabled={isSaving}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-colors disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Simpan Semua
                        </button>
                    </div>
                )}
            </div>

            {/* Unsaved changes indicator */}
            {hasChanges && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-700 text-sm flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                    Ada perubahan yang belum disimpan. Klik "Simpan Semua" untuk menyimpan.
                </div>
            )}

            {/* Shifts */}
            <div className="card p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-[#1a1f37] flex items-center gap-2">
                        <Clock className="w-5 h-5 text-orange-500" />
                        Shift Makan
                    </h2>
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Tambah Shift
                    </button>
                </div>

                {/* Add Shift Form */}
                {showAddForm && (
                    <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <input
                                type="text"
                                placeholder="Nama Shift"
                                value={newShift.name}
                                onChange={(e) => setNewShift(s => ({ ...s, name: e.target.value }))}
                                className="input-field"
                            />
                            <TimeInput
                                value={newShift.startTime}
                                onChange={(v) => setNewShift(s => ({ ...s, startTime: v }))}
                            />
                            <TimeInput
                                value={newShift.endTime}
                                onChange={(v) => setNewShift(s => ({ ...s, endTime: v }))}
                            />
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Rp</span>
                                <input
                                    type="number"
                                    placeholder="Harga"
                                    value={newShift.mealPrice}
                                    onChange={(e) => setNewShift(s => ({ ...s, mealPrice: parseInt(e.target.value) || 0 }))}
                                    className="input-field pl-10"
                                    min="0"
                                    step="1000"
                                />
                            </div>
                            <button onClick={createShift} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl font-medium transition-colors">
                                Buat
                            </button>
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    {shifts.map((shift) => (
                        <div key={shift.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                                <div>
                                    <label className="text-xs text-slate-500 uppercase tracking-wide">Nama</label>
                                    <input
                                        type="text"
                                        value={shift.name}
                                        onChange={(e) => updateShiftLocal(shift.id, { name: e.target.value })}
                                        className="input-field mt-1"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 uppercase tracking-wide">Jam Mulai</label>
                                    <TimeInput
                                        value={shift.startTime}
                                        onChange={(v) => updateShiftLocal(shift.id, { startTime: v })}
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 uppercase tracking-wide">Jam Selesai</label>
                                    <TimeInput
                                        value={shift.endTime}
                                        onChange={(v) => updateShiftLocal(shift.id, { endTime: v })}
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 uppercase tracking-wide">Harga Makanan</label>
                                    <div className="relative mt-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Rp</span>
                                        <input
                                            type="number"
                                            value={shift.mealPrice || 25000}
                                            onChange={(e) => updateShiftLocal(shift.id, { mealPrice: parseInt(e.target.value) || 0 })}
                                            className="input-field pl-10"
                                            min="0"
                                            step="1000"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-end">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={shift.isActive}
                                            onChange={(e) => updateShiftLocal(shift.id, { isActive: e.target.checked })}
                                            className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                                        />
                                        <span className="text-slate-700">Aktif</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Settings */}
            <div className="card p-6">
                <h2 className="text-lg font-semibold text-[#1a1f37] mb-6">Pengaturan Sistem</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div>
                        <label className="block text-sm text-slate-500 mb-2">
                            Jam Cutoff Sebelum Shift
                        </label>
                        <input
                            type="number"
                            min="0"
                            max="24"
                            value={settings?.cutoffHours || 6}
                            onChange={(e) => setSettings(s => s ? { ...s, cutoffHours: parseInt(e.target.value) } : null)}
                            className="input-field"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Pesanan harus dibuat sekian jam sebelum shift dimulai
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm text-slate-500 mb-2">
                            Strike No-Show untuk Blacklist
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={settings?.blacklistStrikes || 3}
                            onChange={(e) => setSettings(s => s ? { ...s, blacklistStrikes: parseInt(e.target.value) } : null)}
                            className="input-field"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Jumlah no-show sebelum user di-blacklist
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm text-slate-500 mb-2">
                            Durasi Blacklist (Hari)
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="365"
                            value={settings?.blacklistDuration || 7}
                            onChange={(e) => setSettings(s => s ? { ...s, blacklistDuration: parseInt(e.target.value) } : null)}
                            className="input-field"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Berapa lama user tetap di-blacklist
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm text-slate-500 mb-2">
                            Maksimal Hari Order ke Depan
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="30"
                            value={settings?.maxOrderDaysAhead || 7}
                            onChange={(e) => setSettings(s => s ? { ...s, maxOrderDaysAhead: parseInt(e.target.value) } : null)}
                            className="input-field"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Berapa hari ke depan user bisa order catering
                        </p>
                    </div>
                </div>
            </div>

            {/* Floating Save Button when there are changes */}
            {hasChanges && (
                <div className="fixed bottom-6 right-6 z-50">
                    <button
                        onClick={saveAllChanges}
                        disabled={isSaving}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 shadow-lg shadow-emerald-500/25 font-medium transition-colors disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        Simpan Semua Perubahan
                    </button>
                </div>
            )}
        </div>
    );
}
