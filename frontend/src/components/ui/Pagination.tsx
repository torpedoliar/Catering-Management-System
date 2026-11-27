import { useState, useEffect, FormEvent } from 'react';

export interface PaginationProps {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
    onLimitChange?: (limit: number) => void;
    variant?: 'admin' | 'user';
    pageSizeOptions?: number[];
    showJumpToPage?: boolean;
    className?: string;
}

function buildPageList(current: number, last: number): Array<number | 'ellipsis-left' | 'ellipsis-right'> {
    if (last <= 7) {
        return Array.from({ length: last }, (_, i) => i + 1);
    }
    const items: Array<number | 'ellipsis-left' | 'ellipsis-right'> = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(last - 1, current + 1);

    if (start > 2) items.push('ellipsis-left');
    for (let p = start; p <= end; p++) items.push(p);
    if (end < last - 1) items.push('ellipsis-right');
    items.push(last);
    return items;
}

export function Pagination({
    page,
    limit,
    total,
    onPageChange,
    onLimitChange,
    variant = 'admin',
    pageSizeOptions,
    showJumpToPage,
    className = '',
}: PaginationProps) {
    const lastPage = Math.max(1, Math.ceil(total / Math.max(1, limit)));
    const safePage = Math.max(1, Math.min(lastPage, page));
    const from = total === 0 ? 0 : (safePage - 1) * limit + 1;
    const to = Math.min(total, safePage * limit);

    const sizes = pageSizeOptions || (variant === 'admin' ? [10, 25, 50, 100] : [8, 20, 50]);
    const showJump = showJumpToPage ?? variant === 'admin';

    const [jumpVal, setJumpVal] = useState(String(safePage));
    useEffect(() => {
        setJumpVal(String(safePage));
    }, [safePage]);

    const handleJumpSubmit = (e: FormEvent) => {
        e.preventDefault();
        const parsed = parseInt(jumpVal, 10);
        if (!Number.isNaN(parsed)) {
            onPageChange(Math.max(1, Math.min(lastPage, parsed)));
        }
    };

    const pages = buildPageList(safePage, lastPage);

    return (
        <nav
            aria-label="Halaman"
            className={`flex flex-wrap items-center gap-3 px-4 py-3 border-t border-[#e7e5e4] bg-[#fafaf9] text-[13px] text-[#57534e] ${className}`}
        >
            <span className="tabular-nums">
                Menampilkan <b className="text-[#1c1917]">{from.toLocaleString('id-ID')}–{to.toLocaleString('id-ID')}</b> dari{' '}
                <b className="text-[#1c1917]">{total.toLocaleString('id-ID')}</b>
            </span>

            <div className="flex-1" />

            {onLimitChange && (
                <label className="flex items-center gap-1.5">
                    <span>Per halaman</span>
                    <select
                        aria-label="Jumlah data per halaman"
                        value={limit}
                        onChange={(e) => onLimitChange(Number(e.target.value))}
                        className="text-[13px] border border-[#e7e5e4] rounded-[8px] px-2 py-1 bg-[#fff] text-[#1c1917] font-semibold focus:outline-none focus:ring-2 focus:ring-[#f59e0b]"
                    >
                        {sizes.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            <div className="flex items-center gap-1">
                <button
                    type="button"
                    aria-label="Sebelumnya"
                    disabled={safePage <= 1}
                    onClick={() => onPageChange(safePage - 1)}
                    className="min-w-[32px] h-8 px-2 rounded-[8px] border border-[#e7e5e4] bg-[#fff] text-[#44403c] text-[15px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#fafaf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
                >
                    ‹
                </button>
                {pages.map((item) =>
                    typeof item === 'string' ? (
                        <span
                            key={item}
                            className="min-w-[28px] h-8 inline-flex items-center justify-center text-[#78716c] select-none"
                        >
                            …
                        </span>
                    ) : (
                        <button
                            key={item}
                            type="button"
                            aria-label={`Halaman ${item}`}
                            aria-current={item === safePage ? 'page' : undefined}
                            onClick={() => onPageChange(item)}
                            className={[
                                'min-w-[32px] h-8 px-2 rounded-[8px] text-[13px] tabular-nums transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]',
                                item === safePage
                                    ? 'border border-[#1c1917] bg-[#1c1917] text-[#fff] font-bold'
                                    : 'border border-[#e7e5e4] bg-[#fff] text-[#44403c] hover:bg-[#fafaf9]',
                            ].join(' ')}
                        >
                            {item}
                        </button>
                    )
                )}
                <button
                    type="button"
                    aria-label="Berikutnya"
                    disabled={safePage >= lastPage}
                    onClick={() => onPageChange(safePage + 1)}
                    className="min-w-[32px] h-8 px-2 rounded-[8px] border border-[#e7e5e4] bg-[#fff] text-[#44403c] text-[15px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#fafaf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
                >
                    ›
                </button>
            </div>

            {showJump && lastPage > 1 && (
                <form onSubmit={handleJumpSubmit} className="flex items-center gap-1.5">
                    <label htmlFor="pagination-jump" className="text-[13px]">
                        Ke hal.
                    </label>
                    <input
                        id="pagination-jump"
                        aria-label="Ke halaman"
                        type="number"
                        min={1}
                        max={lastPage}
                        value={jumpVal}
                        onChange={(e) => setJumpVal(e.target.value)}
                        onBlur={() => {
                            const parsed = parseInt(jumpVal, 10);
                            if (!Number.isNaN(parsed) && parsed !== safePage) {
                                onPageChange(Math.max(1, Math.min(lastPage, parsed)));
                            }
                        }}
                        className="w-12 h-[30px] border border-[#e7e5e4] rounded-[8px] text-center text-[13px] bg-[#fff] text-[#1c1917] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#f59e0b]"
                    />
                </form>
            )}
        </nav>
    );
}

export default Pagination;
