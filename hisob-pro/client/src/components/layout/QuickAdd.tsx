import { createContext, useContext, useState, type ReactNode } from 'react';
import { TransactionFormModal } from '../forms/TransactionForm';
import { TransferFormModal } from '../forms/TransferForm';

type Kind = 'INCOME' | 'EXPENSE' | 'TRANSFER' | null;
const Ctx = createContext<(k: Exclude<Kind, null>) => void>(() => undefined);

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<Kind>(null);
  return (
    <Ctx.Provider value={setKind}>
      {children}
      <TransactionFormModal open={kind === 'INCOME' || kind === 'EXPENSE'} kind={kind === 'EXPENSE' ? 'EXPENSE' : 'INCOME'} onClose={() => setKind(null)} />
      <TransferFormModal open={kind === 'TRANSFER'} onClose={() => setKind(null)} />
    </Ctx.Provider>
  );
}

export const useQuickAdd = () => useContext(Ctx);
