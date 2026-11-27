import { ReactNode, useEffect, useRef, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    footer?: ReactNode;
    children: ReactNode;
    closeOnOverlayClick?: boolean;
}

const SIZE_MAP = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
    const selectors = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    return Array.from(container.querySelectorAll<HTMLElement>(selectors)).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
    );
}

export function Modal({
    open,
    onClose,
    title,
    description,
    size = 'md',
    footer,
    children,
    closeOnOverlayClick = true,
}: ModalProps) {
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
            if (!panelRef.current) return;
            const focusable = getFocusableElements(panelRef.current);
            if (focusable.length > 0) {
                focusable[0].focus();
            } else {
                panelRef.current.focus();
            }
        }, 10);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (e.key === 'Tab' && panelRef.current) {
                const focusable = getFocusableElements(panelRef.current);
                if (focusable.length === 0) {
                    e.preventDefault();
                    return;
                }
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
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

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        onClick={() => closeOnOverlayClick && onClose()}
                        className="fixed inset-0 bg-[rgba(28,25,23,0.45)]"
                        aria-hidden="true"
                    />
                    <motion.div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={title ? titleId : undefined}
                        tabIndex={-1}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        className={`relative z-10 w-full ${SIZE_MAP[size]} max-h-[90vh] flex flex-col bg-[#fff] border border-[#e7e5e4] rounded-[14px] shadow-[0_20px_50px_rgba(28,25,23,0.18)] overflow-hidden focus:outline-none`}
                    >
                        {(title || description) && (
                            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#f0efed]">
                                <div>
                                    {title && (
                                        <h2 id={titleId} className="m-0 text-[16px] font-bold text-[#1c1917]">
                                            {title}
                                        </h2>
                                    )}
                                    {description && (
                                        <p className="mt-1 mb-0 text-[13px] text-[#78716c]">{description}</p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    aria-label="Tutup dialog"
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

export default Modal;
