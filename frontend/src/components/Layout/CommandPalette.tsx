import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { getAllSearchableItemsForRole, UserRole } from './navConfig';

interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
    role?: UserRole;
}

export default function CommandPalette({ open, onClose, role }: CommandPaletteProps) {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);

    const allItems = useMemo(() => getAllSearchableItemsForRole(role), [role]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return allItems;
        return allItems.filter(
            (item) =>
                item.label.toLowerCase().includes(q) ||
                item.group.toLowerCase().includes(q) ||
                item.path.toLowerCase().includes(q) ||
                item.keywords?.some((k) => k.toLowerCase().includes(q))
        );
    }, [allItems, query]);

    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIdx(0);
        }
    }, [open]);

    useEffect(() => {
        setActiveIdx(0);
    }, [query]);

    const handleSelect = (path: string) => {
        onClose();
        navigate(path);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx((prev) =>
                filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
            );
        } else if (e.key === 'Enter' && filtered[activeIdx]) {
            e.preventDefault();
            handleSelect(filtered[activeIdx].path);
        }
    };

    return (
        <Modal open={open} onClose={onClose} size="md">
            <div onKeyDown={handleKeyDown} className="-m-5">
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#e7e5e4]">
                    <Search className="w-4 h-4 text-[#78716c] flex-shrink-0" aria-hidden="true" />
                    <input
                        type="text"
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Lompat ke halaman"
                        placeholder="Cari menu, karyawan, pesanan, atau halaman…"
                        className="flex-1 bg-transparent border-0 outline-none text-[14px] text-[#1c1917] placeholder:text-[#a8a29e]"
                    />
                    <kbd className="text-[11px] border border-[#e7e5e4] rounded-[6px] px-1.5 py-0.5 text-[#78716c]">
                        Esc
                    </kbd>
                </div>

                <div className="max-h-[340px] overflow-y-auto p-2">
                    {filtered.length === 0 ? (
                        <div className="py-10 text-center text-[13px] text-[#78716c]">
                            Halaman tidak ditemukan untuk &ldquo;{query}&rdquo;.
                        </div>
                    ) : (
                        <ul role="listbox" aria-label="Daftar halaman" className="space-y-0.5">
                            {filtered.map((item, idx) => {
                                const Icon = item.icon;
                                const isActive = idx === activeIdx;
                                return (
                                    <li key={item.path} role="option" aria-selected={isActive}>
                                        <button
                                            type="button"
                                            onMouseEnter={() => setActiveIdx(idx)}
                                            onClick={() => handleSelect(item.path)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-left transition-colors cursor-pointer ${
                                                isActive
                                                    ? 'bg-[#fffbeb] text-[#1c1917]'
                                                    : 'text-[#44403c] hover:bg-[#fafaf9]'
                                            }`}
                                        >
                                            <span
                                                className={`w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 ${
                                                    isActive
                                                        ? 'bg-[#fef3c7] text-[#b45309]'
                                                        : 'bg-[#f5f5f4] text-[#57534e]'
                                                }`}
                                            >
                                                <Icon className="w-4 h-4" aria-hidden="true" />
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-[13.5px] font-semibold truncate">
                                                    {item.label}
                                                </span>
                                                <span className="block text-[11.5px] text-[#78716c]">
                                                    {item.group}
                                                </span>
                                            </span>
                                            {isActive && (
                                                <ArrowRight
                                                    className="w-4 h-4 text-[#b45309] flex-shrink-0"
                                                    aria-hidden="true"
                                                />
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <div className="px-4 py-2.5 border-t border-[#f0efed] bg-[#fafaf9] flex items-center justify-between text-[11.5px] text-[#78716c]">
                    <span>Gunakan ↑ ↓ untuk memilih, Enter untuk membuka</span>
                    <span>Pintasan: Ctrl K</span>
                </div>
            </div>
        </Modal>
    );
}
