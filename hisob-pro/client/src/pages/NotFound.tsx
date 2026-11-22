import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Button } from '../components/ui/Button';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="bg-gradient-to-r from-brand-500 to-blue-500 bg-clip-text text-7xl font-black text-transparent">404</p>
        <p className="mt-2 font-semibold">{t('notFound')}</p>
        <Link to="/"><Button className="mt-6">{t('goHome')}</Button></Link>
      </div>
    </div>
  );
}
