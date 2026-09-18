import { expect, type Page } from '@playwright/test'

const today = '2026-09-18'

const subcategory = { id: 'service-child', name: 'Servicio', parent_id: 'income-parent', transaction_type: 'income', created_at: `${today}T00:00:00.000Z` }

function makeTransaction(id: string, description: string, amount: number, señaAmount: number | null = null) {
  return {
    id,
    date: today,
    amount,
    currency: 'ARS',
    subcategory_id: 'service-child',
    catalog_item_id: null,
    description,
    created_by: 'e2e-admin',
    created_at: `${today}T12:00:00.000Z`,
    is_seña: false,
    seña_amount: señaAmount,
    voided_at: null,
    voided_by: null,
    refunds_anticipo_id: null,
    product_id: null,
    inventory_pending: false,
    subcategory,
    payments: [{ id: `payment-${id}`, transaction_id: id, payment_method: 'Efectivo', instrument: null, amount, type: 'entrada', created_at: `${today}T12:00:00.000Z` }],
    transaction_hairdressers: [],
  }
}

const transactions = [
  makeTransaction('tx-e2e-1', 'Color y corte', 48500, 5000),
  makeTransaction('tx-e2e-2', 'Nutrición capilar', 32500),
  makeTransaction('tx-e2e-3', 'Venta shampoo', 18500),
  makeTransaction('tx-e2e-4', 'Servicio manos', 22000),
]

const fixtures: Record<string, unknown> = {
  products_with_stock: [{
    id: 'product-e2e-1', name: 'Shampoo nutritivo', sku: 'SHA-001', unit: 'u', brand: 'Buenas Ondas',
    sale_price: 18500, min_stock: 4, stock: 7, min_cost: 9200, max_cost: 9200, deleted_at: null,
    created_at: `${today}T00:00:00.000Z`, skip_restock: false, unit_size: 500,
  }],
  transaction_categories: [
    { id: 'income-parent', name: 'Ingresos', parent_id: null, transaction_type: 'income', deducts_inventory: false, benchmark_key: null, created_at: `${today}T00:00:00.000Z` },
    { id: 'service-child', name: 'Servicio', parent_id: 'income-parent', transaction_type: 'income', deducts_inventory: false, benchmark_key: null, created_at: `${today}T00:00:00.000Z` },
    { id: 'expense-parent', name: 'Gastos', parent_id: null, transaction_type: 'expense', deducts_inventory: false, benchmark_key: null, created_at: `${today}T00:00:00.000Z` },
    { id: 'rent-child', name: 'Alquiler', parent_id: 'expense-parent', transaction_type: 'expense', deducts_inventory: false, benchmark_key: null, created_at: `${today}T00:00:00.000Z` },
    { id: 'movement-parent', name: 'Movimientos', parent_id: null, transaction_type: 'transfer', deducts_inventory: false, benchmark_key: null, created_at: `${today}T00:00:00.000Z` },
    { id: 'deposit-child', name: 'Anticipo de señas', parent_id: 'movement-parent', transaction_type: 'transfer', deducts_inventory: false, benchmark_key: null, created_at: `${today}T00:00:00.000Z` },
    { id: 'refund-child', name: 'Devolución anticipo', parent_id: 'movement-parent', transaction_type: 'transfer', deducts_inventory: false, benchmark_key: null, created_at: `${today}T00:00:00.000Z` },
  ],
  catalog_items: Array.from({ length: 12 }, (_, index) => ({
    id: `service-e2e-${index + 1}`,
    name: index === 0 ? 'Corte E2E' : `Servicio E2E ${index + 1}`,
    price: 15000 + index * 1000,
    price_transfer: 15500 + index * 1000,
    price_card: 16000 + index * 1000,
    hours: 1,
    created_at: `${today}T00:00:00.000Z`,
  })),
  payment_methods: [{ id: 'method-e2e-1', name: 'Efectivo', active: true, created_at: `${today}T00:00:00.000Z` }],
  transaction_payments: transactions.map(tx => ({ payment_method: 'Efectivo', amount: tx.amount, type: 'entrada', transactions: { currency: 'ARS', voided_at: null, date: today, transaction_categories: { transaction_type: 'income' } } })),
  transaction_display_order: transactions.map((tx, index) => ({ transaction_id: tx.id, position: index + 1 })),
  transaction_groups: [{
    id: 'group-e2e-1', label: 'Turno combinado', currency: 'ARS', created_at: `${today}T12:30:00.000Z`, created_by: 'e2e-admin',
    members: transactions.slice(0, 2).map(tx => ({ transaction: tx })),
  }],
  supplier_debts: [{
    id: 'debt-e2e-1', purchase_order_id: null, supplier_id: 'supplier-e2e-1', total_amount: 120000,
    paid_amount: 20000, due_date: '2026-09-25', notes: null, created_at: `${today}T00:00:00.000Z`,
    supplier: { id: 'supplier-e2e-1', name: 'Distribuidora Norte' }, payments: [],
  }],
  receivables: [{
    id: 'receivable-e2e-1', debtor_name: 'Cliente prueba', concept: 'Plan de color', total_amount: 80000,
    collected_amount: 20000, currency: 'ARS', due_date: '2026-09-27', notes: null, created_by: 'e2e-admin',
    created_at: `${today}T00:00:00.000Z`, hairdresser_id: null, collections: [],
  }],
  inventory_lots: [{ id: 'lot-e2e-1', product_id: 'product-e2e-1', remaining_quantity: 7, initial_quantity: 10, unit_cost: 9200, received_date: today, notes: null, products: { name: 'Shampoo nutritivo' } }],
}

