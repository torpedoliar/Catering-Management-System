import { useState, useEffect, useCallback } from 'react';
import { Store, UtensilsCrossed, ZoomIn, ZoomOut, RotateCcw, RotateCw, X } from 'lucide-react';
import { api } from '../contexts/AuthContext';
import { useSSERefresh, MENU_EVENTS } from '../contexts/SSEContext';
import { getLocalDateString, formatOrderDate } from '../utils/dateHelpers';
import { Card, PageHeader, Badge, EmptyState, SkeletonCard } from '../components/ui';

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

interface MenuGroup {
    key: string;
    label: string;
    shiftNames: string[];
    menus: DayMenu[];
    isGrouped: boolean;
}

const MONTH_LONG = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatIndoDate(dateStr: string): string {
    const key = formatOrderDate(dateStr);
    const [, m, d] = key.split('-').map(Number);
    if (!m || !d) return key;
    return `${d} ${MONTH_LONG[m - 1] || ''}`;
}

const groupMenusByBreakTime = (menus: DayMenu[], shifts: Shift[]): MenuGroup[] => {
    const groups: Map<string, DayMenu[]> = new Map();
    const shiftMap = new Map(shifts.map((s) => [s.id, s]));

    menus.forEach((menu) => {
        const shift = menu.shiftId ? shiftMap.get(menu.shiftId) : null;
        const key =
            shift?.breakStartTime && shift?.breakEndTime
                ? `${shift.breakStartTime}–${shift.breakEndTime}`
                : menu.shiftId
                    ? `_shift_${menu.shiftId}`
                    : '_no_shift';

        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(menu);
    });

    return Array.from(groups.entries())
        .map(([key, menusInGroup]) => {
            const shiftNames = [...new Set(menusInGroup.map((m) => m.shiftName).filter(Boolean))] as string[];
            return {
                key,
                label: key.startsWith('_') ? shiftNames[0] || 'Menu' : key,
                shiftNames,
                menus: menusInGroup,
                isGrouped: !key.startsWith('_'),
            };
        })
        .sort((a, b) => {
            const timeA = a.key.startsWith('_') ? '99:99' : a.key;
            const timeB = b.key.startsWith('_') ? '99:99' : b.key;
            return timeA.localeCompare(timeB);
        });
};

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Pratinjau foto menu"
            className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(28,25,23,0.85)]"
            onClick={onClose}
        >
            <button
                type="button"
                aria-label="Tutup pratinjau"
                onClick={onClose}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[rgba(0,0,0,0.5)] text-[#fff] flex items-center justify-center border-0 cursor-pointer hover:bg-[rgba(0,0,0,0.7)]"
            >
                <X className="w-5 h-5" aria-hidden="true" />
            </button>

            <div className="relative overflow-hidden max-w-[90vw] max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
                <img
                    src={src}
                    alt="Pratinjau menu"
                    className="max-w-full max-h-[80vh] object-contain rounded-[10px] transition-transform duration-200"
                    style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
                    draggable={false}
                />
            </div>

            <div
                className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1.5 bg-[rgba(28,25,23,0.8)] rounded-full"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    aria-label="Perbesar"
                    onClick={() => setScale((s) => Math.min(s + 0.25, 3))}
                    className="p-2.5 text-[#fff] bg-transparent border-0 rounded-full cursor-pointer hover:bg-[rgba(255,255,255,0.15)]"
                >
                    <ZoomIn className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    aria-label="Perkecil"
                    onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))}
                    className="p-2.5 text-[#fff] bg-transparent border-0 rounded-full cursor-pointer hover:bg-[rgba(255,255,255,0.15)]"
                >
                    <ZoomOut className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    aria-label="Reset zoom"
                    onClick={() => {
                        setScale(1);
                        setRotation(0);
                    }}
                    className="p-2.5 text-[#fff] bg-transparent border-0 rounded-full cursor-pointer hover:bg-[rgba(255,255,255,0.15)]"
                >
                    <RotateCcw className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    aria-label="Putar gambar"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    className="p-2.5 text-[#fff] bg-transparent border-0 rounded-full cursor-pointer hover:bg-[rgba(255,255,255,0.15)]"
                >
                    <RotateCw className="w-4 h-4" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

