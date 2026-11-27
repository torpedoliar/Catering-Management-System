import { ReactNode } from 'react';

export interface PageHeaderProps {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    className?: string;
}

export function PageHeader({ title, subtitle, actions, className = '' }: PageHeaderProps) {
    return (
        <div className={`flex flex-wrap items-end justify-between gap-3 ${className}`}>
            <div className="flex-1 min-w-[240px]">
                <h1 className="m-0 text-[24px] font-extrabold tracking-[-0.02em] text-[#1c1917] leading-tight">
                    {title}
                </h1>
                {subtitle && (
                    <p className="mt-1 mb-0 text-[14px] text-[#78716c]">{subtitle}</p>
                )}
            </div>
            {actions && (
                <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
            )}
        </div>
    );
}

export default PageHeader;
