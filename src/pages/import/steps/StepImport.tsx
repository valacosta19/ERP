import { useEffect, useRef, useState } from 'react'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabaseClient'
import { ENTITY_LABELS } from '../importLogic'
import type { ParsedSheet, EntityType, SheetAssignments, ColumnMappings, ImportResult } from '../importTypes'

interface Props {
  sheets: ParsedSheet[]
  assignments: SheetAssignments
  mappings: ColumnMappings
  onDone: () => void
}

function getVal(row: Record<string, string>, mapping: Record<string, string>, field: string): string {
  const col = mapping[field]
  return col ? (row[col] ?? '').trim() : ''
}

function parseNum(s: string): number {
  if (!s) return 0
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let normalized: string
  if (lastComma !== -1 && lastDot !== -1) {
    normalized = lastDot > lastComma
      ? s.replace(/,/g, '')
      : s.replace(/\./g, '').replace(',', '.')
  } else if (lastComma !== -1) {
    const afterComma = s.slice(lastComma + 1)
    normalized = afterComma.length === 3 && /^\d{3}$/.test(afterComma)
      ? s.replace(/,/g, '')
      : s.replace(',', '.')
  } else {
    normalized = s
  }
  return parseFloat(normalized) || 0
}

function parseType(s: string): 'income' | 'expense' {
  const lower = s.toLowerCase()
  if (lower === 'income' || lower === 'ingreso' || lower === 'entrada') return 'income'
  return 'expense'
}

function parseDate(s: string): string {
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return s
}

const IMPORT_ORDER: EntityType[] = ['categories', 'professionals', 'suppliers', 'products', 'services', 'transactions', 'lots']

