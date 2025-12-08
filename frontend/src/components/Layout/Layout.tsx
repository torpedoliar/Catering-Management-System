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
    ScrollText
} from 'lucide-react';

interface LayoutProps {
    children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    const { user, logout } = useAuth();
    const { isConnected } = useSSE();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);

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
    ];

    const adminLinks = [
        { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/admin/calendar', icon: Calendar, label: 'Kalender' },
        { path: '/admin/shifts', icon: Clock, label: 'Konfigurasi Shift' },
        { path: '/admin/users', icon: Users, label: 'Pengguna' },
        { path: '/admin/companies', icon: Building2, label: 'Perusahaan' },
        { path: '/admin/blacklist', icon: Ban, label: 'Blacklist' },
        { path: '/admin/export', icon: FileSpreadsheet, label: 'Ekspor' },
        { path: '/admin/audit-log', icon: ScrollText, label: 'Log Audit' },
    ];

    const canteenLinks = [
        { path: '/canteen/checkin', icon: ScanLine, label: 'Check-in' },
    ];

    const NavLink = ({ path, icon: Icon, label }: { path: string; icon: any; label: string }) => (
        <Link
            to={path}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer ${isActive(path)
                ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
        >
            <Icon className="w-5 h-5" />
            <span className="font-medium">{label}</span>
        </Link>
    );

    const renderSidebarContent = () => (
        <>
            {/* Header */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-700/50">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                        <UtensilsCrossed className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold gradient-text">Catering</h1>
                        <p className="text-xs text-slate-500">Zero Waste System</p>
                    </div>
                </div>
                <button
                    onClick={() => setSidebarOpen(false)}
                    className="lg:hidden p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                    <X className="w-5 h-5 text-slate-400" />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                {/* User section */}
                <div className="mb-6">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-4">
                        Menu
                    </p>
                    {userLinks.map(link => (
                        <NavLink key={link.path} {...link} />
                    ))}
                </div>

                {/* Canteen section */}
                {(user?.role === 'CANTEEN' || user?.role === 'ADMIN') && (
                    <div className="mb-6">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-4">
                            Canteen
                        </p>
                        {canteenLinks.map(link => (
                            <NavLink key={link.path} {...link} />
                        ))}
                    </div>
                )}

                {/* Admin section */}
                {user?.role === 'ADMIN' && (
                    <div className="mb-6">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-4">
                            Administration
                        </p>
                        {adminLinks.map(link => (
                            <NavLink key={link.path} {...link} />
                        ))}
                    </div>
                )}
            </nav>

            {/* Logout */}
            <div className="p-4 border-t border-slate-700/50">
                <button
                    onClick={() => {
                        logout();
                        setSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 cursor-pointer"
                >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Logout</span>
                </button>
            </div>
        </>
    );

    return (
        <div className="min-h-screen flex bg-slate-900">
            {/* Mobile sidebar backdrop */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Desktop Sidebar - Always visible on lg+ */}
            <div className="hidden lg:flex lg:w-64 lg:flex-shrink-0">
                <div className="w-64 h-screen bg-slate-900/80 backdrop-blur-lg border-r border-slate-700/50 flex flex-col fixed left-0 top-0">
                    {renderSidebarContent()}
                </div>
            </div>

            {/* Mobile Sidebar */}
            <div
                className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900/95 backdrop-blur-lg border-r border-slate-700/50 flex flex-col lg:hidden transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                {renderSidebarContent()}
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col lg:ml-0">
                {/* Top bar */}
                <header className="h-16 bg-slate-900/80 backdrop-blur-lg border-b border-slate-700/50 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="lg:hidden p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
                    >
                        <Menu className="w-6 h-6 text-slate-300" />
                    </button>

                    <div className="flex-1 lg:flex-none" />

                    <div className="flex items-center gap-4">
                        {/* Connection status */}
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
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
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                                {user?.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="hidden md:block">
                                <p className="text-sm font-medium text-white">{user?.name}</p>
                                <p className="text-xs text-slate-400">{user?.role}</p>
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
