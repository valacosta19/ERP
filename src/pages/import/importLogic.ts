import type { EntityType, ParsedSheet } from './importTypes'

export type FieldDef = {
  key: string
  label: string
  required: boolean
}

export const ENTITY_LABELS: Record<EntityType, string> = {
  categories: 'Categorías',
  suppliers: 'Proveedores',
  products: 'Productos',
  services: 'Servicios',
  transactions: 'Transacciones',
  lots: 'Lotes de apertura',
  professionals: 'Profesionales',
}

export const ENTITY_FIELDS: Record<EntityType, FieldDef[]> = {
  categories: [
    { key: 'name', label: 'Nombre', required: true },
  ],
  suppliers: [
    { key: 'name', label: 'Nombre', required: true },
    { key: 'contact', label: 'Contacto', required: false },
    { key: 'phone', label: 'Teléfono', required: false },
    { key: 'email', label: 'Email', required: false },
    { key: 'notes', label: 'Notas', required: false },
  ],
  products: [
    { key: 'name', label: 'Nombre', required: true },
    { key: 'sku', label: 'SKU (auto-generado si vacío)', required: false },
    { key: 'sale_price', label: 'Precio de venta', required: false },
    { key: 'unit_cost', label: 'Precio de compra', required: false },
    { key: 'initial_quantity', label: 'Stock inicial', required: false },
    { key: 'received_date', label: 'Fecha de compra', required: false },
    { key: 'brand', label: 'Marca / Línea', required: false },
    { key: 'unit', label: 'Unidad', required: false },
    { key: 'min_stock', label: 'Stock mínimo', required: false },
  ],
  services: [
    { key: 'name', label: 'Nombre', required: true },
    { key: 'price', label: 'Precio', required: false },
  ],
  transactions: [
    { key: 'date', label: 'Fecha', required: true },
    { key: 'entrada', label: 'Entrada', required: false },
    { key: 'salida', label: 'Salida', required: false },
    { key: 'currency', label: 'Moneda (ARS / USD / EUR)', required: false },
    { key: 'category', label: 'Categoría (nombre)', required: false },
    { key: 'description', label: 'Descripción', required: false },
    { key: 'payment_method', label: 'Medio de pago', required: false },
    { key: 'instrument', label: 'Instrumento', required: false },
    { key: 'is_seña', label: 'Monto seña (número)', required: false },
    { key: 'professional', label: 'Profesional', required: false },
  ],
  lots: [
    { key: 'sku', label: 'SKU del producto', required: true },
    { key: 'received_date', label: 'Fecha de recepción', required: true },
    { key: 'initial_quantity', label: 'Cantidad inicial', required: true },
    { key: 'unit_cost', label: 'Precio de compra', required: true },
    { key: 'sale_price', label: 'Precio de venta (actualiza producto)', required: false },
    { key: 'notes', label: 'Notas', required: false },
  ],
  professionals: [
    { key: 'name', label: 'Nombre', required: true },
    { key: 'active', label: 'Activo (true/false)', required: false },
  ],
}

export async function parseWorkbook(file: File): Promise<ParsedSheet[]> {
  const XLSX = await import('xlsx')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const sheets: ParsedSheet[] = wb.SheetNames.map(name => {
          const ws = wb.Sheets[name]
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
            defval: '',
            raw: false,
            dateNF: 'yyyy-mm-dd',
          })
          const headers = rows.length > 0 ? Object.keys(rows[0]) : []
          return {
            name,
            headers,
            rows: rows.map(r =>
              Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')]))
            ),
          }
        })
        resolve(sheets)
      } catch (err) {
        reject(new Error(err instanceof Error ? err.message : 'Error al parsear el archivo'))
      }
    }
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    reader.readAsArrayBuffer(file)
  })
}

