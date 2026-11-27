import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, UtensilsCrossed, History, User, Settings, Info, FileText, LogOut } from 'lucide-react';
import { Drawer } from '../ui/Drawer';

interface MobileBottomNavProps {
    userName?: string;
    userId?: string;
    onLogout: () => void;
}

export default function MobileBottomNav({ userName, userId, onLogout }: MobileBottomNavProps) {
    const location = useLocation();
    const [accountOpen, setAccountOpen] = useState(false);

    const isAccountRoute = ['/settings', '/about', '/terms'].includes(location.pathname);

    const navItems = [
        { path: '/', label: 'Pesan', icon: Home, active: location.pathname === '/' },
        { path: '/menu', label: 'Menu', icon: UtensilsCrossed, active: location.pathname === '/menu' },
        { path: '/history', label: 'Riwayat', icon: History, active: location.pathname === '/history' },
    ];

    return (
        <>
            <nav
                aria-label="Navigasi utama"
                className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex bg-[#fff] border-t border-[#f0efed] px-2 pt-1.5 pb-[max(14px,env(safe-area-inset-bottom))]"
            >
                {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 min-h-[44px] no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] rounded-[8px] ${
                                item.active
                                    ? 'text-[#b45309] font-bold'
                                    : 'text-[#78716c] font-medium'
                            }`}
                        >
                            <Icon className="w-[22px] h-[22px]" strokeWidth={1.8} aria-hidden="true" />
                            <span className="text-[11px] leading-tight">{item.label}</span>
                        </Link>
                    );
                })}
                <button
                    type="button"
                    onClick={() => setAccountOpen(true)}
                    aria-expanded={accountOpen}
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 min-h-[44px] bg-transparent border-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] rounded-[8px] ${
                        isAccountRoute
                            ? 'text-[#b45309] font-bold'
                            : 'text-[#78716c] font-medium'
                    }`}
                >
                    <User className="w-[22px] h-[22px]" strokeWidth={1.8} aria-hidden="true" />
                    <span className="text-[11px] leading-tight">Akun</span>
                </button>
            </nav>

            <Drawer
                open={accountOpen}
                onClose={() => setAccountOpen(false)}
                title={userName || 'Akun Saya'}
                subtitle={userId ? `ID: ${userId}` : undefined}
                widthClass="w-full max-w-[320px]"
            >
                <div className="flex flex-col gap-1.5">
                    <Link
                        to="/settings"
                        onClick={() => setAccountOpen(false)}
                        className="flex items-center gap-3 px-3 py-3 rounded-[10px] text-[14px] font-semibold text-[#1c1917] hover:bg-[#fafaf9] no-underline min-h-[44px]"
                    >
                        <Settings className="w-4 h-4 text-[#78716c]" aria-hidden="true" />
                        <span>Pengaturan</span>
                    </Link>
                    <Link
                        to="/about"
                        onClick={() => setAccountOpen(false)}
                        className="flex items-center gap-3 px-3 py-3 rounded-[10px] text-[14px] font-semibold text-[#1c1917] hover:bg-[#fafaf9] no-underline min-h-[44px]"
                    >
                        <Info className="w-4 h-4 text-[#78716c]" aria-hidden="true" />
                        <span>Tentang</span>
                    </Link>
                    <Link
                        to="/terms"
                        onClick={() => setAccountOpen(false)}
                        className="flex items-center gap-3 px-3 py-3 rounded-[10px] text-[14px] font-semibold text-[#1c1917] hover:bg-[#fafaf9] no-underline min-h-[44px]"
                    >
                        <FileText className="w-4 h-4 text-[#78716c]" aria-hidden="true" />
                        <span>Syarat &amp; Ketentuan</span>
                    </Link>

                    <div className="my-2 border-t border-[#f0efed]" />

                    <button
                        type="button"
                        onClick={() => {
                            setAccountOpen(false);
                            onLogout();
                        }}
                        className="flex items-center gap-3 px-3 py-3 rounded-[10px] text-[14px] font-semibold text-[#b91c1c] hover:bg-[#fee2e2]/40 bg-transparent border-0 text-left cursor-pointer min-h-[44px]"
                    >
                        <LogOut className="w-4 h-4" aria-hidden="true" />
                        <span>Keluar</span>
                    </button>
                </div>
            </Drawer>
        </>
    );
}
