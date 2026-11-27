import { useState, useEffect, useCallback } from 'react';
import { MapPin, Plus, Edit2, Trash2, RefreshCw, Check, Building2, Users, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, CANTEEN_EVENTS } from '../../contexts/SSEContext';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    Modal,
    Field,
    Input,
    EmptyState,
    Skeleton,
} from '../../components/ui';

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
    const [deactivateTarget, setDeactivateTarget] = useState<Canteen | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        location: '',
        capacity: '',
        isActive: true,
        selectedShifts: [] as string[],
    });
    const [isSaving, setIsSaving] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [canteensRes, shiftsRes] = await Promise.all([
                api.get('/api/canteens?active=false'),
                api.get('/api/shifts'),
            ]);
            setCanteens(canteensRes.data.canteens || []);
            setShifts(
                shiftsRes.data.shifts?.filter((s: Shift & { isActive: boolean }) => s.isActive) || []
            );
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

    useSSERefresh(CANTEEN_EVENTS, loadData);

    const openAddModal = () => {
        setEditingCanteen(null);
        setFormData({
            name: '',
            location: '',
            capacity: '',
            isActive: true,
            selectedShifts: shifts.map((s) => s.id),
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
            selectedShifts: canteen.canteenShifts?.map((cs) => cs.shift.id) || shifts.map((s) => s.id),
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
                capacity: formData.capacity ? parseInt(formData.capacity, 10) : null,
                isActive: formData.isActive,
            };

            if (editingCanteen) {
                await api.put(`/api/canteens/${editingCanteen.id}`, payload);
                await api.post(`/api/canteens/${editingCanteen.id}/shifts`, {
                    shiftIds: formData.selectedShifts,
                });
                toast.success('Kantin diperbarui');
            } else {
                const res = await api.post('/api/canteens', payload);
                await api.post(`/api/canteens/${res.data.canteen.id}/shifts`, {
                    shiftIds: formData.selectedShifts,
                });
                toast.success('Kantin dibuat');
            }
            closeModal();
            loadData();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menyimpan kantin');
        } finally {
            setIsSaving(false);
        }
    };

    const confirmDeactivate = async () => {
        if (!deactivateTarget) return;
        try {
            await api.delete(`/api/canteens/${deactivateTarget.id}`);
            toast.success('Kantin dinonaktifkan');
            setDeactivateTarget(null);
            loadData();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menonaktifkan kantin');
        }
    };

    const toggleShift = (shiftId: string) => {
        setFormData((prev) => ({
            ...prev,
            selectedShifts: prev.selectedShifts.includes(shiftId)
                ? prev.selectedShifts.filter((id) => id !== shiftId)
                : [...prev.selectedShifts, shiftId],
        }));
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-56" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-44" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title="Manajemen kantin"
                subtitle={`${canteens.length} lokasi kantin terdaftar`}
                actions={
                    <>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={loadData}
                            leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Muat ulang
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={openAddModal}
                            leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Tambah kantin
                        </Button>
                    </>
                }
            />

            {canteens.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<MapPin className="w-6 h-6" />}
                        title="Belum ada kantin"
                        description="Tambahkan lokasi kantin untuk mengatur kapasitas dan jadwal pengambilan."
                        action={
                            <Button variant="primary" onClick={openAddModal}>
                                Tambah kantin
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {canteens.map((canteen) => (
                        <Card key={canteen.id} className={!canteen.isActive ? 'opacity-65' : ''}>
                            <div className="flex items-start justify-between gap-2 mb-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div
                                        className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${
                                            canteen.isActive
                                                ? 'bg-[#fffbeb] text-[#b45309] border border-[#fde68a]'
                                                : 'bg-[#f5f5f4] text-[#78716c] border border-[#e7e5e4]'
                                        }`}
                                    >
                                        <Building2 className="w-4 h-4" aria-hidden="true" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-[14.5px] font-bold text-[#1c1917] truncate">
                                            {canteen.name}
                                        </h3>
                                        {canteen.location && (
                                            <p className="text-[12px] text-[#78716c] truncate">{canteen.location}</p>
                                        )}
                                    </div>
                                </div>
                                <Badge variant={canteen.isActive ? 'success' : 'neutral'} dot={canteen.isActive}>
                                    {canteen.isActive ? 'Aktif' : 'Nonaktif'}
                                </Badge>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="p-2.5 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                                    <div className="flex items-center gap-1 text-[11.5px] text-[#78716c]">
                                        <Users className="w-3 h-3" aria-hidden="true" />
                                        Pengguna tetap
                                    </div>
                                    <div className="text-[18px] font-extrabold text-[#1c1917] tabular-nums mt-0.5">
                                        {canteen._count?.preferredUsers || 0}
                                    </div>
                                </div>
                                <div className="p-2.5 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                                    <div className="flex items-center gap-1 text-[11.5px] text-[#78716c]">
                                        <Clock className="w-3 h-3" aria-hidden="true" />
                                        Kapasitas
                                    </div>
                                    <div className="text-[18px] font-extrabold text-[#1c1917] tabular-nums mt-0.5">
                                        {canteen.capacity ? `${canteen.capacity}/hr` : 'Tak terbatas'}
                                    </div>
                                </div>
                            </div>

                            {canteen.canteenShifts && canteen.canteenShifts.length > 0 && (
                                <div className="mb-3">
                                    <div className="text-[11.5px] text-[#78716c] mb-1.5">Shift tersedia</div>
                                    <div className="flex flex-wrap gap-1">
                                        {canteen.canteenShifts.map((cs) => (
                                            <Badge key={cs.id} variant="neutral">
                                                {cs.shift.name}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-2 pt-3 border-t border-[#f5f5f4]">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => openEditModal(canteen)}
                                    leftIcon={<Edit2 className="w-3.5 h-3.5" aria-hidden="true" />}
                                >
                                    Edit
                                </Button>
                                {canteen.isActive && (
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        onClick={() => setDeactivateTarget(canteen)}
                                        aria-label={`Nonaktifkan ${canteen.name}`}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Add / Edit Modal */}
            <Modal
                open={showModal}
                onClose={closeModal}
                title={editingCanteen ? 'Edit kantin' : 'Tambah kantin'}
                size="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={closeModal}>
                            Batal
                        </Button>
                        <Button variant="primary" loading={isSaving} onClick={handleSave}>
                            {editingCanteen ? 'Simpan' : 'Tambah'}
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <Field label="Nama kantin" required>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                            placeholder="Contoh: Kantin Gedung A"
                        />
                    </Field>
                    <Field label="Lokasi" hint="Opsional">
                        <Input
                            value={formData.location}
                            onChange={(e) => setFormData((f) => ({ ...f, location: e.target.value }))}
                            placeholder="Contoh: Lantai 1, Gedung Utama"
                        />
                    </Field>
                    <Field label="Kapasitas harian" hint="Kosongkan untuk tanpa batas">
                        <Input
                            type="number"
                            min={1}
                            value={formData.capacity}
                            onChange={(e) => setFormData((f) => ({ ...f, capacity: e.target.value }))}
                            placeholder="Tanpa batas"
                        />
                    </Field>
                    <div>
                        <div className="text-[12.5px] font-semibold text-[#44403c] mb-1.5">
                            Shift tersedia
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {shifts.map((shift) => {
                                const selected = formData.selectedShifts.includes(shift.id);
                                return (
                                    <button
                                        key={shift.id}
                                        type="button"
                                        onClick={() => toggleShift(shift.id)}
                                        className={`h-8 px-3 rounded-[8px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 border cursor-pointer transition-colors ${
                                            selected
                                                ? 'bg-[#f59e0b] text-[#1c1917] border-[#f59e0b]'
                                                : 'bg-[#fff] text-[#57534e] border-[#e7e5e4] hover:bg-[#fafaf9]'
                                        }`}
                                    >
                                        {selected && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                                        {shift.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <label className="flex items-center gap-2 pt-1 cursor-pointer text-[13px] font-medium text-[#1c1917]">
                        <input
                            type="checkbox"
                            checked={formData.isActive}
                            onChange={(e) => setFormData((f) => ({ ...f, isActive: e.target.checked }))}
                        />
                        Kantin aktif
                    </label>
                </div>
            </Modal>

            {/* Deactivate Confirm Modal */}
            <Modal
                open={Boolean(deactivateTarget)}
                onClose={() => setDeactivateTarget(null)}
                title="Nonaktifkan kantin?"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeactivateTarget(null)}>
                            Batal
                        </Button>
                        <Button variant="danger" onClick={confirmDeactivate}>
                            Nonaktifkan
                        </Button>
                    </>
                }
            >
                <p className="text-[13.5px] text-[#57534e]">
                    Nonaktifkan kantin <b>{deactivateTarget?.name}</b>? Karyawan tidak akan bisa memilih kantin ini untuk pesanan baru.
                </p>
            </Modal>
        </div>
    );
}
