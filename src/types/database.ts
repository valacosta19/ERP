export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          role: 'admin' | 'employee'
          created_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          role?: 'admin' | 'employee'
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          role?: 'admin' | 'employee'
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          name: string
          type: 'income' | 'expense'
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          type: 'income' | 'expense'
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: 'income' | 'expense'
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          date: string
          type: 'income' | 'expense'
          amount: number
          category_id: string | null
          description: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          date: string
          type: 'income' | 'expense'
          amount: number
          category_id?: string | null
          description?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          date?: string
          type?: 'income' | 'expense'
          amount?: number
          category_id?: string | null
          description?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          id: string
          name: string
          contact: string | null
          phone: string | null
          email: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          contact?: string | null
          phone?: string | null
          email?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          contact?: string | null
          phone?: string | null
          email?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          name: string
          sku: string
          unit: string | null
          sale_price: number
          min_stock: number
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          sku: string
          unit?: string | null
          sale_price: number
          min_stock?: number
          deleted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          sku?: string
          unit?: string | null
          sale_price?: number
          min_stock?: number
          deleted_at?: string | null
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          id: string
          supplier_id: string | null
          order_date: string
          status: 'draft' | 'received' | 'cancelled'
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          supplier_id?: string | null
          order_date: string
          status?: 'draft' | 'received' | 'cancelled'
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          supplier_id?: string | null
          order_date?: string
          status?: 'draft' | 'received' | 'cancelled'
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          id: string
          purchase_order_id: string
          product_id: string
          quantity: number
          unit_cost: number
          lot_id: string | null
        }
        Insert: {
          id?: string
          purchase_order_id: string
          product_id: string
          quantity: number
          unit_cost: number
          lot_id?: string | null
        }
        Update: {
          id?: string
          quantity?: number
          unit_cost?: number
          lot_id?: string | null
        }
        Relationships: []
      }
      inventory_lots: {
        Row: {
          id: string
          product_id: string
          purchase_order_item_id: string | null
          received_date: string
          initial_quantity: number
          remaining_quantity: number
          unit_cost: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          purchase_order_item_id?: string | null
          received_date: string
          initial_quantity: number
          remaining_quantity: number
          unit_cost: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          remaining_quantity?: number
          notes?: string | null
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          id: string
          lot_id: string | null
          product_id: string
          movement_type: 'in' | 'out' | 'adjustment'
          quantity: number
          unit_cost: number | null
          reference_type: string | null
          reference_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lot_id?: string | null
          product_id: string
          movement_type: 'in' | 'out' | 'adjustment'
          quantity: number
          unit_cost?: number | null
          reference_type?: string | null
          reference_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      sale_items: {
        Row: {
          id: string
          transaction_id: string
          product_id: string
          lot_id: string
          quantity: number
          unit_cost: number
          unit_sale_price: number
          created_at: string
        }
        Insert: {
          id?: string
          transaction_id: string
          product_id: string
          lot_id: string
          quantity: number
          unit_cost: number
          unit_sale_price: number
          created_at?: string
        }
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      consume_inventory_fifo: {
        Args: {
          p_product_id: string
          p_quantity: number
          p_transaction_id: string
          p_unit_sale_price: number
          p_created_by: string
        }
        Returns: void
      }
    }
    Enums: Record<string, never>
  }
}
