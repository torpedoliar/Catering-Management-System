import { useState, useEffect, useCallback } from 'react';
import { Clock, Save, Plus, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, SHIFT_EVENTS, SETTINGS_EVENTS } from '../../contexts/SSEContext';
import TimeInput from '../../components/TimeInput';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    Field,
    Input,
    Select,
    Skeleton,
} from '../../components/ui';

interface DayBreak {
    dayOfWeek: number;
    breakStartTime: string;
    breakEndTime: string;
}

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    breakStartTime?: string | null;
    breakEndTime?: string | null;
    mealPrice: number;
    isActive: boolean;
    hasSpecialDayBreaks?: boolean;
    dayBreaks?: DayBreak[];
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
    enforceCanteenCheckin?: boolean;
}

const WEEKDAYS = [
    { value: 1, short: 'Sen', label: 'Senin' },
    { value: 2, short: 'Sel', label: 'Selasa' },
    { value: 3, short: 'Rab', label: 'Rabu' },
    { value: 4, short: 'Kam', label: 'Kamis' },
    { value: 5, short: 'Jum', label: 'Jumat' },
    { value: 6, short: 'Sab', label: 'Sabtu' },
    { value: 0, short: 'Min', label: 'Minggu' },
];

export default function ShiftConfigPage() {
    const [originalShifts, setOriginalShifts] = useState<Shift[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [originalSettings, setOriginalSettings] = useState<Settings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [newShift, setNewShift] = useState({
        name: '',
        startTime: '',
        endTime: '',
        mealPrice: 25000,
        breakStartTime: '',
        breakEndTime: '',
    });
    const [showAddForm, setShowAddForm] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [shiftsRes, settingsRes] = await Promise.all([
                api.get('/api/shifts?includeInactive=true'),
                api.get('/api/settings'),
            ]);
            setShifts(shiftsRes.data.shifts || []);
            setOriginalShifts(shiftsRes.data.shifts || []);
            setSettings(settingsRes.data);
            setOriginalSettings(settingsRes.data);
        } catch (error) {
            console.error('Failed to load config:', error);
            toast.error('Gagal memuat konfigurasi shift');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useSSERefresh([...SHIFT_EVENTS, ...SETTINGS_EVENTS], loadData);

    useEffect(() => {
        const shiftsChanged = JSON.stringify(shifts) !== JSON.stringify(originalShifts);
        const settingsChanged = JSON.stringify(settings) !== JSON.stringify(originalSettings);
        setHasChanges(shiftsChanged || settingsChanged);
    }, [shifts, settings, originalShifts, originalSettings]);

    const updateShiftLocal = (id: string, data: Partial<Shift>) => {
        setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
    };

    const resetChanges = () => {
        setShifts([...originalShifts]);
        setSettings(originalSettings ? { ...originalSettings } : null);
        toast.success('Perubahan direset');
    };

    const saveAllChanges = async () => {
        setIsSaving(true);
        try {
            const changedShifts = shifts.filter((shift) => {
                const orig = originalShifts.find((s) => s.id === shift.id);
                return JSON.stringify(shift) !== JSON.stringify(orig);
            });

            for (const shift of changedShifts) {
                await api.put(`/api/shifts/${shift.id}`, {
                    name: shift.name,
                    startTime: shift.startTime,
                    endTime: shift.endTime,
                    mealPrice: shift.mealPrice,
                    isActive: shift.isActive,
                    breakStartTime: shift.breakStartTime || null,
                    breakEndTime: shift.breakEndTime || null,
                    hasSpecialDayBreaks: shift.hasSpecialDayBreaks || false,
                    dayBreaks: shift.hasSpecialDayBreaks ? shift.dayBreaks || [] : [],
                });
            }

            if (settings && JSON.stringify(settings) !== JSON.stringify(originalSettings)) {
                await api.put('/api/settings', settings);
            }

            toast.success('Semua perubahan disimpan');
            await loadData();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menyimpan perubahan');
        } finally {
            setIsSaving(false);
        }
    };

    const createShift = async () => {
        if (!newShift.name || !newShift.startTime || !newShift.endTime) {
            toast.error('Harap isi nama shift dan jam mulai/selesai');
            return;
        }
        try {
            await api.post('/api/shifts', {
                ...newShift,
                mealPrice: newShift.mealPrice || 25000,
            });
            toast.success('Shift dibuat');
            setNewShift({
                name: '',
                startTime: '',
                endTime: '',
                mealPrice: 25000,
                breakStartTime: '',
                breakEndTime: '',
            });
            setShowAddForm(false);
            loadData();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal membuat shift');
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title="Konfigurasi shift & cutoff"
                subtitle="Atur jadwal shift makan, jam istirahat, harga porsi, batas waktu order, dan aturan blacklist"
                actions={
                    hasChanges ? (
                        <>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={resetChanges}
                                leftIcon={<RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
                            >
                                Reset
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                loading={isSaving}
                                onClick={saveAllChanges}
                                leftIcon={<Save className="w-3.5 h-3.5" aria-hidden="true" />}
                            >
                                Simpan semua
                            </Button>
                        </>
                    ) : undefined
                }
            />

            {hasChanges && (
                <div className="px-4 py-2.5 rounded-[12px] bg-[#fffbeb] border border-[#fde68a] text-[#92400e] text-[13px] flex items-center justify-between gap-3">
                    <span>Ada perubahan yang belum disimpan.</span>
                    <Button variant="primary" size="sm" loading={isSaving} onClick={saveAllChanges}>
                        Simpan sekarang
                    </Button>
                </div>
            )}

            {/* Shift Makan */}
            <Card>
                <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#b45309]" aria-hidden="true" />
                        <h2 className="text-[15px] font-bold text-[#1c1917]">Shift makan</h2>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowAddForm(!showAddForm)}
                        leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                        {showAddForm ? 'Tutup form' : 'Tambah shift'}
                    </Button>
                </div>

                {showAddForm && (
                    <div className="mb-4 p-3.5 rounded-[12px] bg-[#fafaf9] border border-[#e7e5e4]">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                            <Field label="Nama shift" required>
                                <Input
                                    placeholder="Contoh: Shift 1"
                                    value={newShift.name}
                                    onChange={(e) => setNewShift((s) => ({ ...s, name: e.target.value }))}
                                />
                            </Field>
                            <Field label="Jam mulai" required>
                                <TimeInput
                                    value={newShift.startTime}
                                    onChange={(v) => setNewShift((s) => ({ ...s, startTime: v }))}
                                />
                            </Field>
                            <Field label="Jam selesai" required>
                                <TimeInput
                                    value={newShift.endTime}
                                    onChange={(v) => setNewShift((s) => ({ ...s, endTime: v }))}
                                />
                            </Field>
                            <Field label="Harga porsi (Rp)">
                                <Input
                                    type="number"
                                    min={0}
                                    step={1000}
                                    value={newShift.mealPrice}
                                    onChange={(e) =>
                                        setNewShift((s) => ({ ...s, mealPrice: parseInt(e.target.value, 10) || 0 }))
                                    }
                                />
                            </Field>
                            <Button variant="primary" onClick={createShift}>
                                Buat shift
                            </Button>
                        </div>
                    </div>
                )}

                <div className="space-y-3">
                    {shifts.map((shift) => (
                        <div
                            key={shift.id}
                            className="p-4 rounded-[12px] bg-[#fafaf9] border border-[#e7e5e4] space-y-3"
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                                <Field label="Nama">
                                    <Input
                                        value={shift.name}
                                        onChange={(e) => updateShiftLocal(shift.id, { name: e.target.value })}
                                    />
                                </Field>
                                <Field label="Jam mulai">
                                    <TimeInput
                                        value={shift.startTime}
                                        onChange={(v) => updateShiftLocal(shift.id, { startTime: v })}
                                    />
                                </Field>
                                <Field label="Jam selesai">
                                    <TimeInput
                                        value={shift.endTime}
                                        onChange={(v) => updateShiftLocal(shift.id, { endTime: v })}
                                    />
                                </Field>
                                <Field label="Harga makanan (Rp)">
                                    <Input
                                        type="number"
                                        min={0}
                                        step={1000}
                                        value={shift.mealPrice || 25000}
                                        onChange={(e) =>
                                            updateShiftLocal(shift.id, {
                                                mealPrice: parseInt(e.target.value, 10) || 0,
                                            })
                                        }
                                    />
                                </Field>
                                <div className="flex items-center justify-between h-9">
                                    <label className="flex items-center gap-2 cursor-pointer text-[13px] font-semibold text-[#1c1917]">
                                        <input
                                            type="checkbox"
                                            checked={shift.isActive}
                                            onChange={(e) => updateShiftLocal(shift.id, { isActive: e.target.checked })}
                                        />
                                        Aktif
                                    </label>
                                    <Badge variant={shift.isActive ? 'success' : 'neutral'}>
                                        {shift.isActive ? 'Aktif' : 'Nonaktif'}
                                    </Badge>
                                </div>
                            </div>

                            {/* Break window */}
                            <div className="pt-3 border-t border-[#e7e5e4]">
                                <div className="text-[12.5px] font-semibold text-[#44403c] mb-2">
                                    Jam istirahat (pengambilan makanan)
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                                    <Field label="Mulai istirahat">
                                        <TimeInput
                                            value={shift.breakStartTime || ''}
                                            onChange={(v) =>
                                                updateShiftLocal(shift.id, { breakStartTime: v || null })
                                            }
                                        />
                                    </Field>
                                    <Field label="Selesai istirahat">
                                        <TimeInput
                                            value={shift.breakEndTime || ''}
                                            onChange={(v) =>
                                                updateShiftLocal(shift.id, { breakEndTime: v || null })
                                            }
                                        />
                                    </Field>
                                </div>
                                <p className="text-[12px] text-[#78716c] mt-1.5">
                                    {shift.breakStartTime && shift.breakEndTime
                                        ? `Makanan hanya dapat diambil antara ${shift.breakStartTime} – ${shift.breakEndTime}.`
                                        : 'Kosongkan untuk mengizinkan pengambilan kapan saja selama shift.'}
                                </p>

                                {shift.breakStartTime && shift.breakEndTime && (
                                    <div className="mt-3 pt-3 border-t border-dashed border-[#e7e5e4]">
                                        <label className="flex items-center gap-2 cursor-pointer text-[12.5px] font-semibold text-[#44403c]">
                                            <input
                                                type="checkbox"
                                                checked={shift.hasSpecialDayBreaks || false}
                                                onChange={(e) =>
                                                    updateShiftLocal(shift.id, {
                                                        hasSpecialDayBreaks: e.target.checked,
                                                        dayBreaks: e.target.checked ? shift.dayBreaks || [] : [],
                                                    })
                                                }
                                            />
                                            Jam istirahat khusus per hari (mis. Jumat)
                                        </label>

                                        {shift.hasSpecialDayBreaks && (
                                            <div className="mt-2.5 space-y-1.5">
                                                {WEEKDAYS.map((day) => {
                                                    const dayBreak = (shift.dayBreaks || []).find(
                                                        (db) => db.dayOfWeek === day.value
                                                    );
                                                    const isChecked = Boolean(dayBreak);
                                                    return (
                                                        <div key={day.value} className="flex flex-wrap items-center gap-3 py-1">
                                                            <label className="flex items-center gap-2 cursor-pointer min-w-[96px] text-[12.5px]">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={(e) => {
                                                                        const cur = [...(shift.dayBreaks || [])];
                                                                        if (e.target.checked) {
                                                                            cur.push({
                                                                                dayOfWeek: day.value,
                                                                                breakStartTime: shift.breakStartTime || '12:00',
                                                                                breakEndTime: shift.breakEndTime || '13:00',
                                                                            });
                                                                        } else {
                                                                            const idx = cur.findIndex(
                                                                                (db) => db.dayOfWeek === day.value
                                                                            );
                                                                            if (idx !== -1) cur.splice(idx, 1);
                                                                        }
                                                                        updateShiftLocal(shift.id, { dayBreaks: cur });
                                                                    }}
                                                                />
                                                                <span className={isChecked ? 'font-semibold text-[#1c1917]' : 'text-[#78716c]'}>
                                                                    {day.label}
                                                                </span>
                                                            </label>
                                                            {isChecked ? (
                                                                <div className="flex items-center gap-2">
                                                                    <TimeInput
                                                                        value={dayBreak?.breakStartTime || ''}
                                                                        onChange={(v) => {
                                                                            const cur = [...(shift.dayBreaks || [])];
                                                                            const idx = cur.findIndex(
                                                                                (db) => db.dayOfWeek === day.value
                                                                            );
                                                                            if (idx !== -1) {
                                                                                cur[idx] = {
                                                                                    ...cur[idx],
                                                                                    breakStartTime: v || '',
                                                                                };
                                                                            }
                                                                            updateShiftLocal(shift.id, { dayBreaks: cur });
                                                                        }}
                                                                        className="w-24"
                                                                    />
                                                                    <span className="text-[#78716c] text-[12px]">–</span>
                                                                    <TimeInput
                                                                        value={dayBreak?.breakEndTime || ''}
                                                                        onChange={(v) => {
                                                                            const cur = [...(shift.dayBreaks || [])];
                                                                            const idx = cur.findIndex(
                                                                                (db) => db.dayOfWeek === day.value
                                                                            );
                                                                            if (idx !== -1) {
                                                                                cur[idx] = {
                                                                                    ...cur[idx],
                                                                                    breakEndTime: v || '',
                                                                                };
                                                                            }
                                                                            updateShiftLocal(shift.id, { dayBreaks: cur });
                                                                        }}
                                                                        className="w-24"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <span className="text-[11.5px] text-[#a8a29e]">
                                                                    Pakai default ({shift.breakStartTime}–{shift.breakEndTime})
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Pengaturan Sistem */}
            {settings && (
                <Card>
                    <h2 className="text-[15px] font-bold text-[#1c1917] mb-4">Pengaturan pemesanan & blacklist</h2>

                    <div className="space-y-5">
                        <div>
                            <div className="text-[12.5px] font-semibold text-[#44403c] mb-2">Mode cutoff</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {[
                                    {
                                        key: 'per-shift' as const,
                                        title: 'Per-Shift',
                                        desc: 'Batas order dihitung X hari/jam sebelum shift',
                                    },
                                    {
                                        key: 'weekly' as const,
                                        title: 'Mingguan',
                                        desc: 'Cutoff pada hari dan jam tertentu tiap minggu',
                                    },
                                ].map((opt) => {
                                    const active = settings.cutoffMode === opt.key;
                                    return (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            onClick={() => setSettings((s) => (s ? { ...s, cutoffMode: opt.key } : null))}
                                            className={`p-3.5 rounded-[12px] border text-left cursor-pointer transition-colors ${
                                                active
                                                    ? 'bg-[#fffbeb] border-[#f59e0b]'
                                                    : 'bg-[#fff] border-[#e7e5e4] hover:bg-[#fafaf9]'
                                            }`}
                                        >
                                            <div className="text-[13.5px] font-bold text-[#1c1917]">{opt.title}</div>
                                            <div className="text-[12px] text-[#78716c] mt-0.5">{opt.desc}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {settings.cutoffMode === 'per-shift' ? (
                            <div className="p-4 rounded-[12px] bg-[#fafaf9] border border-[#e7e5e4] space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <Field label="Hari sebelum shift">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={30}
                                            value={settings.cutoffDays || 0}
                                            onChange={(e) =>
                                                setSettings((s) =>
                                                    s ? { ...s, cutoffDays: parseInt(e.target.value, 10) || 0 } : null
                                                )
                                            }
                                        />
                                    </Field>
                                    <Field label="Jam sebelum shift">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={settings.cutoffHours || 0}
                                            onChange={(e) =>
                                                setSettings((s) =>
                                                    s ? { ...s, cutoffHours: parseInt(e.target.value, 10) || 0 } : null
                                                )
                                            }
                                        />
                                    </Field>
                                    <Field label="Maksimal hari order ke depan">
                                        <Input
                                            type="number"
                                            min={1}
                                            max={30}
                                            value={settings.maxOrderDaysAhead || 7}
                                            onChange={(e) =>
                                                setSettings((s) =>
                                                    s
                                                        ? {
                                                              ...s,
                                                              maxOrderDaysAhead: parseInt(e.target.value, 10) || 7,
                                                          }
                                                        : null
                                                )
                                            }
                                        />
                                    </Field>
                                </div>
                                <p className="text-[12px] font-semibold text-[#b45309]">
                                    Total batas waktu: {(settings.cutoffDays || 0) * 24 + (settings.cutoffHours || 0)} jam sebelum shift
                                </p>
                            </div>
                        ) : (
                            <div className="p-4 rounded-[12px] bg-[#fafaf9] border border-[#e7e5e4] space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <Field label="Hari cutoff">
                                        <Select
                                            value={settings.weeklyCutoffDay ?? 5}
                                            onChange={(e) =>
                                                setSettings((s) =>
                                                    s ? { ...s, weeklyCutoffDay: parseInt(e.target.value, 10) } : null
                                                )
                                            }
                                        >
                                            {WEEKDAYS.map((w) => (
                                                <option key={w.value} value={w.value}>
                                                    {w.label}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>
                                    <Field label="Jam cutoff">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={settings.weeklyCutoffHour ?? 17}
                                            onChange={(e) =>
                                                setSettings((s) =>
                                                    s
                                                        ? {
                                                              ...s,
                                                              weeklyCutoffHour: parseInt(e.target.value, 10) || 0,
                                                          }
                                                        : null
                                                )
                                            }
                                        />
                                    </Field>
                                    <Field label="Menit cutoff">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={59}
                                            value={settings.weeklyCutoffMinute ?? 0}
                                            onChange={(e) =>
                                                setSettings((s) =>
                                                    s
                                                        ? {
                                                              ...s,
                                                              weeklyCutoffMinute: parseInt(e.target.value, 10) || 0,
                                                          }
                                                        : null
                                                )
                                            }
                                        />
                                    </Field>
                                </div>

                                <div>
                                    <div className="text-[12.5px] font-semibold text-[#44403c] mb-1.5">
                                        Hari yang dapat dipesan
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {WEEKDAYS.map((day) => {
                                            const cur = (settings.orderableDays || '1,2,3,4,5,6')
                                                .split(',')
                                                .map((d) => parseInt(d, 10));
                                            const active = cur.includes(day.value);
                                            return (
                                                <button
                                                    key={day.value}
                                                    type="button"
                                                    onClick={() => {
                                                        const next = active
                                                            ? cur.filter((d) => d !== day.value)
                                                            : [...cur, day.value];
                                                        setSettings((s) =>
                                                            s ? { ...s, orderableDays: next.join(',') } : null
                                                        );
                                                    }}
                                                    className={`h-8 px-3 rounded-[8px] text-[12px] font-semibold border cursor-pointer ${
                                                        active
                                                            ? 'bg-[#f59e0b] text-[#1c1917] border-[#f59e0b]'
                                                            : 'bg-[#fff] text-[#57534e] border-[#e7e5e4]'
                                                    }`}
                                                >
                                                    {day.short}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <Field label="Maksimal minggu ke depan" className="max-w-xs">
                                    <Select
                                        value={settings.maxWeeksAhead ?? 1}
                                        onChange={(e) =>
                                            setSettings((s) =>
                                                s ? { ...s, maxWeeksAhead: parseInt(e.target.value, 10) } : null
                                            )
                                        }
                                    >
                                        <option value={1}>1 Minggu</option>
                                        <option value={2}>2 Minggu</option>
                                    </Select>
                                </Field>
                            </div>
                        )}

                        <div className="p-3.5 rounded-[12px] bg-[#fafaf9] border border-[#e7e5e4] flex items-center justify-between gap-4">
                            <div>
                                <div className="text-[13.5px] font-semibold text-[#1c1917]">
                                    Validasi lokasi kantin saat check-in
                                </div>
                                <div className="text-[12px] text-[#78716c]">
                                    Pesanan hanya bisa di-check-in di kantin tempat pemesanan
                                </div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={Boolean(settings.enforceCanteenCheckin)}
                                onClick={() =>
                                    setSettings((s) =>
                                        s ? { ...s, enforceCanteenCheckin: !s.enforceCanteenCheckin } : null
                                    )
                                }
                                className={`relative inline-flex h-6 w-11 items-center rounded-full border-0 cursor-pointer transition-colors ${
                                    settings.enforceCanteenCheckin ? 'bg-[#16a34a]' : 'bg-[#d6d3d1]'
                                }`}
                            >
                                <span
                                    className={`inline-block h-4 w-4 rounded-full bg-[#fff] transition-transform ${
                                        settings.enforceCanteenCheckin ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Strike untuk blacklist" hint="Jumlah tidak diambil sebelum diblokir otomatis">
                                <Input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={settings.blacklistStrikes || 3}
                                    onChange={(e) =>
                                        setSettings((s) =>
                                            s ? { ...s, blacklistStrikes: parseInt(e.target.value, 10) || 1 } : null
                                        )
                                    }
                                />
                            </Field>
                            <Field label="Durasi blacklist (hari)" hint="Lama pemblokiran otomatis">
                                <Input
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={settings.blacklistDuration || 7}
                                    onChange={(e) =>
                                        setSettings((s) =>
                                            s ? { ...s, blacklistDuration: parseInt(e.target.value, 10) || 1 } : null
                                        )
                                    }
                                />
                            </Field>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}