export default function FoodMenuPage() {
    const [weekData, setWeekData] = useState<{
        week: number;
        year: number;
        weekStart: string;
        weekEnd: string;
        shifts: Shift[];
        dailyMenus: DailyMenuData[];
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedWeek, setSelectedWeek] = useState<{ week: number; year: number } | null>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const weekParam = selectedWeek ? `?week=${selectedWeek.week}&year=${selectedWeek.year}` : '';
            const res = await api.get(`/api/weekly-menu${weekParam}`);
            if (res.data) {
                setWeekData(res.data);
                if (!selectedWeek) {
                    setSelectedWeek({ week: res.data.week, year: res.data.year });
                }
            }
        } catch (error) {
            console.error('Load menu error:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedWeek]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useSSERefresh(MENU_EVENTS, loadData);

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

    const todayKey = getLocalDateString();

    if (loading && !weekData) {
        return (
            <div className="max-w-[1080px] space-y-4">
                <SkeletonCard lines={2} />
                <SkeletonCard lines={4} />
                <SkeletonCard lines={4} />
            </div>
        );
    }

    return (
        <div className="max-w-[1080px] w-full space-y-[18px]">
            <PageHeader
                title="Lihat menu"
                subtitle={
                    weekData
                        ? `Minggu ${weekData.week}, ${weekData.year} · ${formatIndoDate(weekData.weekStart)}–${formatIndoDate(weekData.weekEnd)}`
                        : 'Jadwal menu mingguan'
                }
                actions={
                    <div className="inline-flex items-center border border-[#e7e5e4] bg-[#fff] rounded-[10px] h-[38px]">
                        <button
                            type="button"
                            aria-label="Minggu sebelumnya"
                            onClick={() => navigateWeek(-1)}
                            className="w-[38px] h-9 border-0 bg-transparent cursor-pointer text-[16px] text-[#44403c] hover:bg-[#fafaf9] rounded-l-[10px]"
                        >
                            ‹
                        </button>
                        <span className="px-3 text-[13px] font-semibold text-[#1c1917] border-x border-[#f0efed] leading-9 tabular-nums">
                            Minggu {selectedWeek?.week || '-'}
                        </span>
                        <button
                            type="button"
                            aria-label="Minggu berikutnya"
                            onClick={() => navigateWeek(1)}
                            className="w-[38px] h-9 border-0 bg-transparent cursor-pointer text-[16px] text-[#44403c] hover:bg-[#fafaf9] rounded-r-[10px]"
                        >
                            ›
                        </button>
                    </div>
                }
            />

            {weekData && (
                <div className="space-y-3.5">
                    {weekData.dailyMenus.map((day) => {
                        const isToday = formatOrderDate(day.date) === todayKey;
                        const groups = groupMenusByBreakTime(day.menus, weekData.shifts);

                        return (
                            <Card
                                key={day.date}
                                padding="none"
                                className={`overflow-hidden ${isToday ? 'border-2 border-[#f59e0b]' : ''}`}
                            >
                                <div
                                    className={`px-5 py-3 flex items-center justify-between border-b ${
                                        isToday
                                            ? 'bg-[#fffbeb] border-[#fef3c7]'
                                            : 'bg-[#fafaf9] border-[#f0efed]'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-[14.5px] text-[#1c1917]">{day.dayName}</span>
                                        {isToday && <Badge variant="warning">Hari ini</Badge>}
                                    </div>
                                    <span className="text-[13px] text-[#78716c] font-medium">
                                        {formatIndoDate(day.date)}
                                    </span>
                                </div>

                                <div className="p-4 md:p-5">
                                    {groups.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {groups.map((group) => {
                                                const displayMenu = group.menus[0];
                                                return (
                                                    <div
                                                        key={group.key}
                                                        className="flex gap-3 p-3 rounded-[12px] border border-[#f0efed] bg-[#fafaf9]"
                                                    >
                                                        {displayMenu.menuItem.imageUrl ? (
                                                            <button
                                                                type="button"
                                                                aria-label={`Perbesar foto ${displayMenu.menuItem.name}`}
                                                                onClick={() => setSelectedImage(displayMenu.menuItem.imageUrl)}
                                                                className="w-20 h-20 rounded-[9px] overflow-hidden flex-shrink-0 border-0 p-0 bg-transparent cursor-zoom-in"
                                                            >
                                                                <img
                                                                    src={displayMenu.menuItem.imageUrl}
                                                                    alt={displayMenu.menuItem.name}
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            </button>
                                                        ) : (
                                                            <div className="w-20 h-20 bg-[#f5f5f4] rounded-[9px] flex items-center justify-center flex-shrink-0 text-[#a8a29e]">
                                                                <UtensilsCrossed className="w-6 h-6" aria-hidden="true" />
                                                            </div>
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex flex-wrap gap-1 mb-1">
                                                                <span className="inline-block px-2 py-0.5 bg-[#fef3c7] text-[#92400e] text-[11px] rounded-full font-bold tabular-nums">
                                                                    {group.label}
                                                                </span>
                                                                {group.isGrouped && group.shiftNames.length > 0 && (
                                                                    <span className="inline-block px-2 py-0.5 bg-[#f5f5f4] text-[#57534e] text-[11px] rounded-full font-medium">
                                                                        {group.shiftNames.join(', ')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <h3 className="m-0 font-bold text-[13.5px] text-[#1c1917] leading-snug line-clamp-2">
                                                                {displayMenu.menuItem.name}
                                                            </h3>
                                                            {displayMenu.menuItem.description && (
                                                                <p className="m-0 text-[12px] text-[#78716c] mt-1 line-clamp-2">
                                                                    {displayMenu.menuItem.description}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center gap-1.5 mt-1.5 text-[11.5px] text-[#78716c]">
                                                                <Store className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                                                                <span className="truncate">{displayMenu.menuItem.vendor.name}</span>
                                                            </div>
                                                            {displayMenu.notes && (
                                                                <p className="m-0 text-[11.5px] text-[#b45309] mt-1">
                                                                    {displayMenu.notes}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="m-0 py-4 text-center text-[13px] text-[#a8a29e]">
                                            Belum ada menu untuk hari ini.
                                        </p>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {weekData && weekData.dailyMenus.every((d) => d.menus.length === 0) && (
                <Card>
                    <EmptyState
                        title="Belum ada menu untuk minggu ini"
                        description="Menu akan ditampilkan setelah diatur oleh admin."
                    />
                </Card>
            )}

            {selectedImage && <ImageLightbox src={selectedImage} onClose={() => setSelectedImage(null)} />}
        </div>
    );
}
