import {
    Home,
    UtensilsCrossed,
    History,
    LayoutDashboard,
    Store,
    ScanLine,
    Calendar,
    MessageSquare,
    Bell,
    DollarSign,
    TrendingUp,
    FileSpreadsheet,
    ScrollText,
    Users,
    Building2,
    MapPin,
    Clock,
    Ban,
    Timer,
    Shield,
    Mail,
    Palette,
    FileText,
    Activity,
    DatabaseBackup,
    ArrowUpCircle,
    Settings,
    Info,
    ListOrdered,
    LucideIcon,
} from 'lucide-react';

export type UserRole = 'USER' | 'ADMIN' | 'CANTEEN' | 'VENDOR';

export interface NavItemConfig {
    path: string;
    label: string;
    icon: LucideIcon;
    roles: UserRole[];
    group: string;
    keywords?: string[];
    badgeKey?: 'pendingMessages';
}

export interface NavGroupConfig {
    id: string;
    label: string;
    items: NavItemConfig[];
}

export const NAV_GROUPS: NavGroupConfig[] = [
    {
        id: 'karyawan',
        label: 'Karyawan',
        items: [
            {
                path: '/',
                label: 'Pesan Makanan',
                icon: Home,
                roles: ['USER', 'CANTEEN', 'ADMIN'],
                group: 'Karyawan',
                keywords: ['order', 'pesan', 'makan', 'beranda'],
            },
            {
                path: '/menu',
                label: 'Lihat Menu',
                icon: UtensilsCrossed,
                roles: ['USER', 'CANTEEN', 'ADMIN'],
                group: 'Karyawan',
                keywords: ['menu', 'makanan', 'jadwal'],
            },
            {
                path: '/history',
                label: 'Riwayat',
                icon: History,
                roles: ['USER', 'CANTEEN', 'ADMIN'],
                group: 'Karyawan',
                keywords: ['riwayat', 'history', 'pesanan', 'sanggahan', 'batal'],
            },
        ],
    },
    {
        id: 'operasional',
        label: 'Operasional',
        items: [
            {
                path: '/admin/dashboard',
                label: 'Dashboard',
                icon: LayoutDashboard,
                roles: ['ADMIN'],
                group: 'Operasional',
                keywords: ['dashboard', 'ringkasan', 'harian', 'kpi'],
            },
            {
                path: '/canteen',
                label: 'Dashboard Kantin',
                icon: Store,
                roles: ['CANTEEN', 'ADMIN'],
                group: 'Operasional',
                keywords: ['kantin', 'operator', 'live', 'istirahat'],
            },
            {
                path: '/canteen/checkin',
                label: 'Check-in',
                icon: ScanLine,
                roles: ['CANTEEN', 'ADMIN'],
                group: 'Operasional',
                keywords: ['checkin', 'scan', 'barcode', 'qr', 'ambil'],
            },
            {
                path: '/admin/calendar',
                label: 'Kalender',
                icon: Calendar,
                roles: ['ADMIN'],
                group: 'Operasional',
                keywords: ['kalender', 'libur', 'holiday'],
            },
            {
                path: '/admin/messages',
                label: 'Pesan & Sanggahan',
                icon: MessageSquare,
                roles: ['ADMIN'],
                group: 'Operasional',
                keywords: ['pesan', 'sanggahan', 'keluhan', 'appeal'],
                badgeKey: 'pendingMessages',
            },
            {
                path: '/admin/announcements',
                label: 'Pengumuman',
                icon: Bell,
                roles: ['ADMIN'],
                group: 'Operasional',
                keywords: ['pengumuman', 'announcement', 'info'],
            },
        ],
    },
    {
        id: 'laporan',
        label: 'Laporan',
        items: [
            {
                path: '/admin/costs',
                label: 'Analitik Biaya',
                icon: DollarSign,
                roles: ['ADMIN'],
                group: 'Laporan',
                keywords: ['biaya', 'analitik', 'waste', 'kerugian'],
            },
            {
                path: '/vendor',
                label: 'Rekap Vendor',
                icon: Store,
                roles: ['VENDOR', 'ADMIN'],
                group: 'Laporan',
                keywords: ['vendor', 'rekap', 'porsi'],
            },
            {
                path: '/vendor/pickup-stats',
                label: 'Statistik Pengambilan',
                icon: TrendingUp,
                roles: ['VENDOR', 'ADMIN'],
                group: 'Laporan',
                keywords: ['statistik', 'pengambilan', 'pickup'],
            },
            {
                path: '/admin/export',
                label: 'Ekspor',
                icon: FileSpreadsheet,
                roles: ['ADMIN'],
                group: 'Laporan',
                keywords: ['ekspor', 'excel', 'download', 'laporan'],
            },
            {
                path: '/admin/audit-log',
                label: 'Log Audit',
                icon: ScrollText,
                roles: ['ADMIN'],
                group: 'Laporan',
                keywords: ['audit', 'log', 'riwayat aktivitas'],
            },
        ],
    },
    {
        id: 'master',
        label: 'Data Master',
        items: [
            {
                path: '/admin/users',
                label: 'Pengguna',
                icon: Users,
                roles: ['ADMIN'],
                group: 'Data Master',
                keywords: ['karyawan', 'user', 'akun', 'nik'],
            },
            {
                path: '/admin/companies',
                label: 'Perusahaan',
                icon: Building2,
                roles: ['ADMIN'],
                group: 'Data Master',
                keywords: ['perusahaan', 'divisi', 'departemen'],
            },
            {
                path: '/admin/canteens',
                label: 'Kantin',
                icon: MapPin,
                roles: ['ADMIN'],
                group: 'Data Master',
                keywords: ['kantin', 'kuota', 'lokasi'],
            },
            {
                path: '/admin/shifts',
                label: 'Shift',
                icon: Clock,
                roles: ['ADMIN'],
                group: 'Data Master',
                keywords: ['shift', 'istirahat', 'jam kerja'],
            },
            {
                path: '/admin/blacklist',
                label: 'Blacklist',
                icon: Ban,
                roles: ['ADMIN'],
                group: 'Data Master',
                keywords: ['blacklist', 'blokir', 'strike'],
            },
            {
                path: '/admin/vendors',
                label: 'Vendor',
                icon: Store,
                roles: ['ADMIN'],
                group: 'Data Master',
                keywords: ['vendor', 'katering', 'supplier'],
            },
            {
                path: '/admin/weekly-menu',
                label: 'Menu Mingguan',
                icon: UtensilsCrossed,
                roles: ['ADMIN'],
                group: 'Data Master',
                keywords: ['menu mingguan', 'jadwal menu', 'makanan'],
            },
        ],
    },
    {
        id: 'sistem',
        label: 'Sistem',
        items: [
            {
                path: '/admin/time-settings',
                label: 'Pengaturan Waktu',
                icon: Timer,
                roles: ['ADMIN'],
                group: 'Sistem',
                keywords: ['waktu', 'ntp', 'timezone', 'cutoff'],
            },
            {
                path: '/admin/security',
                label: 'Keamanan',
                icon: Shield,
                roles: ['ADMIN'],
                group: 'Sistem',
                keywords: ['keamanan', 'token', 'password'],
            },
            {
                path: '/admin/email-settings',
                label: 'Email',
                icon: Mail,
                roles: ['ADMIN'],
                group: 'Sistem',
                keywords: ['email', 'smtp', 'notifikasi'],
            },
            {
                path: '/admin/branding',
                label: 'Branding',
                icon: Palette,
                roles: ['ADMIN'],
                group: 'Sistem',
                keywords: ['branding', 'logo', 'nama aplikasi'],
            },
            {
                path: '/admin/agreement',
                label: 'Syarat & Ketentuan',
                icon: FileText,
                roles: ['ADMIN'],
                group: 'Sistem',
                keywords: ['syarat', 'ketentuan', 'agreement'],
            },
            {
                path: '/admin/performance',
                label: 'Performa',
                icon: Activity,
                roles: ['ADMIN'],
                group: 'Sistem',
                keywords: ['performa', 'server', 'cpu', 'memori'],
            },
            {
                path: '/admin/uptime',
                label: 'Uptime',
                icon: Clock,
                roles: ['ADMIN'],
                group: 'Sistem',
                keywords: ['uptime', 'status server'],
            },
            {
                path: '/admin/backup',
                label: 'Backup',
                icon: DatabaseBackup,
                roles: ['ADMIN'],
                group: 'Sistem',
                keywords: ['backup', 'restore', 'database'],
            },
            {
                path: '/admin/update',
                label: 'Update',
                icon: ArrowUpCircle,
                roles: ['ADMIN'],
                group: 'Sistem',
                keywords: ['update', 'versi', 'pembaruan'],
            },
        ],
    },
];

