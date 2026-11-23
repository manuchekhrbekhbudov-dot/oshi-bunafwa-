import { useState } from 'react';
import { Download, Smartphone, Share, PlusSquare, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { useInstall } from '../lib/pwa';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Card, CardHeader } from './ui/misc';

const BANNER_KEY = 'hisob-install-banner-dismissed';

function IosSteps() {
  const { t } = useI18n();
  const steps = [
    { icon: Share, text: t('appIosStep1') },
    { icon: PlusSquare, text: t('appIosStep2') },
    { icon: Smartphone, text: t('appIosStep3') },
  ];
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3 text-sm">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-500">
            <s.icon className="h-4 w-4" />
          </span>
          <span className="pt-1.5">
            <b>{i + 1}.</b> {s.text}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Тугмаи насб: Android — равзанаи насби браузер; iPhone — дастур; дигар — маслиҳат */
function useInstallAction() {
  const inst = useInstall();
  const [iosOpen, setIosOpen] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const run = async () => {
    if (inst.canPrompt) return inst.prompt();
    if (inst.ios) return setIosOpen(true);
    setHintOpen(true);
  };
  return { inst, run, iosOpen, setIosOpen, hintOpen, setHintOpen };
}

function InstallModals({ a }: { a: ReturnType<typeof useInstallAction> }) {
  const { t } = useI18n();
  return (
    <>
      <Modal open={a.iosOpen} onClose={() => a.setIosOpen(false)} title={t('appIosTitle')} size="sm">
        <IosSteps />
      </Modal>
      <Modal open={a.hintOpen} onClose={() => a.setHintOpen(false)} title={t('appTitle')} size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('appOtherHint')}</p>
      </Modal>
    </>
  );
}

/** Корт дар «Танзимот» */
export function InstallCard() {
  const { t } = useI18n();
  const a = useInstallAction();
  return (
    <Card>
      <div id="app" />
      <CardHeader title={t('appTitle')} subtitle={t('appSubtitle')} icon={<Smartphone className="h-4 w-4" />} />
      <div className="p-5">
        {a.inst.standalone ? (
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{t('appInstalled')}</p>
        ) : a.inst.ios ? (
          <IosSteps />
        ) : (
          <Button onClick={a.run} icon={<Download className="h-4 w-4" />}>
            {t('appInstall')}
          </Button>
        )}
      </div>
      <InstallModals a={a} />
    </Card>
  );
}

/** Баннери хурд дар саҳифаи асосӣ — танҳо дар телефон, танҳо агар насб нашуда бошад */
export function InstallBanner() {
  const { t } = useI18n();
  const a = useInstallAction();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(BANNER_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed || a.inst.standalone || !(a.inst.canPrompt || a.inst.ios)) return null;
  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(BANNER_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="flex animate-fade-up items-center gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/10 p-3 lg:hidden">
      <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
      <p className="min-w-0 flex-1 text-xs text-slate-700 dark:text-slate-200">{t('appBannerText')}</p>
      <Button size="sm" onClick={a.run}>
        {t('appInstall')}
      </Button>
      <button onClick={close} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10" aria-label={t('later')}>
        <X className="h-4 w-4" />
      </button>
      <InstallModals a={a} />
    </div>
  );
}
