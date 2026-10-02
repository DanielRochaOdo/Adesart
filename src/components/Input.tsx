import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  disableAutofill?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', disableAutofill = false, ...props }, ref) => {
    const autofillProps = disableAutofill ? {
      autoComplete: 'new-password',
      'data-form-type': 'other',
      'data-lpignore': 'true',
    } : {};

    return (
      <div className="w-full">
        {label && (
          <label className="vm-muted-text mb-1 block text-sm font-semibold">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          className={`vm-glass-field w-full px-4 py-2 border rounded-lg transition-all ${
            error ? 'border-red-500' : ''
          } ${className}`}
          {...autofillProps}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
