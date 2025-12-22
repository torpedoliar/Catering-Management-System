import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Copy, Trash2, Pizza, Store, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

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
}

export default function WeeklyMenuPage() {
    const { token } = useAuth();
    const [weekData, setWeekData] = useState<{ week: number; year: number; weekStart: string; weekEnd: string; shifts: Shift[]; dailyMenus: DailyMenuData[] } | null>(null);
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedWeek, setSelectedWeek] = useState<{ week: number; year: number } | null>(null);
    const [showMenuSelector, setShowMenuSelector] = useState<{ dayOfWeek: number; shiftId: string | null } | null>(null);
    const [showCopyModal, setShowCopyModal] = useState(false);
    const [copyTarget, setCopyTarget] = useState({ week: 1, year: 2025 });
    const [menuMode, setMenuMode] = useState<'SAME_ALL_SHIFTS' | 'DIFFERENT_PER_SHIFT'>('SAME_ALL_SHIFTS');

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3012';

    useEffect(() => {
        loadData();
    }, [selectedWeek]);

    const loadData = async () => {
        setLoading(true);
        try {
            const weekParam = selectedWeek ? `?week=${selectedWeek.week}&year=${selectedWeek.year}` : '';
            const [weekRes, menuRes] = await Promise.all([
                fetch(`${API_URL}/api/weekly-menu${weekParam}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${API_URL}/api/menu-items`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);

            if (weekRes.ok) {
                const data = await weekRes.json();
                setWeekData(data);
                if (!selectedWeek) {
                    setSelectedWeek({ week: data.week, year: data.year });
                    setCopyTarget({ week: data.week + 1, year: data.year });
                }
            }
            if (menuRes.ok) setMenuItems(await menuRes.json());
        } catch (error) {
            console.error('Load data error:', error);
        } finally {
            setLoading(false);
        }
    };

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
            await fetch(`${API_URL}/api/weekly-menu`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    weekNumber: selectedWeek.week,
                    year: selectedWeek.year,
                    dayOfWeek,
                    shiftId: menuMode === 'DIFFERENT_PER_SHIFT' ? shiftId : null,
                    menuMode,
                    menuItemId
                })
            });
            setShowMenuSelector(null);
            loadData();
        } catch (error) {
            console.error('Set menu error:', error);
        }
    };

    const deleteMenu = async (menuId: string) => {
        if (!confirm('Hapus menu ini?')) return;

        try {
            await fetch(`${API_URL}/api/weekly-menu/${menuId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            loadData();
        } catch (error) {
            console.error('Delete menu error:', error);
        }
    };

    const copyWeek = async () => {
        if (!selectedWeek) return;

        try {
            const res = await fetch(`${API_URL}/api/weekly-menu/copy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    fromWeek: selectedWeek.week,
                    fromYear: selectedWeek.year,
                    toWeek: copyTarget.week,
                    toYear: copyTarget.year
                })
            });

            if (res.ok) {
                const data = await res.json();
                alert(data.message);
                setShowCopyModal(false);
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to copy week');
            }
        } catch (error) {
            console.error('Copy week error:', error);
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
                <button onClick={() => setShowCopyModal(true)} className="btn-secondary flex items-center gap-2">
                    <Copy className="w-4 h-4" />
                    Copy ke Minggu Lain
                </button>
            </div>

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
                                                                <img src={`${API_URL}${menu.menuItem.imageUrl}`} alt="" className="w-full h-16 object-cover rounded mb-2" />
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

            {/* Menu Selector Modal */}
            {showMenuSelector && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
                        <div className="p-4 border-b border-slate-100">
                            <h2 className="text-lg font-semibold text-slate-800">Pilih Menu</h2>
                        </div>
                        <div className="p-4 overflow-y-auto max-h-[60vh]">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {menuItems.map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => setMenu(showMenuSelector.dayOfWeek, showMenuSelector.shiftId, item.id)}
                                        className="p-3 border border-slate-200 rounded-xl hover:border-teal-400 hover:bg-teal-50 transition-colors text-left"
                                    >
                                        {item.imageUrl && (
                                            <img src={`${API_URL}${item.imageUrl}`} alt="" className="w-full h-20 object-cover rounded-lg mb-2" />
                                        )}
                                        <p className="text-sm font-medium text-slate-800 line-clamp-2">{item.name}</p>
                                        <p className="text-xs text-slate-400 mt-1">{item.vendor.name}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100">
                            <button onClick={() => setShowMenuSelector(null)} className="w-full btn-secondary">
                                Batal
                            </button>
                        </div>
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
