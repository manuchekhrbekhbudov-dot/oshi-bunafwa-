export type Currency = 'TJS' | 'USD' | 'RUB';
export type Lang = 'tg' | 'ru';
export type AccountType = 'CASH' | 'CARD' | 'BANK' | 'EWALLET';
export type PaymentMethod = 'CASH' | 'CARD' | 'BANK';
export type CategoryKind = 'INCOME' | 'EXPENSE';
export type TxType =
  | 'INCOME'
  | 'EXPENSE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'DEBT_LENT'
  | 'DEBT_BORROWED'
  | 'DEBT_COLLECTED'
  | 'DEBT_REPAID';
export type DebtDirection = 'LENT' | 'BORROWED';
export type DebtStatus = 'ACTIVE' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface User {
  id: string;
  email: string | null;
  phone?: string | null;
  isOwner?: boolean;
  name: string;
  language: Lang;
  baseCurrency: Currency;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  color: string;
  archived: boolean;
  initialBalance: string;
  balance: string;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
  isSystem: boolean;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: string;
  currency: Currency;
  occurredAt: string;
  accountId: string;
  account: { id: string; name: string; type: AccountType; color: string } | null;
  categoryId: string | null;
  category: { id: string; name: string; color: string; icon: string } | null;
  source: string | null;
  purpose: string | null;
  paymentMethod: PaymentMethod | null;
  note: string | null;
  transferId: string | null;
  debtId: string | null;
  debtPaymentId: string | null;
  debt: { id: string; counterparty: string; direction: DebtDirection } | null;
  hasPhoto: boolean;
  updatedAt: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface CurrencyTotals {
  income: string;
  expense: string;
  net: string;
  incomeCount: number;
  expenseCount: number;
}

export interface Summary extends CurrencyTotals {
  viewCurrency: Currency;
  byCurrency: Partial<Record<Currency, CurrencyTotals>>;
  missingRates: Currency[];
}

export interface SeriesPoint {
  key: string;
  income: string;
  expense: string;
  net: string;
}

export interface CategoryShare {
  categoryId: string | null;
  name: string;
  color: string;
  amount: string;
  count: number;
  share: string;
}

export interface TotalBalance {
  base: Currency;
  total: string;
  byCurrency: Partial<Record<Currency, string>>;
  missingRates: Currency[];
}

export interface DebtSummary {
  base: Currency;
  lent: { remaining: string; count: number };
  borrowed: { remaining: string; count: number };
  net: string;
  overdue: number;
  byCurrency: Partial<Record<Currency, { lent: string; borrowed: string }>>;
  missingRates: Currency[];
}

export interface Dashboard {
  today: string;
  base: Currency;
  todaySummary: Summary;
  monthSummary: Summary;
  balance: TotalBalance;
  accounts: Account[];
  debts: DebtSummary;
  charts: { days7: SeriesPoint[]; days30: SeriesPoint[]; months12: SeriesPoint[] };
  monthExpenseByCategory: CategoryShare[];
  recent: Transaction[];
}

export interface DailyReport {
  date: string;
  summary: Summary;
  operationsCount: number;
  transactions: Transaction[];
  expenseByCategory: CategoryShare[];
  incomeByCategory: CategoryShare[];
  openingBalance: TotalBalance;
  closingBalance: TotalBalance;
  accounts: (Account & { openingBalance: string })[];
}

export interface CategoryChange {
  categoryId: string | null;
  name: string;
  color: string;
  cur: string;
  prev: string;
  diff: string;
  pct: number | null;
}

export interface PeriodReport {
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
  summary: Summary;
  operationsCount: number;
  pnlCount: number;
  series: SeriesPoint[];
  expenseByCategory: CategoryShare[];
  incomeByCategory: CategoryShare[];
  previous: { from: string; to: string; summary: Summary };
  changes: CategoryChange[];
}

export interface DebtPayment {
  id: string;
  amount: string;
  accountId: string | null;
  paidAt: string;
  note: string | null;
}

export interface Debt {
  id: string;
  direction: DebtDirection;
  counterparty: string;
  phone: string | null;
  amount: string;
  currency: Currency;
  accountId: string | null;
  accountName: string | null;
  issuedAt: string;
  dueDate: string | null;
  note: string | null;
  paid: string;
  remaining: string;
  status: DebtStatus;
  progress: string;
  payments: DebtPayment[];
}

export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  fromAccount: { name: string; currency: Currency } | null;
  toAccount: { name: string; currency: Currency } | null;
  amountFrom: string;
  amountTo: string;
  occurredAt: string;
  note: string | null;
}

export interface Rate {
  currency: Currency;
  rate: string;
  updatedAt: string;
}
