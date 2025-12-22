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
    MapPin
} from 'lucide-react';

interface LayoutProps {
    children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    const { user, logout } = useAuth();
    const { isConnected } = useSSE();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [userExpanded, setUserExpanded] = useState(true);
    const [adminExpanded, setAdminExpanded] = useState(false);
    const [canteenExpanded, setCanteenExpanded] = useState(true);
    const [vendorExpanded, setVendorExpanded] = useState(true);
    const [serverExpanded, setServerExpanded] = useState(true);

    const isActive = (path: string) => location.pathname === path;

    // Scroll main content to top when route changes
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [location.pathname]);

    const userLinks = [
        { path: '/', icon: Home, label: 'Pesan Makanan' },
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
        { path: '/admin/companies', icon: Building2, label: 'Perusahaan' },
        { path: '/admin/canteens', icon: MapPin, label: 'Manajemen Kantin' },
        { path: '/admin/users', icon: Users, label: 'Pengguna' },
        { path: '/admin/blacklist', icon: Ban, label: 'Blacklist' },
        { path: '/admin/export', icon: FileSpreadsheet, label: 'Ekspor' },
        { path: '/admin/shifts', icon: Clock, label: 'Konfigurasi Shift' },
        { path: '/admin/audit-log', icon: ScrollText, label: 'Log Audit' },
        { path: '/admin/time-settings', icon: Timer, label: 'Pengaturan Waktu' },
        { path: '/admin/email-settings', icon: Mail, label: 'Email Settings' },
    ];

    const canteenLinks = [
        { path: '/canteen/checkin', icon: ScanLine, label: 'Check-in' },
    ];

    const vendorLinks = [
        { path: '/vendor', icon: FileSpreadsheet, label: 'Rekap Order Makanan' },
    ];

    // Icon color mapping - glassmorphism style for dark theme
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
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 sidebar-item ${isActive(path) ? 'active' : ''
                }`}
        >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isActive(path) ? 'bg-orange-500 text-white' : getIconColor(colorIndex)
                }`}>
                <Icon className="w-4 h-4" />
            </div>
            <span className="font-medium text-sm">{label}</span>
            {isActive(path) && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-500"></div>
            )}
        </Link>
    );

    const renderSidebarContent = () => (
        <>
            {/* Header */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <UtensilsCrossed className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">Catering</h1>
                        <p className="text-xs text-slate-400">Management System</p>
                    </div>
                </div>
                <button
                    onClick={() => setSidebarOpen(false)}
                    className="lg:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                    <X className="w-5 h-5 text-slate-400" />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {/* User section */}
                <div className="mb-3">
                    <div
                        onClick={() => setUserExpanded(!userExpanded)}
                        className="flex items-center justify-between px-3 py-2.5 cursor-pointer rounded-xl transition-all duration-200 mb-2 bg-white/[0.03] border border-white/[0.05] backdrop-blur-sm hover:bg-white/[0.08] hover:border-white/[0.1]"
                    >
                        <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider">
                            Menu
                        </p>
                        {userExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                    {userExpanded && (
                        <div className="space-y-2">
                            {userLinks.map((link, index) => (
                                <NavLink key={link.path} {...link} colorIndex={index} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Canteen section */}
                {(user?.role === 'CANTEEN' || user?.role === 'ADMIN') && (
                    <div className="mb-3">
                        <div
                            onClick={() => setCanteenExpanded(!canteenExpanded)}
                            className="flex items-center justify-between px-3 py-2.5 cursor-pointer rounded-xl transition-all duration-200 mb-2 bg-white/[0.03] border border-white/[0.05] backdrop-blur-sm hover:bg-white/[0.08] hover:border-white/[0.1]"
                        >
                            <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider">
                                Canteen
                            </p>
                            {canteenExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                        {canteenExpanded && (
                            <div className="space-y-2">
                                {canteenLinks.map((link, index) => (
                                    <NavLink key={link.path} {...link} colorIndex={index + 4} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Vendor section */}
                {(user?.role === 'VENDOR' || user?.role === 'ADMIN') && (
                    <div className="mb-3">
                        <div
                            onClick={() => setVendorExpanded(!vendorExpanded)}
                            className="flex items-center justify-between px-3 py-2.5 cursor-pointer rounded-xl transition-all duration-200 mb-2 bg-white/[0.03] border border-white/[0.05] backdrop-blur-sm hover:bg-white/[0.08] hover:border-white/[0.1]"
                        >
                            <p className="text-[10px] font-semibold text-teal-400 uppercase tracking-wider">
                                Vendor
                            </p>
                            {vendorExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                        {vendorExpanded && (
                            <div className="space-y-2">
                                {vendorLinks.map((link, index) => (
                                    <NavLink key={link.path} {...link} colorIndex={index + 5} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Admin section */}
                {user?.role === 'ADMIN' && (
                    <div className="mb-3">
                        <div
                            onClick={() => setAdminExpanded(!adminExpanded)}
                            className="flex items-center justify-between px-3 py-2.5 cursor-pointer rounded-xl transition-all duration-200 mb-2 bg-white/[0.03] border border-white/[0.05] backdrop-blur-sm hover:bg-white/[0.08] hover:border-white/[0.1]"
                        >
                            <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider">
                                Administration
                            </p>
                            {adminExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                        {adminExpanded && (
                            <div className="space-y-2">
                                {adminLinks.map((link, index) => (
                                    <NavLink key={link.path} {...link} colorIndex={index} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Server Management section */}
                {user?.role === 'ADMIN' && (
                    <div className="mb-3">
                        <div
                            onClick={() => setServerExpanded(!serverExpanded)}
                            className="flex items-center justify-between px-3 py-2.5 cursor-pointer rounded-xl transition-all duration-200 mb-2 bg-white/[0.03] border border-white/[0.05] backdrop-blur-sm hover:bg-white/[0.08] hover:border-white/[0.1]"
                        >
                            <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider">
                                Server Management
                            </p>
                            {serverExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                        {serverExpanded && (
                            <div className="space-y-2">
                                <NavLink path="/admin/performance" icon={Activity} label="Performa Server" colorIndex={4} />
                                <NavLink path="/admin/backup" icon={DatabaseBackup} label="Backup Database" colorIndex={5} />
                            </div>
                        )}
                    </div>
                )}
            </nav>

            {/* Logout */}
            < div className="p-3 border-t border-white/10" >
                <button
                    onClick={() => {
                        logout();
                        setSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-600/50">
                        <LogOut className="w-4 h-4" />
                    </div>
                    <span className="font-medium text-sm">Logout</span>
                </button>
            </div >
        </>
    );

    return (
        <div className="min-h-screen flex bg-[#faf9f7]">
            {/* Mobile sidebar backdrop */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Desktop Sidebar - Always visible on lg+ */}
            <div className="hidden lg:flex lg:w-64 lg:flex-shrink-0">
                <div className="sidebar-dark w-64 h-screen flex flex-col fixed left-0 top-0">
                    {renderSidebarContent()}
                </div>
            </div>

            {/* Mobile Sidebar */}
            <div
                className={`fixed inset-y-0 left-0 z-50 w-64 sidebar-dark flex flex-col lg:hidden transform transition-transform duration-200 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                {renderSidebarContent()}
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col lg:ml-0">
                {/* Top bar with welcome header */}
                <header className="bg-white border-b border-[#e5e3df] sticky top-0 z-30">
                    <div className="flex items-center justify-between px-4 lg:px-6 h-16">
                        {/* Left side - Mobile menu */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden p-2 rounded-xl hover:bg-orange-50 transition-colors"
                        >
                            <Menu className="w-5 h-5 text-slate-600" />
                        </button>

                        <div className="flex-1 lg:flex-none" />

                        <div className="flex items-center gap-3">
                            {/* Connection status */}
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${isConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                                }`}>
                                {isConnected ? (
                                    <>
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

                            {/* User info */}
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-semibold text-sm">
                                    {user?.name?.charAt(0).toUpperCase()}
                                </div>
                                <div className="hidden md:block">
                                    <p className="text-sm font-medium text-[#1a1f37]">{user?.name}</p>
                                    <p className="text-xs text-slate-500">{user?.role}</p>
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
