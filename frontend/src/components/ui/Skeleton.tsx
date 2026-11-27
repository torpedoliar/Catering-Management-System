export interface SkeletonProps {
    className?: string;
    width?: string | number;
    height?: string | number;
}

export function Skeleton({ className = '', width, height }: SkeletonProps) {
    return (
        <div
            aria-hidden="true"
            className={`sk-shimmer rounded-[8px] ${className}`}
            style={{ width, height }}
        />
    );
}

export function SkeletonCard({ lines = 4, className = '' }: { lines?: number; className?: string }) {
    const widths = ['60%', '40%', '85%', '70%'];
    return (
        <div
            aria-hidden="true"
            className={`bg-[#fff] border border-[#e7e5e4] rounded-[14px] p-5 flex flex-col gap-2.5 ${className}`}
        >
            {Array.from({ length: lines }).map((_, idx) => (
                <Skeleton
                    key={idx}
                    height={idx === 1 ? 32 : idx === 0 ? 14 : 10}
                    width={widths[idx % widths.length]}
                />
            ))}
        </div>
    );
}

export function SkeletonTable({
    rows = 5,
    cols = 6,
}: {
    rows?: number;
    cols?: number;
}) {
    return (
        <div aria-hidden="true" className="divide-y divide-[#f5f5f4]">
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="flex items-center gap-4 px-4 py-3.5">
                    {Array.from({ length: cols }).map((__, c) => (
                        <Skeleton
                            key={c}
                            className="flex-1"
                            height={c === 0 ? 18 : 14}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

export default Skeleton;
