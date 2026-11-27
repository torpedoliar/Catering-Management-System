import toast, { Toaster, resolveValue, Toast } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';

type ClickableToast = Toast & { onClick?: () => void };

function getDotColor(t: Toast): string {
    switch (t.type) {
        case 'success':
            return '#16a34a';
        case 'error':
            return '#dc2626';
        case 'loading':
            return '#f59e0b';
        default:
            return '#2563eb';
    }
}

export function AppToaster() {
    return (
        <Toaster
            position="bottom-right"
            gutter={10}
            toastOptions={{
                duration: 4000,
            }}
        >
            {(t) => {
                const dotColor = getDotColor(t);
                const content = resolveValue(t.message, t);
                const toastOnClick = (t as ClickableToast).onClick;
                const handleActivate = toastOnClick
                    ? () => {
                          toast.dismiss(t.id);
                          toastOnClick();
                      }
                    : undefined;
                return (
                    <AnimatePresence>
                        {t.visible && (
                            <motion.div
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{
                                    duration: t.visible ? 0.2 : 0.15,
                                    ease: 'easeOut',
                                }}
                                onClick={handleActivate}
                                onKeyDown={
                                    handleActivate
                                        ? (e) => {
                                              if (e.key === 'Enter' || e.key === ' ') {
                                                  e.preventDefault();
                                                  handleActivate();
                                              }
                                          }
                                        : undefined
                                }
                                tabIndex={handleActivate ? 0 : undefined}
                                role={handleActivate ? 'button' : t.type === 'error' ? 'alert' : 'status'}
                                className={`pointer-events-auto flex items-start gap-2.5 max-w-[360px] w-full bg-[#fff] text-[#1c1917] border border-[#e7e5e4] rounded-[12px] px-3.5 py-3 shadow-[0_8px_24px_rgba(28,25,23,0.08)] ${
                                    handleActivate
                                        ? 'cursor-pointer hover:border-[#d6d3d1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]'
                                        : ''
                                }`}
                            >
                                {t.type === 'loading' ? (
                                    <span
                                        aria-hidden="true"
                                        className="w-3 h-3 mt-1 rounded-full border-2 border-[#f59e0b] border-r-transparent animate-spin flex-shrink-0"
                                    />
                                ) : (
                                    <span
                                        aria-hidden="true"
                                        className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: dotColor }}
                                    />
                                )}
                                <div className="flex-1 min-w-0 text-[13px] font-semibold leading-snug text-[#1c1917]">
                                    {content}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                );
            }}
        </Toaster>
    );
}

export default AppToaster;
