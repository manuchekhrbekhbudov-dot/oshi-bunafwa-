import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';
import { useI18n } from '../../i18n';

/** Компютер (муш/тачпад) — дар телефон клавиатура худ аз худ кушода намешавад */
const hasFinePointer = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/**
 * Қисми намоёни экран (visualViewport). Вақте ки клавиатураи телефон кушода мешавад,
 * баландии он хурд мешавад — равзана ҳамеша болои клавиатура мемонад ва тугмаҳо пинҳон намешаванд.
 */
function useVisibleArea(active: boolean) {
  const [area, setArea] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!active || !vv) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setArea({ top: Math.round(vv.offsetTop), height: Math.round(vv.height) }));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setArea(null);
    };
  }, [active]);
  return area;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const area = useVisibleArea(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    // Саҳифаи паси равзана scroll намешавад (iPhone ҳам)
    const html = document.documentElement;
    const prev = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    // Дар компютер курсор ба майдони аввал меравад; дар телефон не — клавиатура формаро намепӯшонад
    const timer = hasFinePointer()
      ? setTimeout(() => ref.current?.querySelector<HTMLElement>('input:not([type=file]),select,textarea')?.focus(), 30)
      : undefined;
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(timer);
      [html.style.overflow, document.body.style.overflow] = prev;
    };
  }, [open, onClose]);

  // Клавиатура кушода шуд → майдони фаъол дар қисми намоёни форма мемонад
  useEffect(() => {
    const body = bodyRef.current;
    const el = document.activeElement;
    if (!area || !body || !(el instanceof HTMLElement) || !body.contains(el)) return;
    const b = body.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.bottom > b.bottom - 8) body.scrollTop += r.bottom - b.bottom + 8;
    else if (r.top < b.top + 8) body.scrollTop -= b.top + 8 - r.top;
  }, [area]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      style={area ? { top: area.top, height: area.height, bottom: 'auto' } : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 animate-fade-in touch-none bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        className={clsx(
          'relative flex max-h-[92vh] w-full animate-scale-in flex-col rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl',
          'dark:border-white/10 dark:bg-ink-900',
          { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-3xl' }[size],
        )}
        style={area ? { maxHeight: Math.round(area.height * 0.92) } : undefined}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 dark:border-white/[0.06] sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Танҳо ба боло-поён scroll мешавад, ҳеҷ гоҳ ба паҳлу; scroll ба саҳифаи паси равзана намегузарад */}
        <div ref={bodyRef} className="scrollbar-thin overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
        {footer && (
          // Телефон: тугмаҳо дар як қатор (баробар), то форма ҷои бештар гирад
          <div className="flex gap-2 border-t border-slate-100 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.06] sm:justify-end sm:px-6 sm:py-4 [&>*]:flex-1 sm:[&>*]:flex-none">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  loading,
  title,
  text,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  title?: string;
  text?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-rose-500/15 text-rose-500">
            <AlertTriangle className="h-4 w-4" />
          </span>
          {title ?? t('confirmDelete')}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>
            {t('yesDelete')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">{text ?? t('confirmDeleteText')}</p>
    </Modal>
  );
}
