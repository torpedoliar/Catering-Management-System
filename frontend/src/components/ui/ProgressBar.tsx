export interface ProgressBarProps {
    value: number;
    max?: number;
    color?: string;
    height?: 'sm' | 'md';
    ariaLabel?: string;
    className?: string;
}

export function ProgressBar({
    value,
    max = 100,
    color = '#16a34a',
    height = 'md',
    ariaLabel,
    className = '',
}: ProgressBarProps) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

    return (
        <div
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={ariaLabel}
            className={`w-full bg-[#f5f5f4] rounded-full overflow-hidden ${
                height === 'sm' ? 'h-1.5' : 'h-2'
            } ${className}`}
        >
            <div
                className="h-full rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%`, backgroundColor: color }}
            />
        </div>
    );
}

export default ProgressBar;
