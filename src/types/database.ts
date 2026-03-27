export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          role: 'admin' | 'employee'
          business_name: string | null
          created_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          role?: 'admin' | 'employee'
          business_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          role?: 'admin' | 'employee'
          business_name?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          date: string
          type: 'income' | 'expense'
          amount: number
          currency: 'ARS' | 'USD' | 'EUR'
          category_id: string | null
          catalog_item_id: string | null
          description: string | null
          created_by: string | null
          created_at: string
          is_seña: boolean
          seña_amount: number | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          id?: string
          date: string
          type: 'income' | 'expense'
          amount: number
          currency?: 'ARS' | 'USD' | 'EUR'
          category_id?: string | null
          catalog_item_id?: string | null
          description?: string | null
          created_by?: string | null
          created_at?: string
          is_seña?: boolean
          seña_amount?: number | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          id?: string
          date?: string
          type?: 'income' | 'expense'
          amount?: number
          currency?: 'ARS' | 'USD' | 'EUR'
          category_id?: string | null
          catalog_item_id?: string | null
          description?: string | null
          is_seña?: boolean
          seña_amount?: number | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: []
      }
      user_action_logs: {
        Row: {
          id: string
          user_id: string | null
          action: string
          entity: string
          entity_id: string | null
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          entity: string
          entity_id?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      hairdressers: {
        Row: {
          id: string
          name: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          active?: boolean
        }
        Relationships: []
      }
      transaction_payments: {
        Row: {
          id: string
          transaction_id: string
          payment_method: string
          instrument: string | null
          amount: number
          type: string
          created_at: string
        }
        Insert: {
          id?: string
          transaction_id: string
          payment_method: string
          instrument?: string | null
          amount: number
          type: string
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      transaction_hairdressers: {
        Row: {
          transaction_id: string
          hairdresser_id: string
          commission_rate: number
        }
        Insert: {
          transaction_id: string
          hairdresser_id: string
          commission_rate?: number
        }
        Update: never
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
          brand: string | null
          deleted_at: string | null
          created_at: string
          skip_restock: boolean
          unit_size: number | null
        }
        Insert: {
          id?: string
          name: string
          sku: string
          unit?: string | null
          sale_price: number
          min_stock?: number
          brand?: string | null
          deleted_at?: string | null
          created_at?: string
          skip_restock?: boolean
          unit_size?: number | null
        }
        Update: {
          id?: string
          name?: string
          sku?: string
          unit?: string | null
          sale_price?: number
          min_stock?: number
          brand?: string | null
          deleted_at?: string | null
          skip_restock?: boolean
          unit_size?: number | null
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          id: string
          supplier_id: string | null
          order_date: string
          status: 'draft' | 'received' | 'cancelled'
          shipping_cost: number
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          supplier_id?: string | null
          order_date: string
          status?: 'draft' | 'received' | 'cancelled'
          shipping_cost?: number
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          supplier_id?: string | null
          order_date?: string
          status?: 'draft' | 'received' | 'cancelled'
          shipping_cost?: number
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
          received_date?: string
          initial_quantity?: number
          remaining_quantity?: number
          unit_cost?: number
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
          reason: string | null
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
          reason?: string | null
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
      payment_methods: {
        Row: {
          id: string
          name: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          active?: boolean
        }
        Relationships: []
      }
      catalog_items: {
        Row: {
          id: string
          name: string
          category_id: string | null
          price: number
          price_transfer: number | null
          price_card: number | null
          hours: number | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          category_id?: string | null
          price?: number
          price_transfer?: number | null
          price_card?: number | null
          hours?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          category_id?: string | null
          price?: number
          price_transfer?: number | null
          price_card?: number | null
          hours?: number | null
        }
        Relationships: []
      }
      fixed_costs: {
        Row: {
          id: string
          name: string
          monthly_amount: number
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          monthly_amount: number
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          monthly_amount?: number
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      service_recipes: {
        Row: {
          id: string
          catalog_item_id: string
          product_id: string
          quantity_grams: number
        }
        Insert: {
          id?: string
          catalog_item_id: string
          product_id: string
          quantity_grams: number
        }
        Update: {
          id?: string
          catalog_item_id?: string
          product_id?: string
          quantity_grams?: number
        }
        Relationships: []
      }
    }
    Views: {
      products_with_stock: {
        Row: {
          id: string
          name: string
          sku: string
          unit: string | null
          sale_price: number
          min_stock: number
          brand: string | null
          deleted_at: string | null
          created_at: string
          stock: number
          min_cost: number | null
          max_cost: number | null
          unit_size: number | null
        }
        Relationships: []
      }
    }
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
      create_sale: {
        Args: {
          p_date: string
          p_category_id: string | null
          p_description: string | null
          p_created_by: string
          p_items: Json
        }
        Returns: string
      }
      receive_purchase_order: {
        Args: {
          p_po_id: string
          p_created_by: string | null
          p_items?: Json | null
        }
        Returns: void
      }
      suggest_reorder_quantity: {
        Args: {
          p_product_id: string
          p_order_month: number
          p_order_year: number
        }
        Returns: {
          suggested_quantity: number
          avg_same_month: number
          growth_rate: number
          months_with_data: number
        }[]
      }
    }
    Enums: Record<string, never>
  }
}
