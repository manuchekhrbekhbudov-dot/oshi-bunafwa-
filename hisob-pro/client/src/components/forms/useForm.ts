import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { useToast } from '../ui/Toast';

/** Хатогиҳои сервер (validation) ба майдонҳои форма пайваст карда мешаванд */
export function useFormErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const handle = (e: unknown) => {
    if (e instanceof ApiError) {
      setErrors(e.fields ?? {});
      if (!Object.keys(e.fields ?? {}).length) toast(e.message, 'error');
    } else {
      toast(String(e), 'error');
    }
  };
  return { errors, setErrors, handle, toast };
}
