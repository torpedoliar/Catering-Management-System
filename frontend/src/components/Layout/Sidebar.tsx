import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
    Home,
    History,
    LayoutDashboard,
    Clock,
    Users,
    Ban,
    FileSpreadsheet,
    ScanLine,
    LogOut,
    X,
    UtensilsCrossed,
    Building2,
    CalendarDays,
    Timer,
    ScrollText
} from 'lucide-react';

interface SidebarProps {
    onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
    const { user, logout } = useAuth();
    const location = useLocation();

    const isActive = (path: string) => location.pathname === path;

    const userLinks = [
        { path: '/', icon: Home, label: 'Order' },
        { path: '/history', icon: History, label: 'History' },
    ];

    const adminLinks = [
        { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/admin/shifts', icon: Clock, label: 'Shift Config' },
        { path: '/admin/users', icon: Users, label: 'Users' },
        { path: '/admin/companies', icon: Building2, label: 'Companies' },
        { path: '/admin/calendar', icon: CalendarDays, label: 'Calendar' },
        { path: '/admin/blacklist', icon: Ban, label: 'Blacklist' },
        { path: '/admin/export', icon: FileSpreadsheet, label: 'Export' },
        { path: '/admin/audit-log', icon: ScrollText, label: 'Audit Log' },
        { path: '/admin/time-settings', icon: Timer, label: 'Time Settings' },
    ];

    const canteenLinks = [
        { path: '/canteen/checkin', icon: ScanLine, label: 'Check-in' },
    ];

    const NavLink = ({ path, icon: Icon, label }: { path: string; icon: any; label: string }) => (
        <Link
            to={path}
            onClick={onClose}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive(path)
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
        >
            <Icon className="w-5 h-5" />
            <span className="font-medium">{label}</span>
        </Link>
    );

    return (
        <div className="w-64 h-screen glass-dark flex flex-col">
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
                    onClick={onClose}
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
                        onClose?.();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Logout</span>
                </button>
            </div>
        </div>
    );
}
