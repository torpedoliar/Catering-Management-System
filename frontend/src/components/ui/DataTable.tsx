import { ReactNode, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, ArrowUp, ArrowDown, ArrowUpDown, MoreHorizontal } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { SkeletonTable } from './Skeleton';

export interface DataTableColumn<T> {
    key: string;
    header: string;
    align?: 'left' | 'right' | 'center';
    sortable?: boolean;
    width?: string;
    render: (row: T) => ReactNode;
}

export interface DataTableFilter {
    key: string;
    label: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
}

export interface DataTableRowAction<T> {
    label: string;
    onClick: (row: T) => void;
    danger?: boolean;
    hidden?: (row: T) => boolean;
}

export interface DataTableBulkAction {
    label: string;
    onClick: (selectedIds: string[]) => void;
    variant?: 'default' | 'danger';
}

export interface DataTableProps<T> {
    data: T[];
    columns: DataTableColumn<T>[];
    getRowId: (row: T) => string;
    loading?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyAction?: ReactNode;
    // Search & filter toolbar
    searchValue?: string;
    onSearchChange?: (value: string) => void;
    searchPlaceholder?: string;
    filters?: DataTableFilter[];
    onResetFilters?: () => void;
    // Sorting
    sortKey?: string;
    sortDir?: 'asc' | 'desc';
    onSortChange?: (key: string) => void;
    // Selection & bulk bar
    selectable?: boolean;
    selectedIds?: string[];
    onSelectionChange?: (ids: string[]) => void;
    bulkActions?: DataTableBulkAction[];
    // Row actions (⋯ menu)
    rowActions?: DataTableRowAction<T>[];
    getRowLabel?: (row: T) => string;
    onRowClick?: (row: T) => void;
    minTableWidth?: string;
    footer?: ReactNode;
}

