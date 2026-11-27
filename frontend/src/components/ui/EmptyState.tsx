import { ReactNode } from 'react';

export interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
    return (
        <div className={`py-14 px-5 text-center ${className}`}>
            {icon && (
                <div className="w-11 h-11 rounded-full bg-[#f5f5f4] text-[#78716c] flex items-center justify-center mx-auto mb-3">
                    {icon}
                </div>
            )}
            <div className="text-[15px] font-bold text-[#1c1917]">{title}</div>
            {description && (
                <p className="mt-1 mb-0 text-[13px] text-[#78716c] max-w-md mx-auto">
                    {description}
                </p>
            )}
            {action && <div className="mt-4 flex justify-center">{action}</div>}
        </div>
    );
}

export default EmptyState;
