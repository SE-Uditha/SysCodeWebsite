import Link, { type LinkProps } from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  href?: string;
  onClick?: () => void;
  onNavigate?: LinkProps['onNavigate'];
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'onOrange';
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
};

export function GradientButton({ href, onClick, onNavigate, children, variant = 'primary', className = '', type = 'button', disabled = false }: Props) {
  const base =
    'motion-button inline-flex min-h-12 min-w-0 max-w-full flex-wrap items-center justify-center gap-2 rounded-xl px-5 py-3 text-center leading-5 whitespace-normal transition-colors duration-200 [overflow-wrap:anywhere] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:transition-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:transition-none [&_svg]:shrink-0';

  const typography = variant === 'onOrange'
    ? 'font-heading text-sm font-bold tracking-[0.02em] min-[1600px]:text-base'
    : 'text-[13px] font-semibold min-[1600px]:text-sm';

  const focus = variant === 'onOrange'
    ? 'focus-visible:ring-orange-950 focus-visible:ring-offset-brand'
    : 'focus-visible:ring-orange-600 focus-visible:ring-offset-white';

  const variants = {
    primary: 'border border-brand bg-gradient-to-br from-orange-300 via-brand to-orange-400 text-black shadow-[inset_0_1px_0_#ffffff66,0_8px_20px_-12px_#ff660080] hover:from-orange-200 hover:to-orange-300 [&_svg]:text-black',
    secondary: 'border border-orange-200 bg-white text-black shadow-[0_3px_8px_-6px_#ff660040] hover:border-orange-300 hover:bg-orange-50 [&_svg]:text-orange-700',
    ghost: 'text-orange-700 hover:bg-orange-50 hover:text-orange-800',
    onOrange: 'border border-white bg-white text-orange-700 [text-shadow:none] hover:bg-orange-50 hover:text-orange-800 [&_svg]:text-orange-700',
  };

  const classes = `${base} ${typography} ${focus} ${variants[variant]} ${className}`.trim();

  if (href && disabled) {
    return <span role="link" aria-disabled="true" className={classes}>{children}</span>;
  }

  if (href) {
    return (
      <Link href={href} onClick={onClick} onNavigate={onNavigate} className={classes} aria-disabled={disabled}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={classes} disabled={disabled}>
      {children}
    </button>
  );
}
