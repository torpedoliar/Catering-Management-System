import { ReactNode } from 'react';

export interface EmptyStateProps {
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}

export function EmptyState({ title, description, action, className = '' }: EmptyStateProps) {
    return (
        <div className={`py-14 px-5 text-center ${className}`}>
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
