import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  children: ReactNode;
}

export function Button({ variant = 'primary', children, className = '', ...props }: ButtonProps) {
  const baseClasses = 'px-4 py-2 rounded-lg font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center';

  const variantClasses = {
    primary: 'vm-glass-primary text-white hover:brightness-105 active:brightness-95',
    secondary: 'vm-glass-secondary text-slate-700 hover:bg-white/80 active:scale-[0.99] dark:text-slate-200 dark:hover:bg-white/10',
    danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
