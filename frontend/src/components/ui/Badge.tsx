import { ReactNode } from 'react';

export type BadgeVariant =
    | 'info'
    | 'success'
    | 'danger'
    | 'neutral'
    | 'warning'
    | 'dark'
    | 'teal';

export interface BadgeProps {
    variant?: BadgeVariant;
    dot?: boolean;
    dotColor?: string;
    className?: string;
    children: ReactNode;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
    info: 'bg-[#dbeafe] text-[#1e40af]',
    success: 'bg-[#dcfce7] text-[#166534]',
    danger: 'bg-[#fee2e2] text-[#991b1b]',
    neutral: 'bg-[#f5f5f4] text-[#57534e]',
    warning: 'bg-[#fef3c7] text-[#92400e]',
    dark: 'bg-[#1c1917] text-[#fff]',
    teal: 'bg-[#ccfbf1] text-[#115e59]',
};

const DOT_DEFAULT_COLOR: Record<BadgeVariant, string> = {
    info: '#2563eb',
    success: '#16a34a',
    danger: '#dc2626',
    neutral: '#78716c',
    warning: '#b45309',
    dark: '#fbbf24',
    teal: '#0d9488',
};

export function Badge({
    variant = 'neutral',
    dot = false,
    dotColor,
    className = '',
    children,
}: BadgeProps) {
    return (
        <span
            className={[
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold whitespace-nowrap',
                VARIANT_STYLES[variant],
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {dot && (
                <span
                    aria-hidden="true"
                    className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                    style={{ backgroundColor: dotColor || DOT_DEFAULT_COLOR[variant] }}
                />
            )}
            {children}
        </span>
    );
}

const ORDER_STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
    ORDERED: { label: 'Menunggu', variant: 'info' },
    PICKED_UP: { label: 'Diambil', variant: 'success' },
    NO_SHOW: { label: 'Tidak diambil', variant: 'danger' },
    CANCELLED: { label: 'Dibatalkan', variant: 'neutral' },
    PENDING_CHECK: { label: 'Perlu dicek', variant: 'warning' },
};

export function OrderStatusBadge({ status }: { status: string }) {
    const info = ORDER_STATUS_MAP[status] || { label: status, variant: 'neutral' as BadgeVariant };
    return <Badge variant={info.variant}>{info.label}</Badge>;
}

const ROLE_BADGE_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
    USER: { label: 'USER', variant: 'neutral' },
    CANTEEN: { label: 'CANTEEN', variant: 'warning' },
    ADMIN: { label: 'ADMIN', variant: 'dark' },
    VENDOR: { label: 'VENDOR', variant: 'teal' },
};

export function RoleBadge({ role }: { role: string }) {
    const info = ROLE_BADGE_MAP[role] || { label: role, variant: 'neutral' as BadgeVariant };
    return (
        <span
            className={[
                'inline-flex items-center rounded-[6px] px-[7px] py-[3px] text-[11px] font-bold whitespace-nowrap',
                VARIANT_STYLES[info.variant],
            ].join(' ')}
        >
            {info.label}
        </span>
    );
}

export default Badge;
