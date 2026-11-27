import { ReactNode, useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Menu,
    X,
    Search,
    PanelLeftClose,
    PanelLeftOpen,
    Settings,
    Info,
    FileText,
    LogOut,
    ChevronDown,
} from 'lucide-react';
import { useAuth, api } from '../../contexts/AuthContext';
import { useSSE } from '../../contexts/SSEContext';
import { getLocalDateString, addDays, formatOrderDate, formatOrderTime } from '../../utils/dateHelpers';
import NotificationBell from './NotificationBell';
import CommandPalette from './CommandPalette';
import MobileBottomNav from './MobileBottomNav';
import { getVisibleGroupsForRole, getRouteBreadcrumb, UserRole } from './navConfig';

interface LayoutProps {
    children: ReactNode;
}

const ROLE_LABELS: Record<UserRole, string> = {
    USER: 'Karyawan',
    ADMIN: 'Admin',
    CANTEEN: 'Operator',
    VENDOR: 'Vendor',
};

function getInitials(name?: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

export default function Layout({ children }: LayoutProps) {
    const { user, logout } = useAuth();
    const { isConnected, connectedClients } = useSSE();
    const location = useLocation();

    const isCheckinPage = location.pathname === '/canteen/checkin';
    const isEmployeeRole = user?.role === 'USER';

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    const [collapsedPref, setCollapsedPref] = useState(() => {
        try {
            return localStorage.getItem('sidebar-collapsed') === 'true';
        } catch {
            return false;
        }
    });
    // Check-in opens collapsed by default to preserve 14-inch screen space (SPEC.md §3)
    const [checkinOverride, setCheckinOverride] = useState<boolean | null>(null);
    const isCollapsed = isCheckinPage ? (checkinOverride ?? true) : collapsedPref;

    const [branding, setBranding] = useState<{ logoUrl?: string | null; appShortName?: string }>({});
    const [tomorrowCutoffText, setTomorrowCutoffText] = useState<string | null>(null);

    const toggleCollapse = () => {
        if (isCheckinPage) {
            setCheckinOverride(!isCollapsed);
            return;
        }
        const next = !collapsedPref;
        setCollapsedPref(next);
        try {
            localStorage.setItem('sidebar-collapsed', String(next));
        } catch {
            /* ignore storage errors */
        }
    };

    // Reset temporary check-in override when leaving check-in
    useEffect(() => {
        if (!isCheckinPage) {
            setCheckinOverride(null);
        }
    }, [isCheckinPage]);

    // Scroll to top on route change
    useEffect(() => {
        window.scrollTo(0, 0);
        setDrawerOpen(false);
        setProfileOpen(false);
    }, [location.pathname]);

    // Ctrl+K / Cmd+K shortcut for Command Palette
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setPaletteOpen((prev) => !prev);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    // Close profile dropdown on outside click / Esc
    useEffect(() => {
        if (!profileOpen) return;
        const onDocClick = (e: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setProfileOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setProfileOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [profileOpen]);

    // Fetch branding
    useEffect(() => {
        const apiUrl = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || '';
        fetch(`${apiUrl}/api/settings/branding`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data) setBranding(data);
            })
            .catch(() => {});
    }, []);

    // Fetch tomorrow's cutoff chip for USER role
    useEffect(() => {
        if (user?.role !== 'USER') {
            setTomorrowCutoffText(null);
            return;
        }
        let cancelled = false;
        const todayStr = getLocalDateString();
        const tomorrowStr = addDays(todayStr, 1);

        interface ShiftCutoffInfo {
            canOrder?: boolean;
            cutoffTime?: string;
        }

        api.get(`/api/shifts/for-user?date=${tomorrowStr}`)
            .then((res) => {
                if (cancelled) return;
                const data = res.data as {
                    cutoffMode?: string;
                    weeklyCutoffTime?: string;
                    shifts?: ShiftCutoffInfo[];
                };
                let isoCutoff: string | null = null;

                if (data?.cutoffMode === 'weekly' && data?.weeklyCutoffTime) {
                    isoCutoff = data.weeklyCutoffTime;
                } else if (Array.isArray(data?.shifts) && data.shifts.length > 0) {
                    const activeShifts = data.shifts.filter((s) => s.canOrder && s.cutoffTime);
                    const pool = activeShifts.length > 0 ? activeShifts : data.shifts;
                    const sorted = [...pool]
                        .filter((s) => Boolean(s.cutoffTime))
                        .sort((a, b) => String(a.cutoffTime).localeCompare(String(b.cutoffTime)));
                    isoCutoff = sorted[0]?.cutoffTime || null;
                }

                if (!isoCutoff) {
                    setTomorrowCutoffText(null);
                    return;
                }
                const cDate = formatOrderDate(isoCutoff);
                const cTime = formatOrderTime(isoCutoff);
                if (cDate === '-' || cTime === '-') {
                    setTomorrowCutoffText(null);
                    return;
                }
                const dayLabel =
                    cDate === todayStr
                        ? 'hari ini'
                        : cDate === tomorrowStr
                            ? 'besok'
                            : cDate;
                setTomorrowCutoffText(`Batas pesan besok: ${dayLabel} ${cTime}`);
            })
            .catch(() => {
                if (!cancelled) setTomorrowCutoffText(null);
            });

        return () => {
            cancelled = true;
        };
    }, [user?.role]);

    const role = user?.role as UserRole | undefined;
    const navGroups = getVisibleGroupsForRole(role);
    const breadcrumb = getRouteBreadcrumb(location.pathname, role);
    const subtitleLabel =
        role === 'CANTEEN'
            ? 'Operator kantin'
            : role === 'VENDOR'
                ? 'Vendor Katering'
                : 'PT Santos Jaya Abadi';

    const isRouteActive = (path: string) => location.pathname === path;

    const renderSidebarInner = (railMode: boolean, isMobileDrawer = false) => (
        <div
            className={`flex flex-col h-full bg-[#0f172a] text-[#cbd5e1] select-none ${
                railMode ? 'items-center py-5 px-0' : 'py-5 px-3.5'
            }`}
        >
            {/* Brand */}
            <div
                className={`flex items-center ${
                    railMode ? 'justify-center mb-3.5' : 'justify-between px-2 pb-[18px]'
                }`}
            >
                <Link
                    to={role === 'VENDOR' ? '/vendor' : role === 'CANTEEN' ? '/canteen/checkin' : '/'}
                    className="flex items-center gap-2.5 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] rounded-[10px]"
                    aria-label="Beranda Catering"
                >
                    {branding.logoUrl ? (
                        <img
                            src={branding.logoUrl}
                            alt=""
                            className="w-[34px] h-[34px] rounded-[10px] object-contain bg-[#fff] p-0.5 flex-shrink-0"
                        />
                    ) : (
                        <div className="w-[34px] h-[34px] rounded-[10px] bg-[#f59e0b] text-[#1c1917] flex items-center justify-center font-extrabold text-[15px] flex-shrink-0">
                            {(branding.appShortName || 'C').charAt(0).toUpperCase()}
                        </div>
                    )}
                    {!railMode && (
                        <div className="min-w-0">
                            <div className="text-[#fff] font-bold text-[15px] leading-tight truncate">
                                {branding.appShortName || 'Catering'}
                            </div>
                            <div className="text-[11px] text-[#94a3b8] leading-tight truncate">
                                {subtitleLabel}
                            </div>
                        </div>
                    )}
                </Link>
                {isMobileDrawer && (
                    <button
                        type="button"
                        aria-label="Tutup menu navigasi"
                        onClick={() => setDrawerOpen(false)}
                        className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[#94a3b8] hover:text-[#fff] hover:bg-[rgba(255,255,255,0.08)] border-0 bg-transparent cursor-pointer"
                    >
                        <X className="w-5 h-5" aria-hidden="true" />
                    </button>
                )}
            </div>

            {/* Navigation */}
            <nav
                aria-label="Navigasi samping"
                className={`flex-1 overflow-y-auto overflow-x-hidden ${
                    railMode ? 'flex flex-col items-center gap-1.5 w-full px-2' : 'space-y-1'
                }`}
            >
                {navGroups.map((group, gIdx) => (
                    <div key={group.id} className={railMode ? 'flex flex-col items-center gap-1.5 w-full' : ''}>
                        {railMode ? (
                            gIdx > 0 && (
                                <div
                                    aria-hidden="true"
                                    className="w-7 h-px bg-[rgba(255,255,255,0.08)] my-1"
                                />
                            )
                        ) : (
                            <div className="px-2.5 pt-3.5 pb-1.5 text-[11px] font-bold tracking-[0.08em] text-[#64748b] uppercase first:pt-1">
                                {group.label}
                            </div>
                        )}

                        {group.items.map((item) => {
                            const Icon = item.icon;
                            const active = isRouteActive(item.path);
                            if (railMode) {
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        aria-label={item.label}
                                        title={item.label}
                                        className={`w-11 h-11 rounded-[10px] flex items-center justify-center no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] ${
                                            active
                                                ? 'bg-[rgba(245,158,11,0.16)] text-[#fbbf24]'
                                                : 'text-[#94a3b8] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#fff]'
                                        }`}
                                    >
                                        <Icon className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
                                    </Link>
                                );
                            }

                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => isMobileDrawer && setDrawerOpen(false)}
                                    className={`flex items-center gap-2.5 px-2.5 py-[9px] rounded-[9px] text-[13.5px] no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] ${
                                        active
                                            ? 'bg-[rgba(245,158,11,0.14)] text-[#fbbf24] font-bold'
                                            : 'text-[#cbd5e1] font-medium hover:bg-[rgba(255,255,255,0.06)] hover:text-[#fff]'
                                    }`}
                                >
                                    <Icon
                                        className="w-[18px] h-[18px] flex-shrink-0"
                                        strokeWidth={1.8}
                                        aria-hidden="true"
                                    />
                                    <span className="flex-1 truncate">{item.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div
                className={`mt-3 pt-3 border-t border-[rgba(255,255,255,0.08)] ${
                    railMode ? 'flex flex-col items-center w-full px-2' : 'space-y-2'
                }`}
            >
                {!railMode && isEmployeeRole && (
                    <div className="px-2.5 text-[12px] text-[#94a3b8]">
                        Bantuan: hubungi Admin Kantin
                    </div>
                )}

                {!isMobileDrawer && (
                    <button
                        type="button"
                        onClick={toggleCollapse}
                        aria-label={railMode ? 'Perluas sidebar' : 'Ciutkan sidebar'}
                        title={railMode ? 'Perluas sidebar' : 'Ciutkan sidebar'}
                        className={`flex items-center gap-2.5 rounded-[9px] text-[13px] font-medium text-[#94a3b8] hover:text-[#fff] hover:bg-[rgba(255,255,255,0.06)] border-0 bg-transparent cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] ${
                            railMode ? 'w-11 h-11 justify-center' : 'w-full px-2.5 py-2'
                        }`}
                    >
                        {railMode ? (
                            <PanelLeftOpen className="w-[18px] h-[18px]" aria-hidden="true" />
                        ) : (
                            <>
                                <PanelLeftClose className="w-[18px] h-[18px]" aria-hidden="true" />
                                <span>Ciutkan sidebar</span>
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="flex min-h-screen w-full bg-[#f7f7f5] text-[#1c1917]">
            {/* Desktop / Tablet Sidebar */}
            <aside
                className="hidden md:block flex-shrink-0 bg-[#0f172a] sticky top-0 h-screen z-30 transition-[width] duration-200 ease-out"
                style={{ width: isCollapsed ? 72 : 248 }}
            >
                {renderSidebarInner(isCollapsed, false)}
            </aside>

            {/* Mobile Drawer for non-USER roles */}
            <AnimatePresence>
                {drawerOpen && !isEmployeeRole && (
                    <div className="fixed inset-0 z-50 md:hidden flex">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.16 }}
                            onClick={() => setDrawerOpen(false)}
                            className="fixed inset-0 bg-[rgba(28,25,23,0.5)]"
                            aria-hidden="true"
                        />
                        <motion.aside
                            role="dialog"
                            aria-modal="true"
                            aria-label="Menu navigasi"
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                            className="relative z-10 w-[260px] max-w-[85vw] h-full bg-[#0f172a]"
                        >
                            {renderSidebarInner(false, true)}
                        </motion.aside>
                    </div>
                )}
            </AnimatePresence>

            {/* Main area */}
            <div className="flex-1 min-w-0 flex flex-col">
                {/* Header */}
                <header className="h-16 bg-[#fff] border-b border-[#e7e5e4] sticky top-0 z-20 flex items-center gap-3 md:gap-4 px-4 md:px-7">
                    {!isEmployeeRole && (
                        <button
                            type="button"
                            aria-label="Buka menu navigasi"
                            onClick={() => setDrawerOpen(true)}
                            className="md:hidden w-[38px] h-[38px] rounded-[10px] border border-[#e7e5e4] bg-[#fff] text-[#44403c] inline-flex items-center justify-center cursor-pointer"
                        >
                            <Menu className="w-5 h-5" aria-hidden="true" />
                        </button>
                    )}

                    {/* Breadcrumb */}
                    <nav aria-label="Breadcrumb" className="text-[13px] text-[#78716c] flex items-center gap-2 min-w-0 truncate">
                        {breadcrumb.group && (
                            <>
                                <span className="hidden sm:inline truncate">{breadcrumb.group}</span>
                                <span className="hidden sm:inline" aria-hidden="true">/</span>
                            </>
                        )}
                        <span className="text-[#1c1917] font-semibold truncate">{breadcrumb.label}</span>
                    </nav>

                    <div className="flex-1" />

                    {/* Global search / Ctrl K trigger */}
                    <button
                        type="button"
                        onClick={() => setPaletteOpen(true)}
                        aria-label="Pencarian cepat halaman (Ctrl K)"
                        className="hidden lg:flex items-center gap-2 h-[38px] border border-[#e7e5e4] rounded-[10px] px-3 w-[270px] bg-[#fff] text-[#78716c] text-[13px] cursor-pointer hover:border-[#d6d3d1] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
                    >
                        <Search className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                        <span className="flex-1 text-left truncate">Cari menu, karyawan, pesanan…</span>
                        <kbd className="text-[11px] border border-[#e7e5e4] rounded-[6px] px-1.5 py-[1px] text-[#a8a29e] font-sans">
                            Ctrl K
                        </kbd>
                    </button>

                    <button
                        type="button"
                        onClick={() => setPaletteOpen(true)}
                        aria-label="Cari halaman"
                        className="lg:hidden w-[38px] h-[38px] border border-[#e7e5e4] rounded-[10px] bg-[#fff] text-[#57534e] inline-flex items-center justify-center cursor-pointer"
                    >
                        <Search className="w-[18px] h-[18px]" aria-hidden="true" />
                    </button>

                    {/* Tomorrow cutoff chip for USER */}
                    {isEmployeeRole && tomorrowCutoffText && (
                        <span className="hidden sm:inline-flex items-center text-[12px] font-semibold text-[#92400e] bg-[#fef3c7] rounded-full px-2.5 py-[5px] whitespace-nowrap">
                            {tomorrowCutoffText}
                        </span>
                    )}

                    {/* Live / Disconnected status */}
                    <span
                        className={`hidden sm:inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-2.5 py-[5px] whitespace-nowrap ${
                            isConnected
                                ? 'text-[#166534] bg-[#dcfce7]'
                                : 'text-[#991b1b] bg-[#fee2e2]'
                        }`}
                    >
                        <span
                            aria-hidden="true"
                            className={`w-[7px] h-[7px] rounded-full ${
                                isConnected ? 'bg-[#16a34a]' : 'bg-[#dc2626]'
                            }`}
                        />
                        {isConnected
                            ? `Live · ${Math.max(1, connectedClients)} terhubung`
                            : 'Terputus'}
                    </span>

                    <NotificationBell />

                    {/* Profile dropdown */}
                    <div className="relative" ref={profileRef}>
                        <button
                            type="button"
                            onClick={() => setProfileOpen((prev) => !prev)}
                            aria-expanded={profileOpen}
                            aria-label="Menu akun"
                            className="flex items-center gap-2.5 pl-1.5 pr-1 py-1 rounded-[10px] bg-transparent border-0 cursor-pointer hover:bg-[#fafaf9] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
                        >
                            <div className="hidden md:block text-right">
                                <div className="text-[13px] font-semibold text-[#1c1917] leading-tight max-w-[160px] truncate">
                                    {user?.name}
                                </div>
                                <div className="text-[11px] text-[#78716c] leading-tight">
                                    {role ? ROLE_LABELS[role] : ''}
                                </div>
                            </div>
                            <div className="w-9 h-9 rounded-full bg-[#fde68a] text-[#92400e] flex items-center justify-center font-bold text-[13px] flex-shrink-0">
                                {getInitials(user?.name)}
                            </div>
                            <ChevronDown className="hidden md:block w-3.5 h-3.5 text-[#78716c]" aria-hidden="true" />
                        </button>

                        {profileOpen && (
                            <div
                                role="menu"
                                className="absolute right-0 mt-2 w-56 bg-[#fff] border border-[#e7e5e4] rounded-[12px] shadow-[0_12px_32px_rgba(28,25,23,0.12)] py-1.5 z-50"
                            >
                                <div className="px-3.5 py-2 border-b border-[#f0efed]">
                                    <div className="text-[13px] font-bold text-[#1c1917] truncate">
                                        {user?.name}
                                    </div>
                                    <div className="text-[11.5px] text-[#78716c] truncate">
                                        {user?.externalId} · {role ? ROLE_LABELS[role] : ''}
                                    </div>
                                </div>

                                <Link
                                    to="/settings"
                                    role="menuitem"
                                    onClick={() => setProfileOpen(false)}
                                    className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-[#1c1917] hover:bg-[#fafaf9] no-underline"
                                >
                                    <Settings className="w-4 h-4 text-[#78716c]" aria-hidden="true" />
                                    <span>Pengaturan</span>
                                </Link>
                                <Link
                                    to="/about"
                                    role="menuitem"
                                    onClick={() => setProfileOpen(false)}
                                    className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-[#1c1917] hover:bg-[#fafaf9] no-underline"
                                >
                                    <Info className="w-4 h-4 text-[#78716c]" aria-hidden="true" />
                                    <span>Tentang</span>
                                </Link>
                                {role !== 'ADMIN' && (
                                    <Link
                                        to="/terms"
                                        role="menuitem"
                                        onClick={() => setProfileOpen(false)}
                                        className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-[#1c1917] hover:bg-[#fafaf9] no-underline"
                                    >
                                        <FileText className="w-4 h-4 text-[#78716c]" aria-hidden="true" />
                                        <span>Syarat &amp; Ketentuan</span>
                                    </Link>
                                )}

                                <div className="my-1 border-t border-[#f0efed]" />

                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        setProfileOpen(false);
                                        logout();
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-semibold text-[#b91c1c] hover:bg-[#fee2e2]/40 bg-transparent border-0 text-left cursor-pointer"
                                >
                                    <LogOut className="w-4 h-4" aria-hidden="true" />
                                    <span>Keluar</span>
                                </button>
                            </div>
                        )}
                    </div>
                </header>

                {/* Page Content */}
                <main
                    className={`flex-1 w-full min-w-0 p-4 md:p-7 ${
                        isEmployeeRole ? 'pb-24 md:pb-7' : ''
                    }`}
                >
                    {isCheckinPage ? (
                        children
                    ) : (
                        <AnimatePresence initial={false}>
                            <motion.div
                                key={location.pathname}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                                className="w-full"
                            >
                                {children}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </main>
            </div>

            {/* Mobile Bottom Nav for USER */}
            {isEmployeeRole && (
                <MobileBottomNav
                    userName={user?.name}
                    userId={user?.externalId}
                    onLogout={logout}
                />
            )}

            {/* Ctrl+K Command Palette */}
            <CommandPalette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                role={role}
            />
        </div>
    );
}