export function DataTable<T>({
    data,
    columns,
    getRowId,
    loading = false,
    emptyTitle = 'Tidak ada data',
    emptyDescription = 'Coba ubah kata kunci pencarian atau filter yang dipilih.',
    emptyAction,
    searchValue,
    onSearchChange,
    searchPlaceholder = 'Cari…',
    filters,
    onResetFilters,
    sortKey,
    sortDir = 'asc',
    onSortChange,
    selectable = false,
    selectedIds = [],
    onSelectionChange,
    bulkActions = [],
    rowActions,
    getRowLabel,
    onRowClick,
    minTableWidth = '880px',
    footer,
}: DataTableProps<T>) {
    // Local input state with 300ms debounce for search
    const [localSearch, setLocalSearch] = useState(searchValue ?? '');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    useEffect(() => {
        if (searchValue !== undefined && searchValue !== localSearch) {
            setLocalSearch(searchValue);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchValue]);

    useEffect(() => {
        if (!openMenuId) return;
        const onDocClick = () => setOpenMenuId(null);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpenMenuId(null);
        };
        document.addEventListener('click', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('click', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [openMenuId]);

    const handleSearchInput = (val: string) => {
        setLocalSearch(val);
        if (!onSearchChange) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            onSearchChange(val);
        }, 300);
    };

    const rowIds = data.map(getRowId);
    const allSelected = selectable && rowIds.length > 0 && rowIds.every((id) => selectedIds.includes(id));

    const toggleAll = () => {
        if (!onSelectionChange) return;
        if (allSelected) {
            onSelectionChange(selectedIds.filter((id) => !rowIds.includes(id)));
        } else {
            const merged = Array.from(new Set([...selectedIds, ...rowIds]));
            onSelectionChange(merged);
        }
    };

    const toggleOne = (id: string) => {
        if (!onSelectionChange) return;
        if (selectedIds.includes(id)) {
            onSelectionChange(selectedIds.filter((x) => x !== id));
        } else {
            onSelectionChange([...selectedIds, id]);
        }
    };

    const showToolbar = Boolean(onSearchChange || (filters && filters.length > 0) || onResetFilters);

    return (
        <section className="w-full max-w-full min-w-0 bg-[#fff] border border-[#e7e5e4] rounded-[14px] overflow-hidden">
            {showToolbar && (
                <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5 border-b border-[#f0efed]">
                    {onSearchChange && (
                        <label className="flex items-center gap-2 h-9 border border-[#e7e5e4] rounded-[9px] px-2.5 flex-1 min-w-[220px] max-w-[340px] text-[#78716c] focus-within:border-[#f59e0b] focus-within:ring-2 focus-within:ring-[#f59e0b]/20">
                            <Search className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                            <input
                                type="text"
                                aria-label={searchPlaceholder}
                                placeholder={searchPlaceholder}
                                value={localSearch}
                                onChange={(e) => handleSearchInput(e.target.value)}
                                className="border-0 outline-none flex-1 text-[13px] text-[#1c1917] bg-transparent placeholder:text-[#a8a29e]"
                            />
                        </label>
                    )}

                    {filters?.map((f) => (
                        <label
                            key={f.key}
                            className="flex items-center gap-1.5 h-9 border border-[#e7e5e4] rounded-[9px] px-2.5 text-[13px] text-[#78716c] bg-[#fff]"
                        >
                            <span>{f.label}</span>
                            <select
                                aria-label={f.label}
                                value={f.value}
                                onChange={(e) => f.onChange(e.target.value)}
                                className="border-0 outline-none text-[13px] font-semibold text-[#1c1917] bg-transparent cursor-pointer"
                            >
                                {f.options.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ))}

                    {onResetFilters && (
                        <button
                            type="button"
                            onClick={() => {
                                setLocalSearch('');
                                onResetFilters();
                            }}
                            className="border-0 bg-transparent text-[#b45309] text-[13px] font-semibold cursor-pointer px-2 py-1 rounded-[8px] hover:bg-[#fffbeb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
                        >
                            Reset
                        </button>
                    )}
                </div>
            )}

            {selectable && selectedIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-[#1c1917] text-[#fff] text-[13px]">
                    <b className="tabular-nums">{selectedIds.length} dipilih</b>
                    {bulkActions.map((act) => (
                        <button
                            key={act.label}
                            type="button"
                            onClick={() => act.onClick(selectedIds)}
                            className={`h-[30px] border rounded-[8px] px-2.5 text-[12.5px] font-medium cursor-pointer transition-colors ${
                                act.variant === 'danger'
                                    ? 'border-[#b91c1c] bg-[#b91c1c]/20 text-[#fecaca] hover:bg-[#b91c1c]/40'
                                    : 'border-[#44403c] bg-transparent text-[#fff] hover:bg-[#292524]'
                            }`}
                        >
                            {act.label}
                        </button>
                    ))}
                    <div className="flex-1" />
                    <button
                        type="button"
                        onClick={() => onSelectionChange?.([])}
                        className="border-0 bg-transparent text-[#fbbf24] font-semibold cursor-pointer hover:underline"
                    >
                        Batal pilih
                    </button>
                </div>
            )}

            {loading ? (
                <SkeletonTable rows={6} cols={columns.length + (selectable ? 1 : 0)} />
            ) : data.length === 0 ? (
                <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
            ) : (
                <div className="w-full overflow-x-auto [contain:layout]">
                    <table
                        className="w-full border-collapse text-[13px]"
                        style={{ minWidth: minTableWidth }}
                    >
                        <thead>
                            <tr className="bg-[#fafaf9] text-[#57534e] text-left">
                                {selectable && (
                                    <th className="py-2.5 px-4 w-7">
                                        <input
                                            type="checkbox"
                                            aria-label="Pilih semua"
                                            checked={allSelected}
                                            onChange={toggleAll}
                                            className="w-4 h-4 accent-[#f59e0b] cursor-pointer"
                                        />
                                    </th>
                                )}
                                {columns.map((col) => {
                                    const isSorted = sortKey === col.key;
                                    const alignClass =
                                        col.align === 'right'
                                            ? 'text-right'
                                            : col.align === 'center'
                                                ? 'text-center'
                                                : 'text-left';
                                    return (
                                        <th
                                            key={col.key}
                                            style={{ width: col.width }}
                                            className={`py-2.5 px-2.5 font-semibold ${alignClass}`}
                                        >
                                            {col.sortable && onSortChange ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onSortChange(col.key)}
                                                    className="inline-flex items-center gap-1 font-semibold text-[#57534e] hover:text-[#1c1917] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] rounded"
                                                >
                                                    <span>{col.header}</span>
                                                    {isSorted ? (
                                                        sortDir === 'asc' ? (
                                                            <ArrowUp className="w-3.5 h-3.5 text-[#1c1917]" aria-hidden="true" />
                                                        ) : (
                                                            <ArrowDown className="w-3.5 h-3.5 text-[#1c1917]" aria-hidden="true" />
                                                        )
                                                    ) : (
                                                        <ArrowUpDown className="w-3 h-3 text-[#a8a29e]" aria-hidden="true" />
                                                    )}
                                                </button>
                                            ) : (
                                                col.header
                                            )}
                                        </th>
                                    );
                                })}
                                {rowActions && rowActions.length > 0 && (
                                    <th className="py-2.5 px-4 w-10">
                                        <span className="sr-only">Aksi</span>
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, idx) => {
                                const id = getRowId(row);
                                const isSelected = selectable && selectedIds.includes(id);
                                const visibleActions = rowActions?.filter((a) => !a.hidden?.(row)) || [];
                                const label = getRowLabel ? getRowLabel(row) : id;

                                return (
                                    <motion.tr
                                        key={id}
                                        initial={idx < 10 ? { opacity: 0, y: 4 } : false}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{
                                            duration: 0.16,
                                            ease: 'easeOut',
                                            delay: idx < 10 ? idx * 0.02 : 0,
                                        }}
                                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                                        className={[
                                            'border-t border-[#f5f5f4] transition-colors',
                                            isSelected ? 'bg-[#fffbeb]' : 'hover:bg-[#fafaf9]',
                                            onRowClick ? 'cursor-pointer' : '',
                                        ].join(' ')}
                                    >
                                        {selectable && (
                                            <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Pilih ${label}`}
                                                    checked={isSelected}
                                                    onChange={() => toggleOne(id)}
                                                    className="w-4 h-4 accent-[#f59e0b] cursor-pointer"
                                                />
                                            </td>
                                        )}
                                        {columns.map((col) => {
                                            const alignClass =
                                                col.align === 'right'
                                                    ? 'text-right'
                                                    : col.align === 'center'
                                                        ? 'text-center'
                                                        : 'text-left';
                                            return (
                                                <td key={col.key} className={`py-2.5 px-2.5 ${alignClass}`}>
                                                    {col.render(row)}
                                                </td>
                                            );
                                        })}
                                        {rowActions && rowActions.length > 0 && (
                                            <td
                                                className="py-2.5 px-4 relative text-right"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {visibleActions.length > 0 && (
                                                    <div className="relative inline-block">
                                                        <button
                                                            type="button"
                                                            aria-label={`Aksi untuk ${label}`}
                                                            aria-expanded={openMenuId === id}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setOpenMenuId(openMenuId === id ? null : id);
                                                            }}
                                                            className="w-[30px] h-[30px] rounded-[8px] inline-flex items-center justify-center text-[#78716c] hover:bg-[#f5f5f4] hover:text-[#1c1917] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
                                                        >
                                                            <MoreHorizontal className="w-4 h-4" />
                                                        </button>
                                                        {openMenuId === id && (
                                                            <div
                                                                role="menu"
                                                                className="absolute right-0 mt-1 w-44 bg-[#fff] border border-[#e7e5e4] rounded-[10px] shadow-[0_8px_24px_rgba(28,25,23,0.12)] py-1 z-30 text-left"
                                                            >
                                                                {visibleActions.map((action) => (
                                                                    <button
                                                                        key={action.label}
                                                                        type="button"
                                                                        role="menuitem"
                                                                        onClick={() => {
                                                                            setOpenMenuId(null);
                                                                            action.onClick(row);
                                                                        }}
                                                                        className={`w-full text-left px-3 py-2 text-[13px] font-medium cursor-pointer transition-colors ${
                                                                            action.danger
                                                                                ? 'text-[#b91c1c] hover:bg-[#fee2e2]/50'
                                                                                : 'text-[#1c1917] hover:bg-[#fafaf9]'
                                                                        }`}
                                                                    >
                                                                        {action.label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                    </motion.tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {footer}
        </section>
    );
}

export default DataTable;
