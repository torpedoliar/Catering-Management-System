import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useState } from 'react';
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
    ScrollText,
    Settings,
    Megaphone,
    Mail,
    ChevronDown,
    ChevronRight,
    Activity,
    DatabaseBackup
} from 'lucide-react';

interface SidebarProps {
    onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [userExpanded, setUserExpanded] = useState(true);
    const [adminExpanded, setAdminExpanded] = useState(false);
    const [canteenExpanded, setCanteenExpanded] = useState(true);
    const [serverExpanded, setServerExpanded] = useState(false);

    const isActive = (path: string) => location.pathname === path;

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

    const userLinks = [
        { path: '/', icon: Home, label: 'Order' },
        { path: '/history', icon: History, label: 'History' },
    ];

    const adminLinks = [
        // Daily/Most Frequent
        { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/admin/calendar', icon: CalendarDays, label: 'Calendar' },
        { path: '/admin/users', icon: Users, label: 'Users' },
        { path: '/admin/companies', icon: Building2, label: 'Companies' },
        // Regular Use
        { path: '/admin/announcements', icon: Megaphone, label: 'Announcements' },
        { path: '/admin/export', icon: FileSpreadsheet, label: 'Export' },
        // Occasional
        { path: '/admin/blacklist', icon: Ban, label: 'Blacklist' },
        { path: '/admin/audit-log', icon: ScrollText, label: 'Audit Log' },
        // Configuration (Rare)
        { path: '/admin/shifts', icon: Clock, label: 'Shift Config' },
        { path: '/admin/time-settings', icon: Timer, label: 'Time Settings' },
        { path: '/admin/email-settings', icon: Mail, label: 'Email Settings' },
    ];

    const canteenLinks = [
        { path: '/canteen/checkin', icon: ScanLine, label: 'Check-in' },
    ];

    const serverLinks = [
        { path: '/admin/performance', icon: Activity, label: 'Performance' },
        { path: '/admin/backup', icon: DatabaseBackup, label: 'Backup & Restore' },
    ];

    const NavLink = ({ path, icon: Icon, label, colorIndex }: { path: string; icon: any; label: string; colorIndex: number }) => (
        <Link
            to={path}
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group sidebar-item ${isActive(path) ? 'active' : ''
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

    return (
        <div className="sidebar-dark w-64 h-screen flex flex-col">
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
                    onClick={onClose}
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
                                    <NavLink key={link.path} {...link} colorIndex={index + 2} />
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

                {/* Server section */}
                {user?.role === 'ADMIN' && (
                    <div className="mb-3">
                        <div
                            onClick={() => setServerExpanded(!serverExpanded)}
                            className="flex items-center justify-between px-3 py-2.5 cursor-pointer rounded-xl transition-all duration-200 mb-2 bg-white/[0.03] border border-white/[0.05] backdrop-blur-sm hover:bg-white/[0.08] hover:border-white/[0.1]"
                        >
                            <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider">
                                Server
                            </p>
                            {serverExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                        {serverExpanded && (
                            <div className="space-y-2">
                                {serverLinks.map((link, index) => (
                                    <NavLink key={link.path} {...link} colorIndex={index + 4} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </nav>

            {/* Settings & Logout */}
            <div className="p-3 border-t border-white/10 space-y-1">
                <Link
                    to="/settings"
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${isActive('/settings')
                        ? 'bg-orange-500/15 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive('/settings') ? 'bg-orange-500 text-white' : 'bg-slate-600/50 text-slate-400'
                        }`}>
                        <Settings className="w-4 h-4" />
                    </div>
                    <span className="font-medium text-sm">Settings</span>
                </Link>
                <button
                    onClick={() => {
                        logout();
                        onClose?.();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-600/50">
                        <LogOut className="w-4 h-4" />
                    </div>
                    <span className="font-medium text-sm">Logout</span>
                </button>
            </div>
        </div>
    );
}
