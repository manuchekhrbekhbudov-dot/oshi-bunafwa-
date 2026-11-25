import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

export function Field({
  label,
  error,
  hint,
  children,
  className,
  hintDesktopOnly,
}: {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Маслиҳат танҳо дар экрани калон (дар телефон ҷой намегирад) */
  hintDesktopOnly?: boolean;
}) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-rose-500">{error}</p>
      ) : hint ? (
        <p className={clsx('mt-1 text-xs text-slate-500 dark:text-slate-400', hintDesktopOnly && 'hidden sm:block')}>{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; leading?: ReactNode; trailing?: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, leading, trailing, className, ...rest },
  ref,
) {
  if (!leading && !trailing) {
    return <input ref={ref} className={clsx('input', invalid && 'input-error', className)} {...rest} />;
  }
  return (
    <div className="relative">
      {leading && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">{leading}</span>
      )}
      <input
        ref={ref}
        className={clsx('input', invalid && 'input-error', leading && 'pl-10', trailing && 'pr-14', className)}
        {...rest}
      />
      {trailing && (
        <span className="absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-500">{trailing}</span>
      )}
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ invalid, className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={clsx('input appearance-none bg-no-repeat pr-9', invalid && 'input-error', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2394a3b8' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundPosition: 'right 0.75rem center',
        }}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ invalid, className, ...rest }, ref) {
    return <textarea ref={ref} className={clsx('input h-auto min-h-[80px] py-2.5', invalid && 'input-error', className)} {...rest} />;
  },
);
