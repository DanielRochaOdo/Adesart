import { ButtonHTMLAttributes } from 'react';
import { Loader2, LucideIcon } from 'lucide-react';

interface LinkActionIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  tone?: 'default' | 'danger' | 'success';
  loading?: boolean;
}

export function LinkActionIconButton({
  icon: Icon,
  label,
  tone = 'default',
  loading = false,
  className = '',
  disabled,
  type = 'button',
  ...props
}: LinkActionIconButtonProps) {
  const toneClasses = {
    default: 'border-slate-400/20 bg-white/35 text-slate-600 hover:border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-700 dark:bg-white/[0.035] dark:text-slate-300 dark:hover:text-emerald-300',
    danger: 'border-red-500/20 bg-red-500/[0.06] text-red-600 hover:border-red-500/30 hover:bg-red-500/12 hover:text-red-700 dark:text-red-300',
    success: 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-600 hover:border-emerald-500/30 hover:bg-emerald-500/14 hover:text-emerald-700 dark:text-emerald-300',
  };

  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      disabled={disabled || loading}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_6px_16px_rgba(15,23,42,.05)] backdrop-blur-md transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Icon className="w-4 h-4" />
      )}
    </button>
  );
}
