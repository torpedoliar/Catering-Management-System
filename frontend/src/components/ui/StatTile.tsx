import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

export interface StatTileProps {
    label: string;
    value: number | string;
    sub?: string;
    color?: string;
    valueColor?: string;
    formatValue?: (val: number) => string;
    className?: string;
}

export function StatTile({
    label,
    value,
    sub,
    color,
    valueColor = '#1c1917',
    formatValue,
    className = '',
}: StatTileProps) {
    const prefersReduced = useReducedMotion();
    const isNumeric = typeof value === 'number' && Number.isFinite(value);
    const [displayVal, setDisplayVal] = useState<number>(isNumeric ? value : 0);
    const prevRef = useRef<number>(isNumeric ? value : 0);

    useEffect(() => {
        if (!isNumeric) return;
        if (prefersReduced) {
            prevRef.current = value;
            setDisplayVal(value);
            return;
        }
        const from = prevRef.current;
        const to = value;
        if (from === to) {
            setDisplayVal(to);
            return;
        }
        const controls = animate(from, to, {
            duration: 0.4,
            ease: 'easeOut',
            onUpdate: (latest) => setDisplayVal(Math.round(latest)),
            onComplete: () => {
                prevRef.current = to;
                setDisplayVal(to);
            },
        });
        return () => controls.stop();
    }, [isNumeric, value, prefersReduced]);

    const renderedValue = isNumeric
        ? formatValue
            ? formatValue(displayVal)
            : displayVal.toLocaleString('id-ID')
        : value;

    return (
        <div
            className={`bg-[#fff] border border-[#e7e5e4] rounded-[14px] px-[18px] py-4 ${className}`}
        >
            <div className="flex items-center gap-2 text-[12px] font-semibold text-[#78716c]">
                {color && (
                    <span
                        aria-hidden="true"
                        className="w-2 h-2 rounded-[2px] flex-shrink-0"
                        style={{ backgroundColor: color }}
                    />
                )}
                <span>{label}</span>
            </div>
            <div
                className="mt-2 text-[26px] md:text-[30px] font-extrabold tracking-[-0.02em] tabular-nums leading-none"
                style={{ color: valueColor }}
            >
                {renderedValue}
            </div>
            {sub && <div className="mt-1.5 text-[12px] text-[#78716c]">{sub}</div>}
        </div>
    );
}

export default StatTile;