export function StepImport({ sheets, assignments, mappings, onDone }: Props) {
  const [results, setResults] = useState<ImportResult[]>([])
  const [running, setRunning] = useState(true)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true
    runImport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runImport = async () => {
    try {
      const [catRes, supRes, prodRes, hdRes, svcRes] = await Promise.all([
        supabase.from('categories').select('id, name'),
        supabase.from('suppliers').select('id, name'),
        supabase.from('products').select('id, sku').is('deleted_at', null),
        supabase.from('hairdressers').select('id, name'),
        supabase.from('catalog_items').select('id, name'),
      ])
      if (catRes.error) throw new Error(catRes.error.message)
      if (supRes.error) throw new Error(supRes.error.message)
      if (prodRes.error) throw new Error(prodRes.error.message)
      if (hdRes.error) throw new Error(hdRes.error.message)
      if (svcRes.error) throw new Error(svcRes.error.message)

      const catMap = new Map(catRes.data.map(c => [c.name.toLowerCase(), c.id]))
      const supMap = new Map(supRes.data.map(s => [s.name.toLowerCase(), s.id]))
      const skuMap = new Map(prodRes.data.map(p => [p.sku, p.id]))
      const hdMap = new Map(hdRes.data.map(h => [h.name.toLowerCase(), h.id]))
      const svcMap = new Set(svcRes.data.map(s => s.name.toLowerCase()))

      const importResults: ImportResult[] = []

      for (const entityType of IMPORT_ORDER) {
        const targetSheets = sheets.filter(s => assignments[s.name] === entityType)
        if (targetSheets.length === 0) continue

        const result: ImportResult = { entity: entityType, inserted: 0, skipped: 0, errors: [] }

        for (const sheet of targetSheets) {
          const m = mappings[sheet.name] ?? {}

          if (entityType === 'categories') {
            for (const row of sheet.rows) {
              const name = getVal(row, m, 'name')
              if (!name) { result.skipped++; continue }
              if (catMap.has(name.toLowerCase())) { result.skipped++; continue }
              const { data, error } = await supabase.from('categories').insert({ name }).select('id, name').single()
              if (error) { result.errors.push(`${name}: ${error.message}`); continue }
              catMap.set(name.toLowerCase(), data.id)
              result.inserted++
            }
          }

          if (entityType === 'suppliers') {
            for (const row of sheet.rows) {
              const name = getVal(row, m, 'name')
              if (!name) { result.skipped++; continue }
              if (supMap.has(name.toLowerCase())) { result.skipped++; continue }
              const { data, error } = await supabase.from('suppliers').insert({
                name,
                contact: getVal(row, m, 'contact') || null,
                phone: getVal(row, m, 'phone') || null,
                email: getVal(row, m, 'email') || null,
                notes: getVal(row, m, 'notes') || null,
              }).select('id, name').single()
              if (error) { result.errors.push(`${name}: ${error.message}`); continue }
              supMap.set(name.toLowerCase(), data.id)
              result.inserted++
            }
          }

          if (entityType === 'products') {
            for (const row of sheet.rows) {
              let sku = getVal(row, m, 'sku')
              const name = getVal(row, m, 'name')
              if (!name) { result.skipped++; continue }
              if (!sku) {
                const prefix = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X')
                let counter = 1
                do { sku = `${prefix}-${String(counter).padStart(3, '0')}`; counter++ } while (skuMap.has(sku))
              }
              if (skuMap.has(sku)) { result.skipped++; continue }
              const sale_price = parseNum(getVal(row, m, 'sale_price'))
              const min_stock = parseNum(getVal(row, m, 'min_stock'))
              const unit = getVal(row, m, 'unit') || null
              const brand = getVal(row, m, 'brand') || null
              const { data, error } = await supabase.from('products').insert({ sku, name, unit, sale_price, min_stock, brand }).select('id, sku').single()
              if (error) { result.errors.push(`${sku}: ${error.message}`); continue }
              skuMap.set(sku, data.id)
              result.inserted++
              const unit_cost = parseNum(getVal(row, m, 'unit_cost'))
              const initial_quantity = parseNum(getVal(row, m, 'initial_quantity'))
              if (unit_cost > 0 || initial_quantity > 0) {
                const rawDate = getVal(row, m, 'received_date')
                const received_date = rawDate ? parseDate(rawDate) : new Date().toISOString().slice(0, 10)
                const qty = initial_quantity > 0 ? initial_quantity : 0
                const { error: lotError } = await supabase.from('inventory_lots').insert({
                  product_id: data.id,
                  received_date,
                  initial_quantity: qty,
                  remaining_quantity: qty,
                  unit_cost: unit_cost || 0,
                })
                if (lotError) result.errors.push(`${sku} (lote): ${lotError.message}`)
              }
            }
          }

          if (entityType === 'transactions') {
            for (const row of sheet.rows) {
              const date = parseDate(getVal(row, m, 'date'))

              const entradaVal = parseNum(getVal(row, m, 'entrada'))
              const salidaVal = parseNum(getVal(row, m, 'salida'))
              const rawAmount = parseNum(getVal(row, m, 'amount'))

              let amount: number
              let type: 'income' | 'expense'

              if (entradaVal > 0) {
                amount = entradaVal
                type = 'income'
              } else if (salidaVal > 0) {
                amount = salidaVal
                type = 'expense'
              } else if (rawAmount < 0) {
                amount = Math.abs(rawAmount)
                type = 'expense'
              } else {
                amount = rawAmount
                type = parseType(getVal(row, m, 'type'))
              }

              if (!date || amount === 0) { result.skipped++; continue }

              const categoryName = getVal(row, m, 'category')
              const category_id = categoryName ? (catMap.get(categoryName.toLowerCase()) ?? null) : null
              const description = getVal(row, m, 'description') || null

              const señaRaw = getVal(row, m, 'is_seña')
              const señaNum = parseNum(señaRaw)
              const is_seña = señaNum > 0
              const seña_amount = is_seña ? señaNum : 0

              const rawCurrency = getVal(row, m, 'currency').toUpperCase()
              const currency = (['ARS', 'USD', 'EUR'] as const).includes(rawCurrency as 'ARS' | 'USD' | 'EUR')
                ? (rawCurrency as 'ARS' | 'USD' | 'EUR')
                : 'ARS'

              const { data: txData, error: txError } = await supabase
                .from('transactions')
                .insert({ date, type, amount, currency, category_id, description, is_seña, seña_amount })
                .select('id')
                .single()
              if (txError) { result.errors.push(`${date} $${amount}: ${txError.message}`); continue }

              const paymentMethod = getVal(row, m, 'payment_method')
              if (paymentMethod) {
                const instrument = getVal(row, m, 'instrument') || null
                const { error: pmError } = await supabase.from('transaction_payments').insert({
                  transaction_id: txData.id,
                  payment_method: paymentMethod,
                  instrument,
                  amount,
                  type: type === 'income' ? 'entrada' : 'salida',
                })
                if (pmError) { result.errors.push(`${date} payment: ${pmError.message}`); continue }
              }

              const professionalName = getVal(row, m, 'professional')
              if (professionalName) {
                const professional_id = hdMap.get(professionalName.toLowerCase())
                if (professional_id) {
                  const { error: hdError } = await supabase.from('transaction_hairdressers').insert({ transaction_id: txData.id, hairdresser_id: professional_id })
                  if (hdError) { result.errors.push(`${date} profesional: ${hdError.message}`); continue }
                }
              }

              result.inserted++
            }
          }

          if (entityType === 'professionals') {
            for (const row of sheet.rows) {
              const name = getVal(row, m, 'name')
              if (!name) { result.skipped++; continue }
              if (hdMap.has(name.toLowerCase())) { result.skipped++; continue }
              const activeRaw = getVal(row, m, 'active').toLowerCase()
              const active = activeRaw === '' || activeRaw === 'true' || activeRaw === '1' || activeRaw === 'sí' || activeRaw === 'si'
              const { data, error } = await supabase.from('hairdressers').insert({ name, active }).select('id, name').single()
              if (error) { result.errors.push(`${name}: ${error.message}`); continue }
              hdMap.set(name.toLowerCase(), data.id)
              result.inserted++
            }
          }

          if (entityType === 'services') {
            let servicesCatId = catMap.get('servicio')
            if (!servicesCatId) {
              const { data: newCat, error: catErr } = await supabase.from('categories').insert({ name: 'Servicio' }).select('id').single()
              if (catErr) { result.errors.push(`Categoría Servicio: ${catErr.message}`); continue }
              catMap.set('servicio', newCat.id)
              servicesCatId = newCat.id
            }
            for (const row of sheet.rows) {
              const name = getVal(row, m, 'name')
              if (!name) { result.skipped++; continue }
              if (svcMap.has(name.toLowerCase())) { result.skipped++; continue }
              const price = parseNum(getVal(row, m, 'price'))
              const { error } = await supabase.from('catalog_items').insert({ name, category_id: servicesCatId, price })
              if (error) { result.errors.push(`${name}: ${error.message}`); continue }
              svcMap.add(name.toLowerCase())
              result.inserted++
            }
          }

          if (entityType === 'lots') {
            for (const row of sheet.rows) {
              const sku = getVal(row, m, 'sku')
              const received_date = parseDate(getVal(row, m, 'received_date'))
              const initial_quantity = parseNum(getVal(row, m, 'initial_quantity'))
              const unit_cost = parseNum(getVal(row, m, 'unit_cost'))
              if (!sku || !received_date || initial_quantity === 0) { result.skipped++; continue }
              const product_id = skuMap.get(sku)
              if (!product_id) { result.errors.push(`SKU no encontrado: ${sku}`); continue }
              const notes = getVal(row, m, 'notes') || null
              const { error } = await supabase.from('inventory_lots').insert({
                product_id,
                received_date,
                initial_quantity,
                remaining_quantity: initial_quantity,
                unit_cost,
                notes,
              })
              if (error) { result.errors.push(`${sku}: ${error.message}`); continue }
              result.inserted++
              const sale_price = parseNum(getVal(row, m, 'sale_price'))
              if (sale_price > 0) {
                await supabase.from('products').update({ sale_price }).eq('id', product_id)
              }
            }
          }
        }

        importResults.push(result)
      }

      setResults(importResults)
    } catch (err) {
      setFatalError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setRunning(false)
    }
  }

  if (running) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <span className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[var(--color-muted)]">Importando datos...</p>
      </div>
    )
  }

  if (fatalError) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-danger)]">{fatalError}</p>
        <Button variant="secondary" onClick={onDone}>Cerrar</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {results.map(r => (
          <div key={r.entity} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              {r.errors.length === 0
                ? <CheckCircle size={16} className="text-green-500" />
                : <AlertCircle size={16} className="text-yellow-500" />
              }
              <span className="text-sm font-semibold text-[var(--color-text)]">{ENTITY_LABELS[r.entity]}</span>
            </div>
            <div className="flex gap-6 text-xs text-[var(--color-muted)]">
              <span>{r.inserted} insertados</span>
              <span>{r.skipped} omitidos</span>
              {r.errors.length > 0 && <span className="text-[var(--color-danger)]">{r.errors.length} errores</span>}
            </div>
            {r.errors.length > 0 && (
              <ul className="mt-2 space-y-1">
                {r.errors.map((e, i) => (
                  <li key={i} className="text-xs text-[var(--color-danger)]">{e}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={onDone}>Terminar</Button>
      </div>
    </div>
  )
}
