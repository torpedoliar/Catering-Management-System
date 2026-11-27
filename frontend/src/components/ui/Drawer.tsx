import { ReactNode, useEffect, useRef, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export interface DrawerProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    side?: 'right' | 'left';
    widthClass?: string;
    footer?: ReactNode;
    children: ReactNode;
}

export function Drawer({
    open,
    onClose,
    title,
    subtitle,
    side = 'right',
    widthClass = 'w-full max-w-[380px]',
    footer,
    children,
}: DrawerProps) {
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement>(null);
    const prevFocusRef = useRef<HTMLElement | null>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!open) return;
        prevFocusRef.current = document.activeElement as HTMLElement | null;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const focusTimer = setTimeout(() => {
            panelRef.current?.focus();
        }, 10);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCloseRef.current();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = originalOverflow;
            prevFocusRef.current?.focus?.();
        };
    }, [open]);

    const initialX = side === 'right' ? '100%' : '-100%';

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 flex">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-[rgba(28,25,23,0.45)]"
                        aria-hidden="true"
                    />
                    <motion.div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={title ? titleId : undefined}
                        tabIndex={-1}
                        initial={{ x: initialX }}
                        animate={{ x: 0 }}
                        exit={{ x: initialX }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        className={`relative z-10 ${side === 'right' ? 'ml-auto' : 'mr-auto'} ${widthClass} h-full bg-[#fff] border-${side === 'right' ? 'l' : 'r'} border-[#e7e5e4] shadow-[0_20px_50px_rgba(28,25,23,0.2)] flex flex-col focus:outline-none`}
                    >
                        {(title || subtitle) && (
                            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#f0efed]">
                                <div>
                                    {title && (
                                        <h2 id={titleId} className="m-0 text-[16px] font-bold text-[#1c1917]">
                                            {title}
                                        </h2>
                                    )}
                                    {subtitle && (
                                        <p className="mt-1 mb-0 text-[12px] text-[#78716c]">{subtitle}</p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    aria-label="Tutup panel"
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center text-[#78716c] hover:bg-[#f5f5f4] hover:text-[#1c1917] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        <div className="p-5 overflow-y-auto flex-1">{children}</div>
                        {footer && (
                            <div className="px-5 py-3.5 border-t border-[#f0efed] bg-[#fafaf9] flex items-center justify-end gap-2.5">
                                {footer}
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

export default Drawer;
