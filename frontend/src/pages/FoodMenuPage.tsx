import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Store, Pizza, UtensilsCrossed } from 'lucide-react';
import { api } from '../contexts/AuthContext';
import { useSSERefresh, MENU_EVENTS } from '../contexts/SSEContext';

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

// ImageLightbox Component with Zoom Controls
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);

    const zoomIn = () => setScale(s => Math.min(s + 0.25, 3));
    const zoomOut = () => setScale(s => Math.max(s - 0.25, 0.5));
    const resetZoom = () => { setScale(1); setRotation(0); };
    const rotate = () => setRotation(r => (r + 90) % 360);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
            onClick={onClose}
        >
            {/* Close Button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors z-10"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            {/* Image Container */}
            <div
                className="relative overflow-hidden max-w-[90vw] max-h-[80vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <img
                    src={src}
                    alt="Menu Preview"
                    className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl transition-transform duration-200"
                    style={{
                        transform: `scale(${scale}) rotate(${rotation}deg)`,
                    }}
                    draggable={false}
                />
            </div>

            {/* Zoom Controls Toolbar */}
            <div
                className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1.5 bg-black/60 backdrop-blur-md rounded-full shadow-lg"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={zoomIn}
                    className="p-2.5 text-white hover:bg-white/20 rounded-full transition-colors"
                    title="Zoom In"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
                    </svg>
                </button>
                <button
                    onClick={zoomOut}
                    className="p-2.5 text-white hover:bg-white/20 rounded-full transition-colors"
                    title="Zoom Out"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35M8 11h6" />
                    </svg>
                </button>
                <button
                    onClick={resetZoom}
                    className="p-2.5 text-white hover:bg-white/20 rounded-full transition-colors"
                    title="Reset"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                    </svg>
                </button>
                <button
                    onClick={rotate}
                    className="p-2.5 text-white hover:bg-white/20 rounded-full transition-colors"
                    title="Rotate"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                        <path d="M21 3v5h-5" />
                    </svg>
                </button>
            </div>

            {/* Zoom Level Indicator */}
            <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full text-white text-sm">
                {Math.round(scale * 100)}%
            </div>

            {/* Label */}
            <div className="absolute bottom-6 left-4 text-white/70 text-sm">
                Menu Preview
            </div>
        </div>
    );
}

export default function FoodMenuPage() {
    const [weekData, setWeekData] = useState<{ week: number; year: number; weekStart: string; weekEnd: string; shifts: Shift[]; dailyMenus: DailyMenuData[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedWeek, setSelectedWeek] = useState<{ week: number; year: number } | null>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [selectedWeek]);

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

    // SSE integration for real-time updates
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
                                                        className="w-24 h-24 object-cover rounded-lg flex-shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                                                        onClick={() => setSelectedImage(menu.menuItem.imageUrl)}
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

            {/* Image Lightbox with Zoom Controls */}
            {selectedImage && (
                <ImageLightbox
                    src={selectedImage}
                    onClose={() => setSelectedImage(null)}
                />
            )}
        </div>
    );
}
