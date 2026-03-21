export type { Database } from './database'

export type UserRole = 'admin' | 'employee'
export type TransactionType = 'income' | 'expense'
export type MovementType = 'in' | 'out' | 'adjustment'
export type POStatus = 'draft' | 'received' | 'cancelled'
export type PaymentMethod = 'MP' | 'PPY' | 'Efectivo' | 'Santander'
export type PaymentInstrument = 'Transferencia' | 'Tarjeta'
export type PaymentDirection = 'entrada' | 'salida'

export interface Profile {
  id: string
  full_name: string | null
  role: UserRole
  created_at: string
}

export interface Category {
  id: string
  name: string
  type: TransactionType
  created_at: string
}

export interface Hairdresser {
  id: string
  name: string
  active: boolean
  created_at: string
}

export interface TransactionPayment {
  id: string
  transaction_id: string
  payment_method: PaymentMethod
  instrument: PaymentInstrument | null
  amount: number
  type: PaymentDirection
  created_at: string
}

export interface Transaction {
  id: string
  date: string
  type: TransactionType
  amount: number
  category_id: string | null
  description: string | null
  created_by: string | null
  created_at: string
  is_seña: boolean
  seña_amount: number | null
  category?: Category
  payments?: TransactionPayment[]
  hairdressers?: Hairdresser[]
}

export interface Supplier {
  id: string
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  notes: string | null
  created_at: string
}

export interface Product {
  id: string
  name: string
  sku: string
  unit: string | null
  sale_price: number
  min_stock: number
  deleted_at: string | null
  created_at: string
  stock?: number
}

export interface PurchaseOrder {
  id: string
  supplier_id: string | null
  order_date: string
  status: POStatus
  created_by: string | null
  created_at: string
  supplier?: Supplier
  items?: PurchaseOrderItem[]
}

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  product_id: string
  quantity: number
  unit_cost: number
  lot_id: string | null
  product?: Product
}

export interface InventoryLot {
  id: string
  product_id: string
  purchase_order_item_id: string | null
  received_date: string
  initial_quantity: number
  remaining_quantity: number
  unit_cost: number
  notes: string | null
  created_at: string
  product?: Product
}

export interface InventoryMovement {
  id: string
  lot_id: string | null
  product_id: string
  movement_type: MovementType
  quantity: number
  unit_cost: number | null
  reference_type: string | null
  reference_id: string | null
  created_by: string | null
  created_at: string
}

export interface SaleItem {
  id: string
  transaction_id: string
  product_id: string
  lot_id: string
  quantity: number
  unit_cost: number
  unit_sale_price: number
  created_at: string
  product?: Product
}
