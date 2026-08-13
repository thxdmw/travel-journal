import { del, get, post, put } from './client'
import type { Decimal, IsoDateTimeString, LocalDateString } from '@/types/common'

export interface BudgetCategory {
  id: number
  createdAt: IsoDateTimeString
  updatedAt: IsoDateTimeString
  tripId: number
  code: string
  name: string
  plannedAmount: Decimal
  sortOrder: number | null
}

export interface Expense {
  id: number
  createdAt: IsoDateTimeString
  updatedAt: IsoDateTimeString
  tripId: number
  budgetCategoryId: number
  tripStopId: number | null
  expenseDate: LocalDateString
  amount: Decimal
  description: string
  merchant: string | null
  note: string | null
}

export interface CategorySummary {
  id: number
  code: string
  name: string
  planned: Decimal
  actual: Decimal
  remaining: Decimal
  overBudget: boolean
}

/** 预算汇总。金额已由后端按旅行的 defaultCurrency 汇总，前端不再自己加总。 */
export interface BudgetSummary {
  currency: string
  plannedTotal: Decimal
  actualTotal: Decimal
  remaining: Decimal
  categories: CategorySummary[]
}

export interface CategoryRequest {
  code: string
  name: string
  plannedAmount: Decimal
  sortOrder?: number | null
}

export interface ExpenseRequest {
  budgetCategoryId: number
  tripStopId?: number | null
  expenseDate: LocalDateString
  amount: Decimal
  description: string
  merchant?: string
  note?: string
}

export const budgetApi = {
  summary: (tripId: number) => get<BudgetSummary>('/admin/trips/' + tripId + '/budget'),

  createCategory: (tripId: number, body: CategoryRequest) =>
    post<BudgetCategory>('/admin/trips/' + tripId + '/budget-categories', body),

  updateCategory: (id: number, body: CategoryRequest) =>
    put<BudgetCategory>('/admin/budget-categories/' + id, body),

  deleteCategory: (id: number) => del<void>('/admin/budget-categories/' + id),

  expenses: (tripId: number) => get<Expense[]>('/admin/trips/' + tripId + '/expenses'),

  createExpense: (tripId: number, body: ExpenseRequest) =>
    post<Expense>('/admin/trips/' + tripId + '/expenses', body),

  updateExpense: (id: number, body: ExpenseRequest) => put<Expense>('/admin/expenses/' + id, body),

  deleteExpense: (id: number) => del<void>('/admin/expenses/' + id),
}
