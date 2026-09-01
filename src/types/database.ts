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
      transaction_categories: {
        Row: {
          id: string
          name: string
          parent_id: string | null
          transaction_type: 'income' | 'expense' | 'transfer' | null
          deducts_inventory: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          parent_id?: string | null
          transaction_type?: 'income' | 'expense' | 'transfer' | null
          deducts_inventory?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          parent_id?: string | null
          transaction_type?: 'income' | 'expense' | 'transfer' | null
          deducts_inventory?: boolean
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          date: string
          amount: number
          currency: 'ARS' | 'USD' | 'EUR'
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
          inventory_pending: boolean
          client_uuid: string | null
        }
        Insert: {
          id?: string
          date: string
          amount: number
          currency?: 'ARS' | 'USD' | 'EUR'
          subcategory_id?: string | null
          catalog_item_id?: string | null
          description?: string | null
          created_by?: string | null
          created_at?: string
          is_seña?: boolean
          seña_amount?: number | null
          voided_at?: string | null
          voided_by?: string | null
          refunds_anticipo_id?: string | null
          product_id?: string | null
          inventory_pending?: boolean
          client_uuid?: string | null
        }
        Update: {
          id?: string
          date?: string
          amount?: number
          currency?: 'ARS' | 'USD' | 'EUR'
          subcategory_id?: string | null
          catalog_item_id?: string | null
          description?: string | null
          is_seña?: boolean
          seña_amount?: number | null
          voided_at?: string | null
          voided_by?: string | null
          refunds_anticipo_id?: string | null
          product_id?: string | null
          inventory_pending?: boolean
          client_uuid?: string | null
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
      reserve_accounts: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
        }
        Relationships: []
      }
      reserve_movements: {
        Row: {
          id: string
          reserve_id: string
          amount: number
          note: string | null
          date: string
          created_at: string
          transaction_id: string | null
          payment_method: string
        }
        Insert: {
          id?: string
          reserve_id: string
          amount: number
          note?: string | null
          date: string
          created_at?: string
          transaction_id?: string | null
          payment_method: string
        }
        Update: {
          id?: string
          reserve_id?: string
          amount?: number
          note?: string | null
          date?: string
          transaction_id?: string | null
          payment_method?: string
        }
        Relationships: []
      }
      locked_periods: {
        Row: {
          year: number
          month: number
          locked_at: string
          locked_by: string | null
        }
        Insert: {
          year: number
          month: number
          locked_at?: string
          locked_by?: string | null
        }
        Update: {
          year?: number
          month?: number
          locked_at?: string
          locked_by?: string | null
        }
        Relationships: []
      }
      period_balance_snapshots: {
        Row: {
          year: number
          month: number
          payment_method: string
          currency: string
          closing_balance: number
          computed_at: string
        }
        Insert: {
          year: number
          month: number
          payment_method: string
          currency: string
          closing_balance?: number
          computed_at?: string
        }
        Update: {
          closing_balance?: number
          computed_at?: string
        }
        Relationships: []
      }
      hairdressers: {
        Row: {
          id: string
          name: string
          active: boolean
          commission_rates: number[]
          role_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          active?: boolean
          commission_rates?: number[]
          role_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          active?: boolean
          commission_rates?: number[]
          role_id?: string | null
        }
        Relationships: []
      }
      staff_roles: {
        Row: {
          id: string
          name: string
          assigns_services: boolean
          earns_commission: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          assigns_services?: boolean
          earns_commission?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          assigns_services?: boolean
          earns_commission?: boolean
        }
        Relationships: []
      }
      hairdresser_services: {
        Row: {
          hairdresser_id: string
          catalog_item_id: string
          commission_rate: number
        }
        Insert: {
          hairdresser_id: string
          catalog_item_id: string
          commission_rate: number
        }
        Update: {
          commission_rate?: number
        }
        Relationships: []
      }
      transaction_groups: {
        Row: {
          id: string
          label: string
          currency: 'ARS' | 'USD' | 'EUR'
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          label: string
          currency: 'ARS' | 'USD' | 'EUR'
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          label?: string
          currency?: 'ARS' | 'USD' | 'EUR'
          created_by?: string | null
        }
        Relationships: []
      }
      transaction_group_members: {
        Row: {
          group_id: string
          transaction_id: string
          created_at: string
        }
        Insert: {
          group_id: string
          transaction_id: string
          created_at?: string
        }
        Update: never
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
      transaction_display_order: {
        Row: {
          transaction_id: string
          position: number
        }
        Insert: {
          transaction_id: string
          position: number
        }
        Update: {
          transaction_id?: string
          position?: number
        }
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
          sku?: string | null
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
          discount_amount: number
          created_by: string | null
          created_at: string
          payment_transaction_id: string | null
        }
        Insert: {
          id?: string
          supplier_id?: string | null
          order_date: string
          status?: 'draft' | 'received' | 'cancelled'
          shipping_cost?: number
          discount_amount?: number
          created_by?: string | null
          created_at?: string
          payment_transaction_id?: string | null
        }
        Update: {
          id?: string
          supplier_id?: string | null
          order_date?: string
          status?: 'draft' | 'received' | 'cancelled'
          shipping_cost?: number
          discount_amount?: number
          payment_transaction_id?: string | null
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
      inventory_recounts: {
        Row: {
          id: string
          cutoff_date: string
          client_uuid: string
          totals: Json
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          cutoff_date: string
          client_uuid: string
          totals?: Json
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
      anticipo_presets: {
        Row: {
          id: string
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          amount?: number
        }
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
          price: number
          price_transfer: number | null
          price_card: number | null
          hours: number | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          price?: number
          price_transfer?: number | null
          price_card?: number | null
          hours?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          price?: number
          price_transfer?: number | null
          price_card?: number | null
          hours?: number | null
        }
        Relationships: []
      }
      fixed_cost_rates: {
        Row: {
          id: string
          fixed_cost_id: string
          monthly_amount: number
          effective_from: string
          created_at: string
        }
        Insert: {
          id?: string
          fixed_cost_id: string
          monthly_amount: number
          effective_from: string
          created_at?: string
        }
        Update: {
          id?: string
          fixed_cost_id?: string
          monthly_amount?: number
          effective_from?: string
          created_at?: string
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
      supplier_debts: {
        Row: {
          id: string
          purchase_order_id: string | null
          supplier_id: string | null
          total_amount: number
          paid_amount: number
          due_date: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          purchase_order_id?: string | null
          supplier_id?: string | null
          total_amount: number
          paid_amount?: number
          due_date?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          purchase_order_id?: string | null
          supplier_id?: string | null
          total_amount?: number
          paid_amount?: number
          due_date?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      supplier_debt_payments: {
        Row: {
          id: string
          debt_id: string
          amount: number
          payment_method: string
          date: string
          transaction_id: string | null
          client_uuid: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          debt_id: string
          amount: number
          payment_method: string
          date: string
          transaction_id?: string | null
          client_uuid?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          debt_id?: string
          amount?: number
          payment_method?: string
          date?: string
          transaction_id?: string | null
          client_uuid?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      receivables: {
        Row: {
          id: string
          debtor_name: string
          concept: string
          total_amount: number
          collected_amount: number
          currency: string
          due_date: string | null
          notes: string | null
          created_at: string
          created_by: string | null
          source_transaction_id: string | null
          hairdresser_id: string | null
          product_id: string | null
          quantity: number | null
          unit_cost_snapshot: number | null
          client_uuid: string | null
        }
        Insert: {
          id?: string
          debtor_name: string
          concept: string
          total_amount: number
          collected_amount?: number
          currency?: string
          due_date?: string | null
          notes?: string | null
          created_at?: string
          created_by?: string | null
          source_transaction_id?: string | null
          hairdresser_id?: string | null
          product_id?: string | null
          quantity?: number | null
          unit_cost_snapshot?: number | null
          client_uuid?: string | null
        }
        Update: {
          id?: string
          debtor_name?: string
          concept?: string
          total_amount?: number
          collected_amount?: number
          currency?: string
          due_date?: string | null
          notes?: string | null
          source_transaction_id?: string | null
          hairdresser_id?: string | null
          product_id?: string | null
          quantity?: number | null
          unit_cost_snapshot?: number | null
          client_uuid?: string | null
        }
        Relationships: []
      }
      commission_payouts: {
        Row: {
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
        Insert: {
          id?: string
          settlement_period_id: string
          hairdresser_id: string
          period_start: string
          period_end: string
          gross_amount: number
          receivables_offset?: number
          net_amount: number
          paid_via_transaction_id?: string | null
          payment_method: string
          payment_date: string
          client_uuid?: string | null
          notes?: string | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          settlement_period_id?: string
          hairdresser_id?: string
          period_start?: string
          period_end?: string
          gross_amount?: number
          receivables_offset?: number
          net_amount?: number
          paid_via_transaction_id?: string | null
          payment_method?: string
          payment_date?: string
          client_uuid?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      commission_settlement_periods: {
        Row: {
          id: string
          hairdresser_id: string
          period_start: string
          period_end: string
          gross_amount: number
          legacy: boolean
          created_at: string
        }
        Insert: {
          id?: string
          hairdresser_id: string
          period_start: string
          period_end: string
          gross_amount: number
          legacy?: boolean
          created_at?: string
        }
        Update: {
          gross_amount?: number
          legacy?: boolean
        }
        Relationships: []
      }
      commission_payout_receivables: {
        Row: {
          payout_id: string
          receivable_id: string
          amount: number
        }
        Insert: {
          payout_id: string
          receivable_id: string
          amount: number
        }
        Update: {
          payout_id?: string
          receivable_id?: string
          amount?: number
        }
        Relationships: []
      }
      receivable_collections: {
        Row: {
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
        Insert: {
          id?: string
          receivable_id: string
          amount: number
          payment_method: string
          date: string
          transaction_id?: string | null
          client_uuid?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          receivable_id?: string
          amount?: number
          payment_method?: string
          date?: string
          transaction_id?: string | null
          client_uuid?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      transaction_recipe_costs: {
        Row: {
          id: string
          transaction_id: string
          catalog_item_id: string
          product_id: string
          quantity_grams: number
          avg_unit_cost: number
          unit_size: number
          created_at: string
        }
        Insert: {
          id?: string
          transaction_id: string
          catalog_item_id: string
          product_id: string
          quantity_grams: number
          avg_unit_cost: number
          unit_size: number
          created_at?: string
        }
        Update: never
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
      create_funnel_unit: {
        Args: {
          p_client_uuid: string
          p_date: string
          p_transaction_type: string
          p_currency: string
          p_subcategory_id?: string | null
          p_subcategory_name?: string | null
          p_catalog_item_id?: string | null
          p_description?: string | null
          p_transfer_direction?: string | null
          p_payments: Json
          p_professionals: Json
          p_product_id?: string | null
          p_product_qty?: number
          p_unit_sale_price?: number
          p_sena_amount?: number | null
          p_created_by?: string | null
        }
        Returns: Json
      }
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
      preview_inventory_recount: {
        Args: {
          p_lines: Json
        }
        Returns: Json
      }
      apply_inventory_recount: {
        Args: {
          p_client_uuid: string
          p_cutoff_date: string
          p_lines: Json
          p_created_by?: string | null
        }
        Returns: Json
      }
      create_sale: {
        Args: {
          p_date: string
          p_subcategory_id: string | null
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
      create_staff_receivable: {
        Args: {
          p_client_uuid: string | null
          p_hairdresser_id: string
          p_product_id: string
          p_quantity: number
          p_value_amount: number
          p_due_date: string | null
          p_notes: string | null
          p_created_by: string | null
        }
        Returns: string
      }
      create_receivable_with_payout: {
        Args: {
          p_client_uuid: string | null
          p_debtor_name: string
          p_concept: string
          p_amount: number
          p_currency: string
          p_payment_method: string
          p_date: string
          p_due_date: string | null
          p_notes: string | null
          p_created_by: string | null
        }
        Returns: string
      }
      create_staff_advance: {
        Args: {
          p_client_uuid: string | null
          p_hairdresser_id: string
          p_amount: number
          p_currency: string
          p_payment_method: string
          p_date: string
          p_subcategory_id: string | null
          p_notes: string | null
          p_created_by: string | null
        }
        Returns: string
      }
      settle_commission_payout: {
        Args: {
          p_hairdresser_id: string
          p_period_start: string
          p_period_end: string
          p_gross_amount: number
          p_receivable_ids: string[]
          p_paid_via_transaction_id: string | null
          p_payment_method: string
          p_payment_date: string
          p_notes: string | null
          p_created_by: string
        }
        Returns: string
      }
      record_receivable_collection: {
        Args: {
          p_client_uuid: string
          p_receivable_id: string
          p_amount: number
          p_payment_method: string
          p_date: string
          p_notes: string | null
        }
        Returns: string
      }
      void_transaction: {
        Args: { p_transaction_id: string }
        Returns: Json
      }
      record_partial_commission_payout: {
        Args: {
          p_client_uuid: string
          p_hairdresser_id: string
          p_period_start: string
          p_period_end: string
          p_installment_amount: number
          p_receivable_ids: string[]
          p_payment_method: string
          p_payment_date: string
          p_subcategory_id: string | null
          p_notes: string | null
        }
        Returns: string
      }
      lock_period_with_snapshot: {
        Args: { p_year: number; p_month: number }
        Returns: void
      }
      update_reserve_movement: {
        Args: {
          p_id: string
          p_amount: number
          p_date: string
        }
        Returns: { mirror_updated: boolean }
      }
      record_supplier_debt_payment: {
        Args: {
          p_client_uuid: string; p_debt_id: string; p_amount: number
          p_payment_method: string; p_date: string
          p_subcategory_id: string; p_notes: string | null
        }
        Returns: string
      }
      get_opening_balance: {
        Args: {
          p_before_date: string
          p_payment_method?: string | null
          p_currency?: string | null
        }
        Returns: number
      }
    }
    Enums: Record<string, never>
  }
}
