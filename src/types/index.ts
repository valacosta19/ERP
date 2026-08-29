export type { Database } from './database'

export type UserRole = 'admin' | 'employee'
export type TransactionType = 'income' | 'expense' | 'transfer'
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

export interface TransactionCategory {
  id: string
  name: string
  parent_id: string | null
  transaction_type: 'income' | 'expense' | 'transfer' | null
  deducts_inventory: boolean
  created_at: string
}

export interface Professional {
  id: string
  name: string
  active: boolean
  commission_rates: number[]
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
  type: string
  created_at: string
}

export interface Transaction {
  id: string
  date: string
  amount: number
  currency: Currency
  subcategory_id: string | null
  catalog_item_id: string | null
  description: string | null
  created_by: string | null
  created_at: string
  is_seña: boolean
  seña_amount: number | null
  voided_at: string | null
  voided_by: string | null
  refunds_anticipo_id: string | null
  product_id: string | null
  inventory_pending?: boolean
  display_position?: number | null
  subcategory?: TransactionCategory
  payments?: TransactionPayment[]
  professionals?: ProfessionalAssignment[]
}

export interface TransactionGroup {
  id: string
  label: string
  currency: Currency
  created_at: string
  created_by: string | null
}

export interface GroupMemberTransaction {
  id: string
  date: string
  amount: number
  currency: Currency
  description: string | null
  voided_at: string | null
  is_seña: boolean
  seña_amount: number | null
  subcategory_id: string | null
  subcategory: TransactionCategory | null
  payments: Pick<TransactionPayment, 'payment_method' | 'type' | 'amount'>[]
}

export interface TransactionGroupWithMembers extends TransactionGroup {
  members: GroupMemberTransaction[]
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
  discount_amount: number
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

export interface AnticipoPreset {
  id: string
  amount: number
  created_at: string
}

export interface CatalogItem {
  id: string
  name: string
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

export interface FixedCostRate {
  id: string
  fixed_cost_id: string
  monthly_amount: number
  effective_from: string
  created_at: string
}

export interface ServiceRecipe {
  id: string
  catalog_item_id: string
  product_id: string
  quantity_grams: number
}

export interface TransactionRecipeCost {
  id: string
  transaction_id: string
  catalog_item_id: string
  product_id: string
  quantity_grams: number
  avg_unit_cost: number
  unit_size: number
  created_at: string
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

export interface ReserveAccount {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface ReserveMovement {
  id: string
  reserve_id: string
  amount: number
  note: string | null
  date: string
  created_at: string
  transaction_id: string | null
  payment_method: string
}

export interface SupplierDebt {
  id: string
  purchase_order_id: string | null
  supplier_id: string | null
  total_amount: number
  paid_amount: number
  due_date: string | null
  notes: string | null
  created_at: string
  supplier?: Supplier
  payments?: SupplierDebtPayment[]
}

export interface SupplierDebtPayment {
  id: string
  debt_id: string
  amount: number
  payment_method: string
  date: string
  transaction_id: string | null
  notes: string | null
  created_at: string
}

export interface Receivable {
  id: string
  debtor_name: string
  concept: string
  total_amount: number
  collected_amount: number
  currency: Currency
  due_date: string | null
  notes: string | null
  created_at: string
  created_by: string | null
  source_transaction_id: string | null
  hairdresser_id: string | null
  product_id: string | null
  quantity: number | null
  unit_cost_snapshot: number | null
  collections?: ReceivableCollection[]
}

export interface CommissionPayout {
  id: string
  settlement_period_id: string
  hairdresser_id: string
  period_start: string
  period_end: string
  gross_amount: number
  receivables_offset: number
  net_amount: number
  paid_via_transaction_id: string | null
  payment_method: string
  payment_date: string
  client_uuid: string | null
  notes: string | null
  created_at: string
  created_by: string | null
}

export interface ReceivableCollection {
  id: string
  receivable_id: string
  amount: number
  payment_method: string
  date: string
  transaction_id: string | null
  client_uuid: string | null
  notes: string | null
  created_at: string
}
