import clsx from 'clsx';

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={clsx('flex items-center gap-2.5', className)}>
      <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-blue-600 shadow-glow">
        <span className="text-sm font-black text-white">H</span>
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400 dark:border-ink-900" />
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="text-[15px] font-black tracking-tight">
            HISOB <span className="bg-gradient-to-r from-brand-400 to-blue-500 bg-clip-text text-transparent">PRO</span>
          </div>
        </div>
      )}
    </div>
  );
}