export async function downloadSampleTemplate() {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const sheets: { name: string; data: (string | number)[][] }[] = [
    {
      name: 'Categorías',
      data: [
        ['Nombre'],
        ['Coloración'],
        ['Tratamientos'],
      ],
    },
    {
      name: 'Proveedores',
      data: [
        ['Nombre', 'Contacto', 'Teléfono', 'Email', 'Notas'],
        ['L\'Oréal Argentina', 'Juan Pérez', '1145678901', 'juan@loreal.com', 'Distribuidor oficial'],
        ['Wella Professionals', 'María López', '1156789012', 'maria@wella.com', ''],
      ],
    },
    {
      name: 'Productos',
      data: [
        ['Nombre', 'SKU', 'Precio', 'Costo', 'Cantidad', 'Fecha', 'Marca', 'Unidad', 'Stock mínimo'],
        ['Tinte Rubio 9.0', 'TIN-001', 2500, 1200, 10, '01/03/2024', 'L\'Oréal', 'tubo', 2],
        ['Shampoo Hidratante 500ml', 'SHA-001', 3800, 1800, 5, '01/03/2024', 'Wella', 'unidad', 1],
      ],
    },
    {
      name: 'Servicios',
      data: [
        ['Nombre', 'Precio'],
        ['Corte de cabello', 8000],
        ['Coloración completa', 25000],
      ],
    },
    {
      name: 'Transacciones',
      data: [
        ['Fecha', 'Entrada', 'Salida', 'Moneda', 'Categoría', 'Descripción', 'Medio de pago', 'Instrumento', 'Seña', 'Peluquera'],
        ['15/03/2024', 25000, '', 'ARS', 'Ingresos', 'Coloración completa - cliente Ana', 'Efectivo', '', '', 'Laura'],
        ['15/03/2024', '', 5000, 'ARS', 'Gastos', 'Compra de insumos', 'Transferencia', 'Transferencia', '', ''],
      ],
    },
    {
      name: 'Lotes',
      data: [
        ['SKU', 'Fecha', 'Cantidad', 'Costo', 'Precio', 'Notas'],
        ['TIN-001', '01/03/2024', 10, 1200, 2500, 'Lote inicial'],
        ['SHA-001', '01/03/2024', 5, 1800, 3800, ''],
      ],
    },
    {
      name: 'Profesionales',
      data: [
        ['Nombre', 'Activo'],
        ['Laura García', 'true'],
        ['Sofía Martínez', 'true'],
      ],
    },
  ]

  for (const { name, data } of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), name)
  }

  XLSX.writeFile(wb, 'plantilla-importacion.xlsx')
}

// Normaliza números escritos con separadores es-AR ("1.234,56") o en-US ("1,234.56").
// Devuelve null cuando la celda viene vacía o no es un número, para que quien llama
// pueda distinguir "sin dato" de un cero explícito.
export function parseNumberOrNull(s: string): number | null {
  const trimmed = s.trim()
  if (!trimmed) return null

  const lastComma = trimmed.lastIndexOf(',')
  const lastDot = trimmed.lastIndexOf('.')
  let normalized: string
  if (lastComma !== -1 && lastDot !== -1) {
    normalized = lastDot > lastComma
      ? trimmed.replace(/,/g, '')
      : trimmed.replace(/\./g, '').replace(',', '.')
  } else if (lastComma !== -1) {
    const afterComma = trimmed.slice(lastComma + 1)
    normalized = afterComma.length === 3 && /^\d{3}$/.test(afterComma)
      ? trimmed.replace(/,/g, '')
      : trimmed.replace(',', '.')
  } else {
    normalized = trimmed
  }

  const parsed = parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function autoSuggestMapping(headers: string[], entityType: EntityType): Record<string, string> {
  const fields = ENTITY_FIELDS[entityType]
  const mapping: Record<string, string> = {}
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim())

  const ALIASES: Record<string, string[]> = {
    name: ['nombre', 'name', 'productos', 'producto', 'descripcion', 'descripción'],
    type: ['tipo', 'type'],
    date: ['fecha', 'date'],
    amount: ['monto', 'importe', 'valor', 'amount'],
    description: ['descripcion', 'descripción', 'detalle', 'description'],
    received_date: ['fecha recepcion', 'fecha de recepción', 'fecha recepción', 'received_date', 'fecha compra', 'fecha de compra', 'fecha'],
    initial_quantity: ['cantidad', 'cantidad inicial', 'initial_quantity', 'stock', 'existencia', 'existencias', 'qty', 'unidades'],
    unit_cost: ['costo', 'costo unitario', 'precio compra', 'precio de compra', 'p. compra', 'unit_cost', 'costo unit', 'precio costo'],
    sale_price: ['precio', 'precio venta', 'precio de venta', 'p. venta', 'sale_price', 'pvp', 'precio publico'],
    min_stock: ['stock minimo', 'stock mínimo', 'minimo', 'min_stock', 'stock min'],
    contact: ['contacto', 'contact'],
    phone: ['telefono', 'teléfono', 'tel', 'phone'],
    category: ['categoria', 'categoría', 'category'],
    sku: ['sku'],
    unit: ['unidad', 'unit'],
    email: ['email'],
    notes: ['notas', 'notes'],
    entrada: ['entrada', 'ingreso', 'income'],
    salida: ['salida', 'egreso', 'gasto', 'expense'],
    currency: ['moneda', 'currency', 'divisa'],
    payment_method: ['medio de pago', 'medio', 'metodo', 'método de pago', 'payment'],
    instrument: ['instrumento', 'instrument'],
    is_seña: ['seña', 'sena', 'señas', 'deposito', 'seña cobrada'],
    professional: ['peluquera', 'hairdresser', 'empleada', 'stylist', 'professional'],
    brand: ['marca', 'brand', 'linea', 'línea', 'fabricante', 'proveedor'],
    active: ['activo', 'active', 'habilitado'],
    price: ['precio', 'price', 'monto', 'valor'],
  }

  for (const field of fields) {
    const aliases = ALIASES[field.key] ?? [field.key]
    const idx = normalizedHeaders.findIndex(h => aliases.some(a => h === a || h.includes(a)))
    if (idx !== -1) {
      mapping[field.key] = headers[idx]
    }
  }
  return mapping
}
