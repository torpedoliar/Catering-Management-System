import { ReactNode, HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLElement> {
    padding?: 'none' | 'sm' | 'md';
    children: ReactNode;
}

const PADDING_MAP = {
    none: '',
    sm: 'p-4',
    md: 'p-5',
};

export function Card({ padding = 'md', className = '', children, ...rest }: CardProps) {
    return (
        <section
            className={[
                'w-full min-w-0 bg-[#fff] border border-[#e7e5e4] rounded-[14px]',
                PADDING_MAP[padding],
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            {...rest}
        >
            {children}
        </section>
    );
}

export default Card;
