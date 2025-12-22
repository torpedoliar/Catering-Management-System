import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Store, Pizza, UtensilsCrossed } from 'lucide-react';
import { api } from '../contexts/AuthContext';

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

export default function FoodMenuPage() {
    const [weekData, setWeekData] = useState<{ week: number; year: number; weekStart: string; weekEnd: string; shifts: Shift[]; dailyMenus: DailyMenuData[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedWeek, setSelectedWeek] = useState<{ week: number; year: number } | null>(null);

    useEffect(() => {
        loadData();
    }, [selectedWeek]);

    const loadData = async () => {
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

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
    };

    const isToday = (dateStr: string) => {
        const today = new Date().toISOString().split('T')[0];
        return dateStr === today;
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
            <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <UtensilsCrossed className="w-7 h-7 text-teal-500" />
                    Menu Makanan
                </h1>
                <p className="text-slate-500">Lihat menu makanan mingguan</p>
            </div>

            {/* Week Navigator */}
            <div className="card p-4">
                <div className="flex items-center justify-between">
                    <button onClick={() => navigateWeek(-1)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                        <ChevronLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-2 text-teal-600">
                            <Calendar className="w-5 h-5" />
                            <span className="font-semibold">Week {selectedWeek?.week}, {selectedWeek?.year}</span>
                        </div>
                        {weekData && (
                            <p className="text-sm text-slate-500 mt-1">
                                {formatDate(weekData.weekStart)} - {formatDate(weekData.weekEnd)}
                            </p>
                        )}
                    </div>
                    <button onClick={() => navigateWeek(1)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                        <ChevronRight className="w-5 h-5 text-slate-600" />
                    </button>
                </div>
            </div>

            {/* Daily Menus */}
            {weekData && (
                <div className="space-y-4">
                    {weekData.dailyMenus.map(day => (
                        <div
                            key={day.date}
                            className={`card overflow-hidden ${isToday(day.date) ? 'ring-2 ring-teal-500' : ''}`}
                        >
                            <div className={`px-4 py-3 ${isToday(day.date) ? 'bg-teal-500 text-white' : 'bg-slate-50'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Calendar className={`w-4 h-4 ${isToday(day.date) ? 'text-white' : 'text-slate-400'}`} />
                                        <span className="font-semibold">{day.dayName}</span>
                                        {isToday(day.date) && (
                                            <span className="px-2 py-0.5 bg-white/20 rounded text-xs">Hari Ini</span>
                                        )}
                                    </div>
                                    <span className={`text-sm ${isToday(day.date) ? 'text-white/80' : 'text-slate-500'}`}>
                                        {formatDate(day.date)}
                                    </span>
                                </div>
                            </div>

                            <div className="p-4">
                                {day.menus.length > 0 ? (
                                    <div className="space-y-3">
                                        {day.menus.map(menu => (
                                            <div key={menu.id} className="flex gap-4 p-3 bg-slate-50 rounded-xl">
                                                {menu.menuItem.imageUrl ? (
                                                    <img
                                                        src={menu.menuItem.imageUrl}
                                                        alt={menu.menuItem.name}
                                                        className="w-24 h-24 object-cover rounded-lg flex-shrink-0"
                                                    />
                                                ) : (
                                                    <div className="w-24 h-24 bg-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                                                        <Pizza className="w-8 h-8 text-slate-400" />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    {menu.shiftName && (
                                                        <span className="inline-block px-2 py-0.5 bg-teal-100 text-teal-700 text-xs rounded mb-1">
                                                            {menu.shiftName}
                                                        </span>
                                                    )}
                                                    <h3 className="font-semibold text-slate-800">{menu.menuItem.name}</h3>
                                                    {menu.menuItem.description && (
                                                        <p className="text-sm text-slate-500 mt-1 line-clamp-2">{menu.menuItem.description}</p>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-2">
                                                        {menu.menuItem.vendor.logoUrl ? (
                                                            <img
                                                                src={menu.menuItem.vendor.logoUrl}
                                                                alt={menu.menuItem.vendor.name}
                                                                className="w-5 h-5 rounded object-cover"
                                                            />
                                                        ) : (
                                                            <Store className="w-4 h-4 text-slate-400" />
                                                        )}
                                                        <span className="text-xs text-slate-500">{menu.menuItem.vendor.name}</span>
                                                    </div>
                                                    {menu.notes && (
                                                        <p className="text-xs text-amber-600 mt-2 italic">{menu.notes}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-slate-400">
                                        <Pizza className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">Belum ada menu</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {weekData && weekData.dailyMenus.every(d => d.menus.length === 0) && (
                <div className="text-center py-12">
                    <UtensilsCrossed className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                    <p className="text-slate-500">Belum ada menu untuk minggu ini</p>
                    <p className="text-sm text-slate-400 mt-1">Menu akan ditampilkan setelah diatur oleh admin</p>
                </div>
            )}
        </div>
    );
}
