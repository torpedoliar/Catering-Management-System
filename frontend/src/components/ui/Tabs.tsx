import { useId } from 'react';
import { motion } from 'framer-motion';

export interface TabItem {
    id: string;
    label: string;
    count?: number | string;
}

export interface TabsProps {
    items: TabItem[];
    value: string;
    onChange: (id: string) => void;
    ariaLabel?: string;
    layoutId?: string;
    className?: string;
}

export function Tabs({
    items,
    value,
    onChange,
    ariaLabel = 'Tab navigasi',
    layoutId,
    className = '',
}: TabsProps) {
    const autoId = useId();
    const underlineId = layoutId || `tabs-underline-${autoId}`;

    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            className={`flex gap-1 border-b border-[#e7e5e4] overflow-x-auto ${className}`}
        >
            {items.map((tab) => {
                const active = tab.id === value;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(tab.id)}
                        className={[
                            'relative px-3 py-2.5 text-[13.5px] whitespace-nowrap cursor-pointer transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] rounded-t-[8px]',
                            active ? 'text-[#1c1917] font-bold' : 'text-[#78716c] font-medium hover:text-[#44403c]',
                        ].join(' ')}
                    >
                        <span>{tab.label}</span>
                        {tab.count !== undefined && (
                            <span
                                className={[
                                    'ml-1.5 inline-flex items-center rounded-full px-[7px] py-[1px] text-[11px] font-bold tabular-nums',
                                    active
                                        ? 'bg-[#fef3c7] text-[#92400e]'
                                        : 'bg-[#f5f5f4] text-[#78716c]',
                                ].join(' ')}
                            >
                                {tab.count}
                            </span>
                        )}
                        {active && (
                            <motion.span
                                layoutId={underlineId}
                                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                                className="absolute left-0 right-0 bottom-0 h-[2px] bg-[#f59e0b]"
                                aria-hidden="true"
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

export default Tabs;
