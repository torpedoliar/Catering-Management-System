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
    cutoffMode: 'per-shift' | 'weekly';
    cutoffDays: number;
    cutoffHours: number;
    maxOrderDaysAhead: number;
    weeklyCutoffDay: number;
    weeklyCutoffHour: number;
    weeklyCutoffMinute: number;
    orderableDays: string;
    maxWeeksAhead: number;
    blacklistStrikes: number;
    blacklistDuration: number;
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

            {/* Settings - Dual Cutoff Mode */}
            <div className="card p-6">
                <h2 className="text-lg font-semibold text-[#1a1f37] mb-6">Pengaturan Sistem</h2>

                {/* Mode Cutoff Selection */}
                <div className="mb-6">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-3">
                        <Clock className="w-4 h-4" />
                        Mode Cutoff
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${settings?.cutoffMode === 'per-shift' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white'}`}>
                            <input
                                type="radio"
                                name="cutoffMode"
                                checked={settings?.cutoffMode === 'per-shift'}
                                onChange={() => setSettings(s => s ? { ...s, cutoffMode: 'per-shift' } : null)}
                                className="sr-only"
                            />
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${settings?.cutoffMode === 'per-shift' ? 'border-orange-500 bg-orange-500' : 'border-slate-300'}`}>
                                {settings?.cutoffMode === 'per-shift' && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                            <div>
                                <div className="text-slate-800 font-medium">Per-Shift</div>
                                <div className="text-xs text-slate-500">X hari/jam sebelum shift</div>
                            </div>
                        </label>
                        <label className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${settings?.cutoffMode === 'weekly' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white'}`}>
                            <input
                                type="radio"
                                name="cutoffMode"
                                checked={settings?.cutoffMode === 'weekly'}
                                onChange={() => setSettings(s => s ? { ...s, cutoffMode: 'weekly' } : null)}
                                className="sr-only"
                            />
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${settings?.cutoffMode === 'weekly' ? 'border-orange-500 bg-orange-500' : 'border-slate-300'}`}>
                                {settings?.cutoffMode === 'weekly' && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                            <div>
                                <div className="text-slate-800 font-medium">Mingguan</div>
                                <div className="text-xs text-slate-500">Cutoff hari tertentu</div>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Per-Shift Mode Settings */}
                {settings?.cutoffMode === 'per-shift' && (
                    <div className="p-4 bg-slate-50 rounded-xl mb-6">
                        <p className="text-sm text-slate-500 mb-4">Batas waktu order sebelum shift dimulai</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Hari sebelum shift</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="30"
                                    value={settings?.cutoffDays || 0}
                                    onChange={(e) => setSettings(s => s ? { ...s, cutoffDays: parseInt(e.target.value) || 0 } : null)}
                                    className="input-field"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Jam sebelum shift</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="23"
                                    value={settings?.cutoffHours || 6}
                                    onChange={(e) => setSettings(s => s ? { ...s, cutoffHours: parseInt(e.target.value) || 0 } : null)}
                                    className="input-field"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Maksimal hari order</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="30"
                                    value={settings?.maxOrderDaysAhead || 7}
                                    onChange={(e) => setSettings(s => s ? { ...s, maxOrderDaysAhead: parseInt(e.target.value) || 7 } : null)}
                                    className="input-field"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-orange-500 mt-2">
                            Total: {((settings?.cutoffDays || 0) * 24) + (settings?.cutoffHours || 6)} jam sebelum shift
                        </p>
                    </div>
                )}

                {/* Weekly Mode Settings */}
                {settings?.cutoffMode === 'weekly' && (
                    <div className="p-4 bg-slate-50 rounded-xl mb-6 space-y-4">
                        <p className="text-sm text-slate-500">Cutoff hari & jam tertentu untuk order minggu depan</p>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Hari Cutoff</label>
                                <select
                                    value={settings?.weeklyCutoffDay ?? 5}
                                    onChange={(e) => setSettings(s => s ? { ...s, weeklyCutoffDay: parseInt(e.target.value) } : null)}
                                    className="input-field"
                                >
                                    <option value={1}>Senin</option>
                                    <option value={2}>Selasa</option>
                                    <option value={3}>Rabu</option>
                                    <option value={4}>Kamis</option>
                                    <option value={5}>Jumat</option>
                                    <option value={6}>Sabtu</option>
                                    <option value={0}>Minggu</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Jam</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="23"
                                    value={settings?.weeklyCutoffHour ?? 17}
                                    onChange={(e) => setSettings(s => s ? { ...s, weeklyCutoffHour: parseInt(e.target.value) || 0 } : null)}
                                    className="input-field"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Menit</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="59"
                                    value={settings?.weeklyCutoffMinute ?? 0}
                                    onChange={(e) => setSettings(s => s ? { ...s, weeklyCutoffMinute: parseInt(e.target.value) || 0 } : null)}
                                    className="input-field"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-500 mb-2">Hari yang Dapat Dipesan</label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { value: 1, label: 'Sen' },
                                    { value: 2, label: 'Sel' },
                                    { value: 3, label: 'Rab' },
                                    { value: 4, label: 'Kam' },
                                    { value: 5, label: 'Jum' },
                                    { value: 6, label: 'Sab' },
                                    { value: 0, label: 'Min' },
                                ].map(day => {
                                    const orderableDays = (settings?.orderableDays || '1,2,3,4,5,6').split(',').map(d => parseInt(d));
                                    const isSelected = orderableDays.includes(day.value);
                                    return (
                                        <label
                                            key={day.value}
                                            className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-600'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={(e) => {
                                                    const currentDays = (settings?.orderableDays || '1,2,3,4,5,6').split(',').map(d => parseInt(d));
                                                    let newDays: number[];
                                                    if (e.target.checked) {
                                                        newDays = [...currentDays, day.value];
                                                    } else {
                                                        newDays = currentDays.filter(d => d !== day.value);
                                                    }
                                                    setSettings(s => s ? { ...s, orderableDays: newDays.join(',') } : null);
                                                }}
                                                className="sr-only"
                                            />
                                            {day.label}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Maksimal Minggu ke Depan</label>
                            <select
                                value={settings?.maxWeeksAhead ?? 1}
                                onChange={(e) => setSettings(s => s ? { ...s, maxWeeksAhead: parseInt(e.target.value) } : null)}
                                className="input-field w-40"
                            >
                                <option value={1}>1 Minggu</option>
                                <option value={2}>2 Minggu</option>
                            </select>
                        </div>
                    </div>
                )}

                {/* Blacklist Settings */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-slate-500 mb-2">Strike untuk Blacklist</label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={settings?.blacklistStrikes || 3}
                            onChange={(e) => setSettings(s => s ? { ...s, blacklistStrikes: parseInt(e.target.value) } : null)}
                            className="input-field"
                        />
                        <p className="text-xs text-slate-500 mt-1">Jumlah tidak diambil sebelum di-blacklist</p>
                    </div>
                    <div>
                        <label className="block text-sm text-slate-500 mb-2">Durasi Blacklist (Hari)</label>
                        <input
                            type="number"
                            min="1"
                            max="365"
                            value={settings?.blacklistDuration || 7}
                            onChange={(e) => setSettings(s => s ? { ...s, blacklistDuration: parseInt(e.target.value) } : null)}
                            className="input-field"
                        />
                        <p className="text-xs text-slate-500 mt-1">Berapa lama user tetap di-blacklist</p>
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
