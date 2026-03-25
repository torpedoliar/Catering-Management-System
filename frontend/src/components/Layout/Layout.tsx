import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSSE } from '../../contexts/SSEContext';
import {
    Home,
    History,
    LayoutDashboard,
    Clock,
    Users,
    Building2,
    Ban,
    FileSpreadsheet,
    ScanLine,
    LogOut,
    Menu,
    X,
    Wifi,
    WifiOff,
    UtensilsCrossed,
    Calendar,
    Settings,
    Info,
    ScrollText,
    MessageSquare,
    DollarSign,
    Bell,
    Mail,
    Timer,
    ChevronDown,
    ChevronRight,
    Activity,
    DatabaseBackup,
    FileText,
    MapPin,
    Store,
    ArrowUpCircle,
    TrendingUp,
    Palette,
    PanelLeftClose,
    PanelLeftOpen,
    Search,
} from 'lucide-react';

interface LayoutProps {
    children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    const { user, logout } = useAuth();
    const { isConnected } = useSSE();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        return saved === 'true';
    });
    const [userExpanded, setUserExpanded] = useState(true);
    const [adminExpanded, setAdminExpanded] = useState(false);
    const [canteenExpanded, setCanteenExpanded] = useState(true);
    const [vendorExpanded, setVendorExpanded] = useState(true);
    const [serverExpanded, setServerExpanded] = useState(true);
    const [branding, setBranding] = useState<{ logoUrl?: string | null, appShortName?: string }>({});

    const isActive = (path: string) => location.pathname === path;

    // Persist sidebar state
    useEffect(() => {
        localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed));
    }, [sidebarCollapsed]);

    // Scroll to top on route change
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [location.pathname]);

    // Fetch branding
    useEffect(() => {
        const apiUrl = (import.meta as any).env?.VITE_API_URL || '';
        fetch(`${apiUrl}/api/settings/branding`)
            .then(r => r.json())
            .then(setBranding)
            .catch(() => { });
    }, []);

    const userLinks = [
        { path: '/', icon: Home, label: 'Pesan Makanan' },
        { path: '/menu', icon: UtensilsCrossed, label: 'Lihat Menu' },
        { path: '/history', icon: History, label: 'Riwayat' },
        { path: '/settings', icon: Settings, label: 'Pengaturan' },
        { path: '/about', icon: Info, label: 'Tentang' },
        { path: '/terms', icon: FileText, label: 'Syarat & Ketentuan' },
    ];

    const adminLinks = [
        { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/admin/costs', icon: DollarSign, label: 'Analisis Biaya' },
        { path: '/admin/calendar', icon: Calendar, label: 'Kalender' },
        { path: '/admin/messages', icon: MessageSquare, label: 'Pesan' },
        { path: '/admin/announcements', icon: Bell, label: 'Pengumuman' },
        { path: '/admin/agreement', icon: FileText, label: 'Syarat & Ketentuan' },
        { path: '/admin/vendors', icon: Store, label: 'Vendor' },
        { path: '/admin/weekly-menu', icon: UtensilsCrossed, label: 'Menu Mingguan' },
        { path: '/admin/companies', icon: Building2, label: 'Perusahaan' },
        { path: '/admin/canteens', icon: MapPin, label: 'Manajemen Kantin' },
        { path: '/admin/users', icon: Users, label: 'Pengguna' },
        { path: '/admin/blacklist', icon: Ban, label: 'Blacklist' },
        { path: '/admin/export', icon: FileSpreadsheet, label: 'Ekspor' },
        { path: '/admin/shifts', icon: Clock, label: 'Konfigurasi Shift' },
        { path: '/admin/audit-log', icon: ScrollText, label: 'Log Audit' },
        { path: '/admin/time-settings', icon: Timer, label: 'Pengaturan Waktu' },
        { path: '/admin/email-settings', icon: Mail, label: 'Email Settings' },
        { path: '/admin/branding', icon: Palette, label: 'Branding' },
    ];

    const canteenLinks = [
        { path: '/canteen/checkin', icon: ScanLine, label: 'Check-in' },
    ];

    const vendorLinks = [
        { path: '/vendor', icon: FileSpreadsheet, label: 'Rekap Order' },
        { path: '/vendor/pickup-stats', icon: TrendingUp, label: 'Statistik' },
    ];

    const getIconColor = (index: number) => {
        const colors = [
            'sidebar-icon sidebar-icon-orange',
            'sidebar-icon sidebar-icon-purple',
            'sidebar-icon sidebar-icon-teal',
            'sidebar-icon sidebar-icon-amber',
            'sidebar-icon sidebar-icon-pink',
            'sidebar-icon sidebar-icon-blue',
            'sidebar-icon sidebar-icon-emerald',
            'sidebar-icon sidebar-icon-cyan',
        ];
        return colors[index % colors.length];
    };

    const NavLink = ({ path, icon: Icon, label, colorIndex }: { path: string; icon: any; label: string; colorIndex: number }) => (
        <Link
            to={path}
            onClick={() => setSidebarOpen(false)}
            title={sidebarCollapsed ? label : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 sidebar-item ${isActive(path) ? 'active' : ''
                } ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
        >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${isActive(path) ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30' : getIconColor(colorIndex)
                }`}>
                <Icon className="w-4 h-4" />
            </div>
            {!sidebarCollapsed && (
                <>
                    <span className="font-medium text-sm truncate">{label}</span>
                    {isActive(path) && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"></div>
                    )}
                </>
            )}
        </Link>
    );

    const SectionHeader = ({ label, expanded, onToggle, color = 'text-amber-400' }: { label: string; expanded: boolean; onToggle: () => void; color?: string }) => {
        if (sidebarCollapsed) {
            return <div className="h-px bg-white/[0.06] mx-2 my-3"></div>;
        }
        return (
            <div
                onClick={onToggle}
                className="flex items-center justify-between px-3 py-2 cursor-pointer rounded-lg transition-all duration-200 mb-1 hover:bg-white/[0.04]"
            >
                <p className={`text-[10px] font-bold ${color} uppercase tracking-widest`}>
                    {label}
                </p>
                {expanded ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
            </div>
        );
    };

    const renderSidebarContent = () => (
        <>
            {/* Header */}
            <div className={`h-16 px-4 flex items-center border-b border-white/[0.06] ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
                {!sidebarCollapsed ? (
                    <div className="flex items-center gap-3">
                        {branding.logoUrl ? (
                            <img src={branding.logoUrl} alt="" className="w-9 h-9 rounded-xl object-contain" />
                        ) : (
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                                <UtensilsCrossed className="w-4.5 h-4.5 text-white" />
                            </div>
                        )}
                        <div>
                            <h1 className="text-base font-bold bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
                                {branding.appShortName || 'Catering'}
                            </h1>
                            <p className="text-[10px] text-slate-500 font-medium tracking-wide">Management System</p>
                        </div>
                    </div>
                ) : (
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                        <UtensilsCrossed className="w-4.5 h-4.5 text-white" />
                    </div>
                )}
                <button
                    onClick={() => setSidebarOpen(false)}
                    className="lg:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                    <X className="w-5 h-5 text-slate-400" />
                </button>
            </div>

            {/* Navigation */}
            <nav className={`flex-1 ${sidebarCollapsed ? 'p-2' : 'p-3'} space-y-1 overflow-y-auto`}>
                {/* User section */}
                <div className="mb-2">
                    <SectionHeader label="Menu" expanded={userExpanded} onToggle={() => setUserExpanded(!userExpanded)} />
                    {(userExpanded || sidebarCollapsed) && (
                        <div className={`space-y-0.5 ${sidebarCollapsed ? '' : 'mt-1'}`}>
                            {userLinks.map((link, index) => (
                                <NavLink key={link.path} {...link} colorIndex={index} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Canteen section */}
                {(user?.role === 'CANTEEN' || user?.role === 'ADMIN') && (
                    <div className="mb-2">
                        <SectionHeader label="Canteen" expanded={canteenExpanded} onToggle={() => setCanteenExpanded(!canteenExpanded)} />
                        {(canteenExpanded || sidebarCollapsed) && (
                            <div className={`space-y-0.5 ${sidebarCollapsed ? '' : 'mt-1'}`}>
                                {canteenLinks.map((link, index) => (
                                    <NavLink key={link.path} {...link} colorIndex={index + 4} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Vendor section */}
                {(user?.role === 'VENDOR' || user?.role === 'ADMIN') && (
                    <div className="mb-2">
                        <SectionHeader label="Vendor" expanded={vendorExpanded} onToggle={() => setVendorExpanded(!vendorExpanded)} color="text-teal-400" />
                        {(vendorExpanded || sidebarCollapsed) && (
                            <div className={`space-y-0.5 ${sidebarCollapsed ? '' : 'mt-1'}`}>
                                {vendorLinks.map((link, index) => (
                                    <NavLink key={link.path} {...link} colorIndex={index + 5} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Admin section */}
                {user?.role === 'ADMIN' && (
                    <div className="mb-2">
                        <SectionHeader label="Administration" expanded={adminExpanded} onToggle={() => setAdminExpanded(!adminExpanded)} />
                        {(adminExpanded || sidebarCollapsed) && (
                            <div className={`space-y-0.5 ${sidebarCollapsed ? '' : 'mt-1'}`}>
                                {adminLinks.map((link, index) => (
                                    <NavLink key={link.path} {...link} colorIndex={index} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Server Management section */}
                {user?.role === 'ADMIN' && (
                    <div className="mb-2">
                        <SectionHeader label="Server" expanded={serverExpanded} onToggle={() => setServerExpanded(!serverExpanded)} color="text-sky-400" />
                        {(serverExpanded || sidebarCollapsed) && (
                            <div className={`space-y-0.5 ${sidebarCollapsed ? '' : 'mt-1'}`}>
                                <NavLink path="/admin/performance" icon={Activity} label="Performa" colorIndex={4} />
                                <NavLink path="/admin/uptime" icon={Clock} label="Uptime" colorIndex={6} />
                                <NavLink path="/admin/backup" icon={DatabaseBackup} label="Backup" colorIndex={5} />
                                <NavLink path="/admin/update" icon={ArrowUpCircle} label="Update" colorIndex={7} />
                            </div>
                        )}
                    </div>
                )}
            </nav>

            {/* Footer — Collapse toggle + Logout */}
            <div className={`border-t border-white/[0.06] ${sidebarCollapsed ? 'p-2' : 'p-3'} space-y-1`}>
                {/* Collapse toggle — desktop only */}
                <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className={`hidden lg:flex w-full items-center gap-3 px-3 py-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-all duration-200 ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
                    title={sidebarCollapsed ? 'Perluas sidebar' : 'Kecilkan sidebar'}
                >
                    {sidebarCollapsed ? (
                        <PanelLeftOpen className="w-4 h-4 flex-shrink-0" />
                    ) : (
                        <>
                            <PanelLeftClose className="w-4 h-4 flex-shrink-0" />
                            <span className="text-xs font-medium">Kecilkan</span>
                        </>
                    )}
                </button>

                {/* Logout */}
                <button
                    onClick={() => {
                        logout();
                        setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-200 ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
                    title={sidebarCollapsed ? 'Logout' : undefined}
                >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.04] flex-shrink-0">
                        <LogOut className="w-4 h-4" />
                    </div>
                    {!sidebarCollapsed && <span className="font-medium text-sm">Logout</span>}
                </button>
            </div>
        </>
    );

    const sidebarWidth = sidebarCollapsed ? 'w-[72px]' : 'w-[260px]';

    return (
        <div className="min-h-screen flex" style={{ background: 'var(--color-bg-secondary)' }}>
            {/* Mobile backdrop */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Desktop Sidebar */}
            <div className={`hidden lg:flex ${sidebarWidth} flex-shrink-0 transition-all duration-300 ease-in-out`}>
                <div className={`sidebar-dark ${sidebarWidth} h-screen flex flex-col fixed left-0 top-0 z-30 transition-all duration-300 ease-in-out`}>
                    {renderSidebarContent()}
                </div>
            </div>

            {/* Mobile Sidebar */}
            <div
                className={`fixed inset-y-0 left-0 z-50 w-[260px] sidebar-dark flex flex-col lg:hidden transform transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                {renderSidebarContent()}
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-20" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center justify-between px-4 lg:px-6 h-16">
                        {/* Left — mobile menu + search */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setSidebarOpen(true)}
                                className="lg:hidden p-2 rounded-xl hover:bg-amber-50 transition-colors"
                            >
                                <Menu className="w-5 h-5" style={{ color: 'var(--color-text-secondary)' }} />
                            </button>

                            {/* Desktop search */}
                            <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-50 border border-stone-200/60 w-64 transition-all focus-within:border-amber-300 focus-within:bg-white focus-within:shadow-sm">
                                <Search className="w-4 h-4 text-stone-400" />
                                <input
                                    type="text"
                                    placeholder="Cari menu..."
                                    className="bg-transparent outline-none text-sm text-stone-700 placeholder:text-stone-400 w-full"
                                />
                            </div>
                        </div>

                        {/* Right — status + user */}
                        <div className="flex items-center gap-3">
                            {/* Connection status */}
                            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${isConnected
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                : 'bg-red-50 text-red-500 border border-red-100'
                                }`}>
                                {isConnected ? (
                                    <>
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                        <Wifi className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">Live</span>
                                    </>
                                ) : (
                                    <>
                                        <WifiOff className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">Offline</span>
                                    </>
                                )}
                            </div>

                            {/* User avatar + info */}
                            <div className="flex items-center gap-2.5 pl-3 border-l" style={{ borderColor: 'var(--color-border)' }}>
                                <div className="hidden md:block text-right">
                                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{user?.name}</p>
                                    <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{user?.role}</p>
                                </div>
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold text-sm shadow-sm shadow-amber-500/20">
                                    {user?.name?.charAt(0).toUpperCase()}
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1 p-4 lg:p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