function responseFor(url: URL): unknown {
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    return url.pathname.endsWith('/get_opening_balance') ? 0 : []
  }
  const table = url.pathname.split('/').filter(Boolean).at(-1) ?? ''
  if (table === 'transactions') {
    const select = url.searchParams.get('select') ?? ''
    if (select.includes('transaction_hairdressers')) return transactions
    if (select.includes('catalog_item_id')) return []
    if (select.includes('transaction_categories')) {
      return transactions.map(tx => ({ amount: tx.amount, subcategory_id: 'service-child', transaction_categories: subcategory }))
    }
    return []
  }
  return fixtures[table] ?? []
}

export async function installIsolatedBackend(page: Page, role: 'admin' | 'employee' = 'admin') {
  const rejected: string[] = []
  const email = `${role}@e2e.local`
  const user = {
    id: `e2e-${role}`,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: `${today}T00:00:00.000Z`,
    phone: '',
    confirmed_at: `${today}T00:00:00.000Z`,
    last_sign_in_at: `${today}T12:00:00.000Z`,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: `${today}T00:00:00.000Z`,
    updated_at: `${today}T12:00:00.000Z`,
    is_anonymous: false,
  }
  const authResponse = {
    access_token: `e2e-access-token-${role}`,
    refresh_token: `e2e-refresh-token-${role}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  }
  const profile = {
    id: user.id,
    full_name: role === 'admin' ? 'Admin E2E' : 'Empleado E2E',
    email,
    role,
    business_name: 'Buenas Ondas E2E',
    created_at: `${today}T00:00:00.000Z`,
  }
  await page.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.hostname === '127.0.0.1' && url.port === '4173') {
      await route.continue()
      return
    }
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      await route.abort('blockedbyclient')
      return
    }
    if (url.hostname === 'dolarapi.com' && url.pathname === '/v1/dolares/blue') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ venta: 1500, fechaActualizacion: `${today}T12:00:00.000Z` }),
      })
      return
    }
    if (url.hostname === '127.0.0.1' && url.port === '4174') {
      if (url.pathname === '/auth/v1/token' && request.method() === 'POST') {
        const grantType = url.searchParams.get('grant_type')
        if (grantType !== 'password' && grantType !== 'refresh_token') {
          rejected.push(`${request.method()} ${url.pathname}?grant_type=${grantType ?? ''}`)
          await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Unsupported synthetic auth grant' }) })
          return
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(authResponse) })
        return
      }
      if (url.pathname === '/auth/v1/user' && request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
        return
      }
      if (url.pathname === '/rest/v1/profiles' && request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) })
        return
      }
      const isRead = request.method() === 'GET' || request.method() === 'HEAD'
      const isReadRpc = request.method() === 'POST' && url.pathname.endsWith('/rest/v1/rpc/get_opening_balance')
      if (!isRead && !isReadRpc) {
        rejected.push(`${request.method()} ${url.pathname}`)
        await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ message: 'E2E mutations are disabled' }) })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/1' },
        body: request.method() === 'HEAD' ? '' : JSON.stringify(responseFor(url)),
      })
      return
    }

    rejected.push(`${request.method()} ${url.origin}${url.pathname}`)
    await route.abort('blockedbyclient')
  })
  return rejected
}

export async function authenticateThroughLogin(page: Page, role: 'admin' | 'employee' = 'admin') {
  const rejected = await installIsolatedBackend(page, role)
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(`${role}@e2e.local`)
  await page.getByLabel('Contraseña').fill('synthetic-password')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  return rejected
}

export async function expectNoDocumentOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}
