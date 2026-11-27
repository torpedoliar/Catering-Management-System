import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    ChevronLeft,
    ChevronRight,
    Copy,
    Trash2,
    Pizza,
    Store,
    Plus,
    Edit2,
    Image as ImageIcon,
    Search,
    Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, VENDOR_EVENTS, MENU_EVENTS } from '../../contexts/SSEContext';
import { getLocalDateString, formatOrderDate } from '../../utils/dateHelpers';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    Pagination,
    Modal,
    Field,
    Input,
    Select,
    Textarea,
    EmptyState,
    Skeleton,
} from '../../components/ui';

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
    breakStartTime?: string | null;
    breakEndTime?: string | null;
}

interface ShiftGroup {
    key: string;
    label: string;
    shifts: Shift[];
    shiftIds: string[];
    isGrouped: boolean;
}

interface SelectedSlot {
    dayOfWeek: number;
    dayName: string;
    date: string;
    group: ShiftGroup;
    existingMenu?: DayMenu;
}

const CATEGORIES = ['Nasi', 'Mie', 'Lauk', 'Sayur', 'Buah', 'Minuman', 'Snack', 'Lainnya'];
const CATALOG_LIMIT = 10;

function groupShiftsByBreakTime(shifts: Shift[]): ShiftGroup[] {
    const groups = new Map<string, Shift[]>();
    shifts.forEach((shift) => {
        const key =
            shift.breakStartTime && shift.breakEndTime
                ? `${shift.breakStartTime}–${shift.breakEndTime}`
                : `_shift_${shift.id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(shift);
    });

    return Array.from(groups.entries())
        .map(([key, shiftsInGroup]) => ({
            key,
            label: key.startsWith('_shift_') ? shiftsInGroup[0].name : key,
            shifts: shiftsInGroup,
            shiftIds: shiftsInGroup.map((s) => s.id),
            isGrouped: !key.startsWith('_shift_'),
        }))
        .sort((a, b) => a.shifts[0].startTime.localeCompare(b.shifts[0].startTime));
}

function formatDayShort(iso: string): string {
    const key = formatOrderDate(iso);
    if (key === '-') return iso;
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export default function WeeklyMenuPage() {
    const [weekData, setWeekData] = useState<{
        week: number;
        year: number;
        weekStart: string;
        weekEnd: string;
        shifts: Shift[];
        dailyMenus: DailyMenuData[];
    } | null>(null);
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedWeek, setSelectedWeek] = useState<{ week: number; year: number } | null>(null);

    // Side inspector panel state
    const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
    const [pickedMenuItemId, setPickedMenuItemId] = useState<string>('');
    const [slotSearch, setSlotSearch] = useState('');
    const [slotVendorFilter, setSlotVendorFilter] = useState('all');
    const [savingSlot, setSavingSlot] = useState(false);

    // Catalog filter & pagination
    const [catalogSearch, setCatalogSearch] = useState('');
    const [catalogVendorFilter, setCatalogVendorFilter] = useState('all');
    const [catalogCategoryFilter, setCatalogCategoryFilter] = useState('all');
    const [catalogPage, setCatalogPage] = useState(1);

    // Modals
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [copyTarget, setCopyTarget] = useState({ week: 1, year: 2026 });
    const [copyingFromPrev, setCopyingFromPrev] = useState(false);

    const [showMenuItemForm, setShowMenuItemForm] = useState(false);
    const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
    const [menuItemForm, setMenuItemForm] = useState({
        name: '',
        description: '',
        category: '',
        vendorId: '',
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [savingMenuItem, setSavingMenuItem] = useState(false);
    const [deleteMenuTarget, setDeleteMenuTarget] = useState<MenuItem | null>(null);
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const weekParam = selectedWeek ? `?week=${selectedWeek.week}&year=${selectedWeek.year}` : '';
            const [weekRes, menuRes, vendorRes] = await Promise.all([
                api.get(`/api/weekly-menu${weekParam}`),
                api.get('/api/menu-items'),
                api.get('/api/vendors'),
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
            console.error('Load weekly menu error:', error);
            toast.error('Gagal memuat data menu mingguan');
        } finally {
            setLoading(false);
        }
    }, [selectedWeek]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useSSERefresh([...VENDOR_EVENTS, ...MENU_EVENTS], loadData);

    const shiftGroups = useMemo(
        () => (weekData?.shifts ? groupShiftsByBreakTime(weekData.shifts) : []),
        [weekData?.shifts]
    );

    const availableVendors = useMemo(() => {
        const seen = new Map<string, string>();
        menuItems.forEach((i) => {
            if (!seen.has(i.vendorId)) seen.set(i.vendorId, i.vendor.name);
        });
        return Array.from(seen.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [menuItems]);

    const slotFilteredMenuItems = useMemo(
        () =>
            menuItems.filter((i) => {
                const matchV = slotVendorFilter === 'all' || i.vendorId === slotVendorFilter;
                const matchQ =
                    slotSearch.trim() === '' ||
                    i.name.toLowerCase().includes(slotSearch.trim().toLowerCase()) ||
                    i.vendor.name.toLowerCase().includes(slotSearch.trim().toLowerCase());
                return matchV && matchQ;
            }),
        [menuItems, slotVendorFilter, slotSearch]
    );

    const catalogFilteredItems = useMemo(
        () =>
            menuItems.filter((i) => {
                const matchV = catalogVendorFilter === 'all' || i.vendorId === catalogVendorFilter;
                const matchC = catalogCategoryFilter === 'all' || i.category === catalogCategoryFilter;
                const matchQ =
                    catalogSearch.trim() === '' ||
                    i.name.toLowerCase().includes(catalogSearch.trim().toLowerCase());
                return matchV && matchC && matchQ;
            }),
        [menuItems, catalogVendorFilter, catalogCategoryFilter, catalogSearch]
    );

    const pagedCatalogItems = useMemo(
        () =>
            catalogFilteredItems.slice(
                (catalogPage - 1) * CATALOG_LIMIT,
                catalogPage * CATALOG_LIMIT
            ),
        [catalogFilteredItems, catalogPage]
    );

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
        setSelectedSlot(null);
        setSelectedWeek({ week: newWeek, year: newYear });
    };

    const handleSelectSlot = (day: DailyMenuData, group: ShiftGroup, existingMenu?: DayMenu) => {
        setSelectedSlot({
            dayOfWeek: day.dayOfWeek,
            dayName: day.dayName,
            date: day.date,
            group,
            existingMenu,
        });
        setPickedMenuItemId(existingMenu?.menuItem.id || '');
    };

    const handleSaveSlot = async () => {
        if (!selectedWeek || !selectedSlot || !pickedMenuItemId) {
            toast.error('Pilih hidangan terlebih dahulu');
            return;
        }
        setSavingSlot(true);
        try {
            await Promise.all(
                selectedSlot.group.shiftIds.map((sid) =>
                    api.post('/api/weekly-menu', {
                        weekNumber: selectedWeek.week,
                        year: selectedWeek.year,
                        dayOfWeek: selectedSlot.dayOfWeek,
                        shiftId: sid,
                        menuMode: 'SAME_ALL_SHIFTS',
                        menuItemId: pickedMenuItemId,
                    })
                )
            );
            toast.success('Jadwal menu disimpan');
            loadData();
        } catch {
            toast.error('Gagal menyimpan jadwal menu');
        } finally {
            setSavingSlot(false);
        }
    };

    const handleClearSlot = async (
        slotToClear: SelectedSlot | { dayOfWeek: number; menuId: string; menuItemId: string }
    ) => {
        if (!weekData) return;
        try {
            const targetMenuId =
                'menuId' in slotToClear
                    ? slotToClear.menuId
                    : slotToClear.existingMenu?.id;
            const targetItemId =
                'menuId' in slotToClear
                    ? slotToClear.menuItemId
                    : slotToClear.existingMenu?.menuItem.id;
            if (!targetMenuId || !targetItemId) return;

            const dayData = weekData.dailyMenus.find((d) => d.dayOfWeek === slotToClear.dayOfWeek);
            const relatedIds = dayData
                ? dayData.menus.filter((m) => m.menuItem.id === targetItemId).map((m) => m.id)
                : [targetMenuId];

            await Promise.all(
                (relatedIds.length > 0 ? relatedIds : [targetMenuId]).map((id) =>
                    api.delete(`/api/weekly-menu/${id}`)
                )
            );
            toast.success('Slot dikosongkan');
            setSelectedSlot(null);
            setPickedMenuItemId('');
            loadData();
        } catch {
            toast.error('Gagal mengosongkan slot');
        }
    };

    const handleCopyFromPreviousWeek = async () => {
        if (!selectedWeek) return;
        let prevWeek = selectedWeek.week - 1;
        let prevYear = selectedWeek.year;
        if (prevWeek < 1) {
            prevWeek = 52;
            prevYear--;
        }
        setCopyingFromPrev(true);
        try {
            const res = await api.post('/api/weekly-menu/copy', {
                fromWeek: prevWeek,
                fromYear: prevYear,
                toWeek: selectedWeek.week,
                toYear: selectedWeek.year,
            });
            toast.success(res.data?.message || 'Menu minggu lalu disalin');
            loadData();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menyalin minggu lalu');
        } finally {
            setCopyingFromPrev(false);
        }
    };

    const copyWeekToTarget = async () => {
        if (!selectedWeek) return;
        try {
            const res = await api.post('/api/weekly-menu/copy', {
                fromWeek: selectedWeek.week,
                fromYear: selectedWeek.year,
                toWeek: copyTarget.week,
                toYear: copyTarget.year,
            });
            toast.success(res.data?.message || 'Menu berhasil disalin');
            setShowCopyModal(false);
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menyalin menu');
        }
    };

    const openMenuItemForm = (item?: MenuItem) => {
        if (item) {
            setEditingMenuItem(item);
            setMenuItemForm({
                name: item.name,
                description: item.description || '',
                category: item.category || '',
                vendorId: item.vendorId,
            });
        } else {
            setEditingMenuItem(null);
            setMenuItemForm({
                name: '',
                description: '',
                category: '',
                vendorId: vendors[0]?.id || '',
            });
        }
        setImageFile(null);
        setShowMenuItemForm(true);
    };

    const saveMenuItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!menuItemForm.name.trim() || !menuItemForm.vendorId) {
            toast.error('Nama dan vendor wajib diisi');
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
                toast.success('Menu diperbarui');
            } else {
                await api.post('/api/menu-items', form);
                toast.success('Menu ditambahkan');
            }
            setShowMenuItemForm(false);
            loadData();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menyimpan menu');
        } finally {
            setSavingMenuItem(false);
        }
    };

    const confirmDeleteMenuItem = async () => {
        if (!deleteMenuTarget) return;
        try {
            await api.delete(`/api/menu-items/${deleteMenuTarget.id}`);
            toast.success('Menu dihapus');
            setDeleteMenuTarget(null);
            loadData();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menghapus menu');
        }
    };

    const todayKey = getLocalDateString();

    if (loading && !weekData) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-64" />
                <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_340px] gap-4">
                    <Skeleton className="h-96" />
                    <Skeleton className="h-96" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title="Menu mingguan"
                subtitle={
                    weekData
                        ? `Minggu ke-${selectedWeek?.week}, ${selectedWeek?.year} (${formatDayShort(weekData.weekStart)} – ${formatDayShort(weekData.weekEnd)})`
                        : 'Atur jadwal hidangan mingguan per waktu istirahat'
                }
                actions={
                    <>
                        <div className="inline-flex items-center rounded-[9px] border border-[#e7e5e4] bg-[#fff] overflow-hidden">
                            <button
                                type="button"
                                aria-label="Minggu sebelumnya"
                                onClick={() => navigateWeek(-1)}
                                className="h-[34px] px-2.5 hover:bg-[#fafaf9] text-[#57534e] border-0 bg-transparent cursor-pointer"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="px-2.5 text-[12.5px] font-semibold text-[#1c1917] tabular-nums">
                                M{selectedWeek?.week} · {selectedWeek?.year}
                            </span>
                            <button
                                type="button"
                                aria-label="Minggu berikutnya"
                                onClick={() => navigateWeek(1)}
                                className="h-[34px] px-2.5 hover:bg-[#fafaf9] text-[#57534e] border-0 bg-transparent cursor-pointer"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            loading={copyingFromPrev}
                            onClick={handleCopyFromPreviousWeek}
                            leftIcon={<Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Salin dari minggu lalu
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowCopyModal(true)}
                        >
                            Salin ke minggu lain
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => openMenuItemForm()}
                            leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Menu baru
                        </Button>
                    </>
                }
            />

            {vendors.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<Store className="w-6 h-6" />}
                        title="Belum ada vendor"
                        description="Buat vendor terlebih dahulu sebelum menjadwalkan menu mingguan."
                        action={
                            <Link
                                to="/admin/vendors"
                                className="inline-flex items-center gap-1.5 h-[36px] px-4 rounded-[9px] text-[13px] font-semibold bg-[#f59e0b] text-[#1c1917] no-underline"
                            >
                                Kelola Vendor
                            </Link>
                        }
                    />
                </Card>
            ) : (
                <>
                    {/* Split Calendar + Slot Inspector */}
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 items-start">
                        <Card padding="none">
                            <div className="overflow-x-auto">
                                <div className="min-w-[800px]">
                                    {/* Column headers */}
                                    <div className="grid grid-cols-[120px_repeat(7,minmax(96px,1fr))] border-b border-[#e7e5e4] bg-[#fafaf9]">
                                        <div className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[#78716c] flex items-center">
                                            Istirahat
                                        </div>
                                        {weekData?.dailyMenus.map((day) => {
                                            const isToday = formatOrderDate(day.date) === todayKey;
                                            return (
                                                <div
                                                    key={day.date}
                                                    className={`px-2 py-2.5 text-center border-l border-[#f5f5f4] ${
                                                        isToday ? 'bg-[#fffbeb]' : ''
                                                    }`}
                                                >
                                                    <div
                                                        className={`text-[12px] font-bold ${
                                                            isToday ? 'text-[#b45309]' : 'text-[#1c1917]'
                                                        }`}
                                                    >
                                                        {day.dayName}
                                                    </div>
                                                    <div className="text-[11px] text-[#78716c]">
                                                        {formatDayShort(day.date)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Break time rows */}
                                    {shiftGroups.map((group) => (
                                        <div
                                            key={group.key}
                                            className="grid grid-cols-[120px_repeat(7,minmax(96px,1fr))] border-b border-[#f5f5f4] last:border-b-0"
                                        >
                                            <div className="px-3 py-3 flex flex-col justify-center">
                                                <div className="text-[12.5px] font-bold text-[#1c1917]">
                                                    {group.label}
                                                </div>
                                                {group.isGrouped && (
                                                    <div className="text-[11px] text-[#78716c] leading-snug mt-0.5">
                                                        {group.shifts.map((s) => s.name).join(', ')}
                                                    </div>
                                                )}
                                            </div>

                                            {weekData?.dailyMenus.map((day) => {
                                                const isToday = formatOrderDate(day.date) === todayKey;
                                                const menu = day.menus.find((m) =>
                                                    group.shiftIds.includes(m.shiftId || '')
                                                );
                                                const isSelected =
                                                    selectedSlot?.dayOfWeek === day.dayOfWeek &&
                                                    selectedSlot?.group.key === group.key;

                                                return (
                                                    <div
                                                        key={`${day.date}-${group.key}`}
                                                        className={`p-1.5 border-l border-[#f5f5f4] ${
                                                            isToday ? 'bg-[#fffbeb]/50' : ''
                                                        }`}
                                                    >
                                                        {menu ? (
                                                            <div
                                                                className={`group relative rounded-[10px] p-2 h-full min-h-[82px] border transition-colors cursor-pointer ${
                                                                    isSelected
                                                                        ? 'bg-[#fffbeb] border-[#f59e0b] ring-1 ring-[#f59e0b]'
                                                                        : 'bg-[#fafaf9] border-[#e7e5e4] hover:border-[#d6d3d1]'
                                                                }`}
                                                                onClick={() => handleSelectSlot(day, group, menu)}
                                                            >
                                                                {menu.menuItem.imageUrl ? (
                                                                    <img
                                                                        src={menu.menuItem.imageUrl}
                                                                        alt=""
                                                                        className="w-full h-11 object-cover rounded-[6px] mb-1.5"
                                                                    />
                                                                ) : (
                                                                    <div className="w-6 h-6 rounded-[6px] bg-[#fffbeb] text-[#b45309] flex items-center justify-center mb-1.5">
                                                                        <Pizza className="w-3.5 h-3.5" aria-hidden="true" />
                                                                    </div>
                                                                )}
                                                                <div className="text-[11.5px] font-semibold text-[#1c1917] leading-tight line-clamp-2">
                                                                    {menu.menuItem.name}
                                                                </div>
                                                                <div className="text-[10.5px] text-[#78716c] truncate mt-0.5">
                                                                    {menu.menuItem.vendor.name}
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Hapus ${menu.menuItem.name}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleClearSlot({
                                                                            dayOfWeek: day.dayOfWeek,
                                                                            menuId: menu.id,
                                                                            menuItemId: menu.menuItem.id,
                                                                        });
                                                                    }}
                                                                    className="absolute top-1 right-1 w-5 h-5 rounded-[5px] bg-[#dc2626] text-[#fff] flex items-center justify-center border-0 cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSelectSlot(day, group)}
                                                                className={`w-full h-full min-h-[82px] rounded-[10px] border border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                                                                    isSelected
                                                                        ? 'bg-[#fffbeb] border-[#f59e0b] text-[#b45309]'
                                                                        : 'bg-transparent border-[#d6d3d1] text-[#a8a29e] hover:border-[#f59e0b] hover:text-[#b45309] hover:bg-[#fffbeb]/40'
                                                                }`}
                                                            >
                                                                <Plus className="w-4 h-4" aria-hidden="true" />
                                                                <span className="text-[11px] font-medium">
                                                                    Atur menu
                                                                </span>
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>

                        {/* Side Slot Inspector ("Atur menu") */}
                        <Card>
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-[15px] font-bold text-[#1c1917]">Atur menu</h2>
                                {selectedSlot && (
                                    <Badge variant="warning">{selectedSlot.dayName}</Badge>
                                )}
                            </div>

                            {!selectedSlot ? (
                                <div className="py-10 text-center text-[13px] text-[#78716c]">
                                    Klik salah satu kotak pada tabel mingguan di samping untuk menetapkan atau mengubah menu.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="px-3 py-2 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4]">
                                        <div className="text-[13px] font-bold text-[#1c1917]">
                                            {selectedSlot.dayName}, {formatDayShort(selectedSlot.date)}
                                        </div>
                                        <div className="text-[12px] text-[#57534e]">
                                            Istirahat {selectedSlot.group.label} ·{' '}
                                            {selectedSlot.group.shifts.map((s) => s.name).join(', ')}
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Search
                                                className="w-3.5 h-3.5 text-[#a8a29e] absolute left-2.5 top-1/2 -translate-y-1/2"
                                                aria-hidden="true"
                                            />
                                            <input
                                                type="text"
                                                value={slotSearch}
                                                onChange={(e) => setSlotSearch(e.target.value)}
                                                placeholder="Cari hidangan..."
                                                className="w-full h-9 pl-8 pr-2.5 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[12.5px] text-[#1c1917]"
                                            />
                                        </div>
                                        {availableVendors.length > 1 && (
                                            <select
                                                aria-label="Filter vendor"
                                                value={slotVendorFilter}
                                                onChange={(e) => setSlotVendorFilter(e.target.value)}
                                                className="h-9 px-2.5 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[12.5px] text-[#1c1917] max-w-[120px]"
                                            >
                                                <option value="all">Semua</option>
                                                {availableVendors.map((v) => (
                                                    <option key={v.id} value={v.id}>
                                                        {v.name}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>

                                    <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-0.5">
                                        {slotFilteredMenuItems.length > 0 ? (
                                            slotFilteredMenuItems.map((item) => {
                                                const active = pickedMenuItemId === item.id;
                                                return (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        onClick={() => setPickedMenuItemId(item.id)}
                                                        className={`w-full flex items-center gap-2.5 p-2 rounded-[10px] border text-left cursor-pointer transition-colors ${
                                                            active
                                                                ? 'bg-[#fffbeb] border-[#f59e0b]'
                                                                : 'bg-[#fff] border-[#e7e5e4] hover:bg-[#fafaf9]'
                                                        }`}
                                                    >
                                                        {item.imageUrl ? (
                                                            <img
                                                                src={item.imageUrl}
                                                                alt=""
                                                                className="w-9 h-9 rounded-[7px] object-cover flex-shrink-0"
                                                            />
                                                        ) : (
                                                            <div className="w-9 h-9 rounded-[7px] bg-[#f5f5f4] flex items-center justify-center flex-shrink-0">
                                                                <Pizza className="w-4 h-4 text-[#a8a29e]" />
                                                            </div>
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[12.5px] font-semibold text-[#1c1917] truncate">
                                                                {item.name}
                                                            </div>
                                                            <div className="text-[11px] text-[#78716c] truncate">
                                                                {item.vendor.name}
                                                            </div>
                                                        </div>
                                                        {active && (
                                                            <Check className="w-4 h-4 text-[#b45309] flex-shrink-0" />
                                                        )}
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="py-6 text-center text-[12.5px] text-[#78716c]">
                                                Tidak ada hidangan cocok.
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-2 pt-2 border-t border-[#f5f5f4]">
                                        <Button
                                            variant="primary"
                                            className="flex-1"
                                            loading={savingSlot}
                                            disabled={!pickedMenuItemId}
                                            onClick={handleSaveSlot}
                                        >
                                            Simpan
                                        </Button>
                                        {selectedSlot.existingMenu && (
                                            <Button
                                                variant="danger"
                                                onClick={() => handleClearSlot(selectedSlot)}
                                            >
                                                Kosongkan
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Daftar Menu (Catalog with client search + filter + pagination) */}
                    <Card padding="none">
                        <div className="p-4 border-b border-[#f5f5f4] flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-[15px] font-bold text-[#1c1917]">Daftar menu</h2>
                                <p className="text-[12px] text-[#78716c]">
                                    {catalogFilteredItems.length} hidangan tersedia
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative">
                                    <Search
                                        className="w-3.5 h-3.5 text-[#a8a29e] absolute left-2.5 top-1/2 -translate-y-1/2"
                                        aria-hidden="true"
                                    />
                                    <input
                                        type="text"
                                        value={catalogSearch}
                                        onChange={(e) => {
                                            setCatalogSearch(e.target.value);
                                            setCatalogPage(1);
                                        }}
                                        placeholder="Cari menu..."
                                        className="h-9 pl-8 pr-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                                    />
                                </div>
                                <select
                                    aria-label="Filter kategori"
                                    value={catalogCategoryFilter}
                                    onChange={(e) => {
                                        setCatalogCategoryFilter(e.target.value);
                                        setCatalogPage(1);
                                    }}
                                    className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                                >
                                    <option value="all">Semua kategori</option>
                                    {CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    aria-label="Filter vendor katalog"
                                    value={catalogVendorFilter}
                                    onChange={(e) => {
                                        setCatalogVendorFilter(e.target.value);
                                        setCatalogPage(1);
                                    }}
                                    className="h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] text-[#1c1917]"
                                >
                                    <option value="all">Semua vendor</option>
                                    {availableVendors.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            {v.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="p-4">
                            {pagedCatalogItems.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                    {pagedCatalogItems.map((item) => (
                                        <div
                                            key={item.id}
                                            className="group relative rounded-[12px] border border-[#e7e5e4] bg-[#fafaf9] p-2.5 flex flex-col"
                                        >
                                            {item.imageUrl ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setLightboxImage(item.imageUrl)}
                                                    className="p-0 border-0 bg-transparent cursor-pointer rounded-[8px] overflow-hidden mb-2"
                                                >
                                                    <img
                                                        src={item.imageUrl}
                                                        alt={item.name}
                                                        className="w-full h-24 object-cover"
                                                    />
                                                </button>
                                            ) : (
                                                <div className="w-full h-24 rounded-[8px] bg-[#f5f5f4] flex items-center justify-center mb-2">
                                                    <Pizza className="w-7 h-7 text-[#a8a29e]" aria-hidden="true" />
                                                </div>
                                            )}
                                            <div className="text-[13px] font-semibold text-[#1c1917] line-clamp-2 flex-1">
                                                {item.name}
                                            </div>
                                            <div className="flex items-center justify-between gap-1.5 mt-1.5">
                                                <span className="text-[11px] text-[#78716c] truncate">
                                                    {item.vendor.name}
                                                </span>
                                                {item.category && <Badge variant="neutral">{item.category}</Badge>}
                                            </div>
                                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                                <button
                                                    type="button"
                                                    aria-label={`Edit ${item.name}`}
                                                    onClick={() => openMenuItemForm(item)}
                                                    className="w-7 h-7 rounded-[7px] bg-[#fff] border border-[#e7e5e4] text-[#1c1917] flex items-center justify-center cursor-pointer shadow-sm"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={`Hapus ${item.name}`}
                                                    onClick={() => setDeleteMenuTarget(item)}
                                                    className="w-7 h-7 rounded-[7px] bg-[#dc2626] text-[#fff] border-0 flex items-center justify-center cursor-pointer shadow-sm"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState
                                    icon={<Pizza className="w-6 h-6" />}
                                    title="Belum ada hidangan cocok"
                                    description="Tambahkan menu baru atau ubah kata kunci pencarian."
                                />
                            )}
                        </div>

                        {catalogFilteredItems.length > CATALOG_LIMIT && (
                            <Pagination
                                page={catalogPage}
                                limit={CATALOG_LIMIT}
                                total={catalogFilteredItems.length}
                                onPageChange={setCatalogPage}
                                variant="user"
                            />
                        )}
                    </Card>
                </>
            )}

            {/* Add / Edit Menu Item Modal */}
            <Modal
                open={showMenuItemForm}
                onClose={() => setShowMenuItemForm(false)}
                title={editingMenuItem ? 'Edit menu' : 'Tambah menu baru'}
                size="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowMenuItemForm(false)}>
                            Batal
                        </Button>
                        <Button variant="primary" loading={savingMenuItem} onClick={saveMenuItem}>
                            Simpan menu
                        </Button>
                    </>
                }
            >
                <form onSubmit={saveMenuItem} className="space-y-3">
                    <Field label="Nama menu" required>
                        <Input
                            value={menuItemForm.name}
                            onChange={(e) => setMenuItemForm((f) => ({ ...f, name: e.target.value }))}
                            placeholder="Contoh: Nasi Goreng Spesial"
                        />
                    </Field>
                    <Field label="Vendor" required>
                        <Select
                            value={menuItemForm.vendorId}
                            onChange={(e) => setMenuItemForm((f) => ({ ...f, vendorId: e.target.value }))}
                        >
                            <option value="">Pilih vendor...</option>
                            {vendors.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.name}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Kategori">
                        <Select
                            value={menuItemForm.category}
                            onChange={(e) => setMenuItemForm((f) => ({ ...f, category: e.target.value }))}
                        >
                            <option value="">Pilih kategori...</option>
                            {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </Select>
                    </Field>
                    <Field label="Deskripsi">
                        <Textarea
                            rows={2}
                            value={menuItemForm.description}
                            onChange={(e) => setMenuItemForm((f) => ({ ...f, description: e.target.value }))}
                            placeholder="Keterangan singkat..."
                        />
                    </Field>
                    <Field label="Foto">
                        <label className="flex items-center gap-2 px-3 py-2 border border-[#e7e5e4] rounded-[9px] cursor-pointer hover:bg-[#fafaf9] text-[13px] text-[#57534e]">
                            <ImageIcon className="w-4 h-4 text-[#78716c]" aria-hidden="true" />
                            <span className="truncate">{imageFile ? imageFile.name : 'Pilih gambar...'}</span>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                                className="hidden"
                            />
                        </label>
                    </Field>
                </form>
            </Modal>

            {/* Delete Menu Item Modal */}
            <Modal
                open={Boolean(deleteMenuTarget)}
                onClose={() => setDeleteMenuTarget(null)}
                title="Hapus hidangan?"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteMenuTarget(null)}>
                            Batal
                        </Button>
                        <Button variant="danger" onClick={confirmDeleteMenuItem}>
                            Hapus
                        </Button>
                    </>
                }
            >
                <p className="text-[13.5px] text-[#57534e]">
                    Hapus <b>{deleteMenuTarget?.name}</b>? Jadwal mingguan yang memakai menu ini juga akan ikut terhapus.
                </p>
            </Modal>

            {/* Copy to Another Week Modal */}
            <Modal
                open={showCopyModal}
                onClose={() => setShowCopyModal(false)}
                title="Salin jadwal ke minggu lain"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowCopyModal(false)}>
                            Batal
                        </Button>
                        <Button variant="primary" onClick={copyWeekToTarget}>
                            Salin jadwal
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <Field label="Minggu tujuan (1–53)" required>
                        <Input
                            type="number"
                            min={1}
                            max={53}
                            value={copyTarget.week}
                            onChange={(e) =>
                                setCopyTarget((t) => ({ ...t, week: parseInt(e.target.value, 10) || 1 }))
                            }
                        />
                    </Field>
                    <Field label="Tahun tujuan" required>
                        <Input
                            type="number"
                            value={copyTarget.year}
                            onChange={(e) =>
                                setCopyTarget((t) => ({ ...t, year: parseInt(e.target.value, 10) || 2026 }))
                            }
                        />
                    </Field>
                </div>
            </Modal>

            {/* Lightbox Modal */}
            <Modal
                open={Boolean(lightboxImage)}
                onClose={() => setLightboxImage(null)}
                title="Pratinjau foto menu"
                size="lg"
            >
                {lightboxImage && (
                    <img
                        src={lightboxImage}
                        alt="Pratinjau menu"
                        className="w-full max-h-[65vh] object-contain rounded-[10px]"
                    />
                )}
            </Modal>
        </div>
    );
}
