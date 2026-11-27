import {
    forwardRef,
    InputHTMLAttributes,
    SelectHTMLAttributes,
    TextareaHTMLAttributes,
    ReactNode,
    useId,
} from 'react';

export interface FieldProps {
    label?: string;
    htmlFor?: string;
    error?: string;
    hint?: string;
    required?: boolean;
    className?: string;
    children: ReactNode;
}

export function Field({
    label,
    htmlFor,
    error,
    hint,
    required,
    className = '',
    children,
}: FieldProps) {
    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            {label && (
                <label
                    htmlFor={htmlFor}
                    className={`text-[12px] font-semibold ${
                        error ? 'text-[#b91c1c]' : 'text-[#44403c]'
                    }`}
                >
                    {label}
                    {required && <span className="text-[#b91c1c] ml-0.5">*</span>}
                </label>
            )}
            {children}
            {error ? (
                <span role="alert" className="text-[12px] font-medium text-[#b91c1c]">
                    {error}
                </span>
            ) : hint ? (
                <span className="text-[12px] text-[#78716c]">{hint}</span>
            ) : null}
        </div>
    );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    error?: string;
    label?: string;
    hint?: string;
    leftIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ error, label, hint, leftIcon, id, required, className = '', ...rest }, ref) => {
        const autoId = useId();
        const inputId = id || autoId;

        const control = (
            <div className="relative flex items-center">
                {leftIcon && (
                    <span className="absolute left-3 text-[#78716c] pointer-events-none inline-flex">
                        {leftIcon}
                    </span>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    aria-invalid={error ? true : undefined}
                    required={required}
                    className={[
                        'w-full h-10 rounded-[10px] bg-[#fff] text-[14px] text-[#1c1917] placeholder:text-[#a8a29e]',
                        'transition-colors duration-150 focus:outline-none',
                        leftIcon ? 'pl-9 pr-3' : 'px-3',
                        error
                            ? 'border-2 border-[#dc2626] focus:ring-2 focus:ring-[#dc2626]/20'
                            : 'border border-[#d6d3d1] focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/25',
                        rest.disabled ? 'bg-[#fafaf9] text-[#a8a29e] cursor-not-allowed' : '',
                        className,
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    {...rest}
                />
            </div>
        );

        if (label !== undefined || error !== undefined || hint !== undefined) {
            return (
                <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required}>
                    {control}
                </Field>
            );
        }
        return control;
    }
);
Input.displayName = 'Input';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    error?: string;
    label?: string;
    hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ error, label, hint, id, required, className = '', children, ...rest }, ref) => {
        const autoId = useId();
        const selectId = id || autoId;

        const control = (
            <select
                ref={ref}
                id={selectId}
                aria-invalid={error ? true : undefined}
                required={required}
                className={[
                    'w-full h-10 rounded-[10px] bg-[#fff] px-3 text-[14px] text-[#1c1917]',
                    'transition-colors duration-150 focus:outline-none',
                    error
                        ? 'border-2 border-[#dc2626] focus:ring-2 focus:ring-[#dc2626]/20'
                        : 'border border-[#d6d3d1] focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/25',
                    rest.disabled ? 'bg-[#fafaf9] text-[#a8a29e] cursor-not-allowed' : 'cursor-pointer',
                    className,
                ]
                    .filter(Boolean)
                    .join(' ')}
                {...rest}
            >
                {children}
            </select>
        );

        if (label !== undefined || error !== undefined || hint !== undefined) {
            return (
                <Field label={label} htmlFor={selectId} error={error} hint={hint} required={required}>
                    {control}
                </Field>
            );
        }
        return control;
    }
);
Select.displayName = 'Select';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    error?: string;
    label?: string;
    hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ error, label, hint, id, required, className = '', ...rest }, ref) => {
        const autoId = useId();
        const textareaId = id || autoId;

        const control = (
            <textarea
                ref={ref}
                id={textareaId}
                aria-invalid={error ? true : undefined}
                required={required}
                className={[
                    'w-full min-h-[88px] rounded-[10px] bg-[#fff] px-3 py-2.5 text-[14px] text-[#1c1917] placeholder:text-[#a8a29e]',
                    'transition-colors duration-150 focus:outline-none',
                    error
                        ? 'border-2 border-[#dc2626] focus:ring-2 focus:ring-[#dc2626]/20'
                        : 'border border-[#d6d3d1] focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/25',
                    rest.disabled ? 'bg-[#fafaf9] text-[#a8a29e] cursor-not-allowed' : '',
                    className,
                ]
                    .filter(Boolean)
                    .join(' ')}
                {...rest}
            />
        );

        if (label !== undefined || error !== undefined || hint !== undefined) {
            return (
                <Field label={label} htmlFor={textareaId} error={error} hint={hint} required={required}>
                    {control}
                </Field>
            );
        }
        return control;
    }
);
Textarea.displayName = 'Textarea';
