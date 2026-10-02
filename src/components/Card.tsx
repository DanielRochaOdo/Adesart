import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  title?: string;
  className?: string;
}

export function Card({ children, title, className = '' }: CardProps) {
  return (
    <div className={`vm-glass-card rounded-xl ${className}`}>
      {title && (
        <div className="px-6 py-4 border-b border-slate-200/70 dark:border-white/10">
          <h2 className="vm-card-heading text-lg font-semibold">{title}</h2>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
