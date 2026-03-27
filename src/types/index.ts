export type { Database } from './database'

export type UserRole = 'admin' | 'employee'
export type TransactionType = 'income' | 'expense'
export type Currency = 'ARS' | 'USD' | 'EUR'
export type MovementType = 'in' | 'out' | 'adjustment'
export type POStatus = 'draft' | 'received' | 'cancelled'
export type PaymentMethod = string
export type PaymentInstrument = 'Transferencia' | 'Tarjeta'

export interface Profile {
  id: string
  full_name: string | null
  email: string
  role: UserRole
  business_name: string | null
  created_at: string
}

export interface Category {
  id: string
  name: string
  created_at: string
}

export interface Professional {
  id: string
  name: string
  active: boolean
  created_at: string
}

export interface ProfessionalAssignment extends Professional {
  commission_rate: number
}

export interface TransactionPayment {
  id: string
  transaction_id: string
  payment_method: PaymentMethod
  instrument: PaymentInstrument | null
  amount: number
  created_at: string
}

export interface Transaction {
  id: string
  date: string
  type: TransactionType
  amount: number
  currency: Currency
  category_id: string | null
  catalog_item_id: string | null
  description: string | null
  created_by: string | null
  created_at: string
  is_seña: boolean
  seña_amount: number | null
  voided_at: string | null
  voided_by: string | null
  category?: Category
  payments?: TransactionPayment[]
  professionals?: ProfessionalAssignment[]
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
  brand: string | null
  deleted_at: string | null
  created_at: string
  skip_restock: boolean
  unit_size?: number | null
  stock?: number
  min_cost?: number | null
  max_cost?: number | null
}

export interface PurchaseOrder {
  id: string
  supplier_id: string | null
  order_date: string
  status: POStatus
  shipping_cost: number
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
  has_sales?: boolean
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

export interface PaymentMethodConfig {
  id: string
  name: string
  active: boolean
  created_at: string
}

export interface CatalogItem {
  id: string
  name: string
  category_id: string | null
  price: number
  price_transfer?: number | null
  price_card?: number | null
  hours?: number | null
  created_at: string
}

export interface FixedCost {
  id: string
  name: string
  monthly_amount: number
  active: boolean
}

export interface ServiceRecipe {
  id: string
  catalog_item_id: string
  product_id: string
  quantity_grams: number
}

export interface ServiceCostRow {
  service: CatalogItem
  materialCost: number
  commissionCost: number
  totalCost: number
  salePrice: number
  margin: number
  marginPct: number
  hasWarning: boolean
}
