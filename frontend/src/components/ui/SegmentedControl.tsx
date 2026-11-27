import { useId } from 'react';
import { motion } from 'framer-motion';

export interface SegmentOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface SegmentedControlProps {
    options: SegmentOption[];
    value: string;
    onChange: (value: string) => void;
    ariaLabel?: string;
    layoutId?: string;
    className?: string;
}

export function SegmentedControl({
    options,
    value,
    onChange,
    ariaLabel = 'Pilihan segmen',
    layoutId,
    className = '',
}: SegmentedControlProps) {
    const autoId = useId();
    const pillId = layoutId || `seg-pill-${autoId}`;

    return (
        <div
            role="group"
            aria-label={ariaLabel}
            className={`inline-flex items-center bg-[#fff] border border-[#e7e5e4] rounded-[10px] p-[3px] ${className}`}
        >
            {options.map((opt) => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        disabled={opt.disabled}
                        aria-pressed={active}
                        onClick={() => !opt.disabled && onChange(opt.value)}
                        className={[
                            'relative z-10 px-3 py-[7px] rounded-[8px] text-[13px] whitespace-nowrap transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]',
                            opt.disabled
                                ? 'text-[#a8a29e] cursor-not-allowed font-medium'
                                : active
                                    ? 'text-[#fff] font-semibold cursor-pointer'
                                    : 'text-[#57534e] font-medium hover:text-[#1c1917] cursor-pointer',
                        ].join(' ')}
                    >
                        {active && (
                            <motion.span
                                layoutId={pillId}
                                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                                className="absolute inset-0 bg-[#1c1917] rounded-[8px] -z-10"
                                aria-hidden="true"
                            />
                        )}
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

export default SegmentedControl;