export const EXTRA_ROUTE_META: NavItemConfig[] = [
    {
        path: '/admin/orders',
        label: 'Detail Order',
        icon: ListOrdered,
        roles: ['ADMIN'],
        group: 'Operasional',
        keywords: ['pesanan', 'detail order', 'daftar order'],
    },
    {
        path: '/settings',
        label: 'Pengaturan',
        icon: Settings,
        roles: ['USER', 'CANTEEN', 'VENDOR', 'ADMIN'],
        group: 'Akun',
        keywords: ['pengaturan', 'akun', 'password', 'profil'],
    },
    {
        path: '/about',
        label: 'Tentang',
        icon: Info,
        roles: ['USER', 'CANTEEN', 'VENDOR', 'ADMIN'],
        group: 'Akun',
        keywords: ['tentang', 'versi', 'about'],
    },
    {
        path: '/terms',
        label: 'Syarat & Ketentuan',
        icon: FileText,
        roles: ['USER', 'CANTEEN', 'VENDOR'],
        group: 'Akun',
        keywords: ['syarat', 'ketentuan', 'aturan'],
    },
];

export function getVisibleGroupsForRole(role?: UserRole): NavGroupConfig[] {
    if (!role) return [];
    return NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => item.roles.includes(role)),
    })).filter((group) => group.items.length > 0);
}

export function getAllSearchableItemsForRole(role?: UserRole): NavItemConfig[] {
    if (!role) return [];
    const fromGroups = NAV_GROUPS.flatMap((g) => g.items);
    return [...fromGroups, ...EXTRA_ROUTE_META].filter((item) => item.roles.includes(role));
}

export function getRouteBreadcrumb(
    pathname: string,
    role?: UserRole
): { group?: string; label: string } {
    const all = [...NAV_GROUPS.flatMap((g) => g.items), ...EXTRA_ROUTE_META];
    const exact = all.find((item) => item.path === pathname);
    if (exact) {
        // For USER on main employee routes, keep breadcrumb single-level like mockup
        if (role === 'USER' && exact.group === 'Karyawan') {
            return { label: exact.label };
        }
        return { group: exact.group, label: exact.label };
    }
    return { label: 'Catering' };
}
