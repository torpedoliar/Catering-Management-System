export interface BarChartItem {
    label: string;
    value: number | null;
    highlight?: boolean;
    softHighlight?: boolean;
    color?: string;
}

export interface BarChartProps {
    data: BarChartItem[];
    height?: number;
    barMaxWidth?: number;
    emptyHeight?: number;
    className?: string;
}

export function BarChart({
    data,
    height = 170,
    barMaxWidth = 46,
    emptyHeight = 4,
    className = '',
}: BarChartProps) {
    const max = Math.max(
        1,
        ...data.map((d) => (typeof d.value === 'number' ? d.value : 0))
    );

    return (
        <div className={className}>
            <div
                className="flex items-end gap-2.5 md:gap-3.5 border-b border-[#e7e5e4] px-1.5"
                style={{ height: `${height + 28}px` }}
            >
                {data.map((item) => {
                    const hasVal = item.value !== null && item.value !== undefined;
                    const barHeight = !hasVal
                        ? emptyHeight
                        : Math.max(4, Math.round(((item.value as number) / max) * height));
                    const barColor =
                        item.color ||
                        (!hasVal
                            ? '#f0efed'
                            : item.highlight
                                ? '#f59e0b'
                                : item.softHighlight
                                    ? '#fde68a'
                                    : '#d6d3d1');

                    return (
                        <div
                            key={item.label}
                            className="flex-1 flex flex-col items-center justify-end h-full gap-1.5 min-w-0"
                        >
                            <span className="text-[11px] md:text-[12px] font-bold tabular-nums text-[#44403c] leading-none">
                                {hasVal ? item.value!.toLocaleString('id-ID') : ''}
                            </span>
                            <div
                                className="w-full rounded-t-[6px] transition-[height] duration-300 ease-out"
                                style={{
                                    maxWidth: `${barMaxWidth}px`,
                                    height: `${barHeight}px`,
                                    backgroundColor: barColor,
                                }}
                                title={hasVal ? `${item.label}: ${item.value}` : item.label}
                            />
                        </div>
                    );
                })}
            </div>
            <div className="flex gap-2.5 md:gap-3.5 px-1.5 pt-1.5">
                {data.map((item) => (
                    <span
                        key={item.label}
                        className={`flex-1 text-center text-[11px] md:text-[12px] truncate ${
                            item.highlight ? 'text-[#1c1917] font-bold' : 'text-[#78716c]'
                        }`}
                    >
                        {item.label}
                    </span>
                ))}
            </div>
        </div>
    );
}

export default BarChart;
