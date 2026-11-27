import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    loadingText?: string;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: 'bg-[#f59e0b] text-[#1c1917] font-bold hover:bg-[#d97706] active:bg-[#b45309] border border-transparent',
    secondary: 'bg-[#fff] text-[#44403c] font-semibold border border-[#e7e5e4] hover:bg-[#fafaf9] active:bg-[#f5f5f4]',
    ghost: 'bg-transparent text-[#b45309] font-semibold border border-transparent hover:bg-[#fffbeb] active:bg-[#fef3c7]',
    danger: 'bg-[#b91c1c] text-[#fff] font-bold border border-transparent hover:bg-[#991b1b] active:bg-[#7f1d1d]',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-[13px] rounded-[8px] gap-1.5',
    md: 'h-[38px] md:h-10 px-4 text-[13.5px] rounded-[10px] gap-2',
    lg: 'h-12 px-5 text-[15px] rounded-[12px] gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            variant = 'primary',
            size = 'md',
            loading = false,
            loadingText = 'Menyimpan…',
            leftIcon,
            rightIcon,
            disabled,
            className = '',
            children,
            type = 'button',
            ...rest
        },
        ref
    ) => {
        const isDisabled = disabled || loading;

        return (
            <button
                ref={ref}
                type={type}
                disabled={isDisabled}
                aria-busy={loading || undefined}
                className={[
                    'inline-flex items-center justify-center whitespace-nowrap transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b] focus-visible:ring-offset-2',
                    SIZE_CLASSES[size],
                    isDisabled && !loading
                        ? 'bg-[#f5f5f4] text-[#a8a29e] border border-transparent font-bold cursor-not-allowed'
                        : VARIANT_CLASSES[variant],
                    loading ? 'cursor-wait opacity-90' : '',
                    className,
                ]
                    .filter(Boolean)
                    .join(' ')}
                {...rest}
            >
                {loading ? (
                    <>
                        <span
                            aria-hidden="true"
                            className={`w-3.5 h-3.5 rounded-full border-2 border-r-transparent animate-spin inline-block flex-shrink-0 ${
                                variant === 'danger' ? 'border-[#fff]' : 'border-[#1c1917]'
                            }`}
                        />
                        <span>{loadingText}</span>
                    </>
                ) : (
                    <>
                        {leftIcon && <span className="flex-shrink-0 inline-flex">{leftIcon}</span>}
                        {children}
                        {rightIcon && <span className="flex-shrink-0 inline-flex">{rightIcon}</span>}
                    </>
                )}
            </button>
        );
    }
);

Button.displayName = 'Button';
export default Button;
