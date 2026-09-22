export type MpClassification = 'received_payment' | 'fee' | 'tax' | 'withholding' | 'withdrawal' | 'refund' | 'chargeback' | 'unknown'

export const SETTLEMENT_REPORT_COLUMNS = [
  'TRANSACTION_TYPE',
  'TRANSACTION_AMOUNT',
  'TRANSACTION_CURRENCY',
  'TRANSACTION_DATE',
  'FEE_AMOUNT',
  'SETTLEMENT_NET_AMOUNT',
  'SETTLEMENT_CURRENCY',
  'SETTLEMENT_DATE',
  'REAL_AMOUNT',
  'SOURCE_ID',
  'EXTERNAL_REFERENCE',
  'DESCRIPTION',
  'PAYMENT_METHOD',
  'PAYMENT_METHOD_TYPE',
  'PAYER_NAME',
  'PAYER_ID_TYPE',
  'PAYER_ID_NUMBER',
  'POI_WALLET_NAME',
  'POI_BANK_NAME',
  'BUSINESS_UNIT',
  'SUB_UNIT',
  'SALE_DETAIL',
  'METADATA',
  'ORDER_ID',
  'TAXES_AMOUNT',
  'TAX_DETAIL',
] as const

export function settlementReportConfiguration() {
  return {
    columns: SETTLEMENT_REPORT_COLUMNS.map(key => ({ key })),
    file_name_prefix: 'erp-settlement-report',
    frequency: { hour: 0, value: 1, type: 'monthly' },
    separator: ';',
    scheduled: false,
    include_withdraw: true,
  }
}

export function settlementReportConfigurationNeedsUpdate(provider: unknown) {
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) return true
  const configuration = provider as Record<string, unknown>
  const columns = configuration.columns
  if (!Array.isArray(columns)) return true
  const configured = new Set(columns.flatMap(column => {
    if (typeof column === 'string') return [column.trim().toUpperCase()]
    if (!column || typeof column !== 'object' || Array.isArray(column)) return []
    const key = (column as Record<string, unknown>).key
    return typeof key === 'string' ? [key.trim().toUpperCase()] : []
  }))
  if (SETTLEMENT_REPORT_COLUMNS.some(column => !configured.has(column))) return true

  const frequency = configuration.frequency
  if (!frequency || typeof frequency !== 'object' || Array.isArray(frequency)) return true
  const currentFrequency = frequency as Record<string, unknown>
  const prefix = typeof configuration.file_name_prefix === 'string' ? configuration.file_name_prefix : ''
  return !prefix.startsWith('erp-settlement-report')
    || configuration.scheduled !== false
    || configuration.include_withdrawal_at_end !== true
    || currentFrequency.hour !== 0
    || currentFrequency.value !== 1
    || currentFrequency.type !== 'monthly'
}

export function settlementTaskLocator(id: unknown) {
  const value = providerNumericId(id)
  if (!value) throw new Error('Mercado Pago aceptó el reporte pero no devolvió un id de tarea válido.')
  return `task:${value}`
}

export function settlementTaskId(locator: string) {
  const match = /^task:(\d{1,64})$/.exec(locator)
  return match?.[1] ?? null
}

function providerNumericId(value: unknown) {
  const id = typeof value === 'number' || typeof value === 'string' ? String(value).trim() : ''
  return /^\d{1,64}$/.test(id) ? id : null
}

function providerFileName(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function providerTerminalError(provider: Record<string, unknown>, resource: string) {
  const status = typeof provider.status === 'string' ? provider.status.trim().toLowerCase() : ''
  if (!['failed', 'error', 'cancelled', 'canceled', 'rejected'].includes(status)) return null
  const providerDetail = [provider.message, provider.detail, provider.error].find(value => typeof value === 'string' && value.trim())
  const suffix = typeof providerDetail === 'string' ? `: ${providerDetail}` : '.'
  return new Error(`Mercado Pago no pudo generar ${resource} (estado ${status})${suffix}`)
}

export function settlementTaskResult(provider: Record<string, unknown>) {
  const status = typeof provider.status === 'string' ? provider.status.trim().toLowerCase() : ''
  if (['pending', 'processing', 'in_progress', 'created'].includes(status)) {
    return { state: 'processing' as const, status }
  }
  if (['available', 'processed', 'completed'].includes(status)) {
    const fileName = providerFileName(provider.file_name ?? provider.fileName)
    const reportId = providerNumericId(provider.report_id ?? provider.reportId)
    return { state: 'ready' as const, status, fileName, reportId }
  }
  const terminalError = providerTerminalError(provider, 'el reporte')
  if (terminalError) throw terminalError
  if (!status) throw new Error('Mercado Pago respondió la consulta de la tarea sin un estado.')
  throw new Error(`Mercado Pago devolvió un estado de tarea no reconocido: ${status}.`)
}

export function settlementReportIdFromTaskList(provider: unknown, taskId: string) {
  if (!Array.isArray(provider)) throw new Error('Mercado Pago devolvió una lista de reportes inválida.')
  const task = provider.find(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    return providerNumericId((item as Record<string, unknown>).id) === taskId
  }) as Record<string, unknown> | undefined
  if (!task) return null
  const terminalError = providerTerminalError(task, 'el reporte')
  if (terminalError) throw terminalError
  const explicitReportId = task.report_id ?? task.reportId
  if (explicitReportId !== undefined && explicitReportId !== null) return providerNumericId(explicitReportId)
  return providerNumericId(task.id)
}

export function settlementFileNameFromReportSearch(provider: unknown, reportId: string) {
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
    throw new Error('Mercado Pago devolvió una búsqueda de reportes inválida.')
  }
  const results = (provider as Record<string, unknown>).results
  if (!Array.isArray(results)) throw new Error('Mercado Pago devolvió una búsqueda de reportes sin resultados válidos.')
  const report = results.find(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    return providerNumericId((item as Record<string, unknown>).id) === reportId
  }) as Record<string, unknown> | undefined
  if (!report) return null
  const terminalError = providerTerminalError(report, 'el reporte')
  if (terminalError) throw terminalError
  return providerFileName(report.file_name ?? report.fileName)
}

function providerIsoInstant(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const instant = Date.parse(value)
  return Number.isFinite(instant) ? instant : null
}

function providerIsoTimestamp(value: unknown) {
  const instant = providerIsoInstant(value)
  return instant === null ? null : new Date(instant).toISOString()
}

function safeProviderFieldName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '?').slice(0, 64) || '?'
}

function providerLabel(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32)
  return normalized || null
}

/** Schema-only diagnostics: field names are bounded and provider values are
 * never copied into the response. Only one nested object level is described. */
export function settlementProviderShape(provider: unknown) {
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
    return { topLevelFields: [] as string[], nestedObjectFields: [] as Array<{ field: string; fields: string[] }> }
  }
  const entries = Object.entries(provider as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
  const topLevelFields = [...new Set(entries.map(([field]) => safeProviderFieldName(field)))].slice(0, 30)
  const nestedObjectFields = entries.flatMap(([field, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const fields = [...new Set(Object.keys(value as Record<string, unknown>).map(safeProviderFieldName))].sort().slice(0, 20)
    return [{ field: safeProviderFieldName(field), fields }]
  }).slice(0, 10)
  return { topLevelFields, nestedObjectFields }
}

/** A bounded allow-list projection for diagnosing report-search mismatches. */
export function settlementReportSearchDiagnostics(provider: unknown) {
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
    throw new Error('Mercado Pago devolvió una búsqueda de reportes inválida.')
  }
  const results = (provider as Record<string, unknown>).results
  if (!Array.isArray(results)) throw new Error('Mercado Pago devolvió una búsqueda de reportes sin resultados válidos.')
  const candidates = results.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const report = item as Record<string, unknown>
    return [{
      id: providerNumericId(report.id),
      status: providerLabel(report.status),
      createdFrom: providerLabel(report.created_from ?? report.createdFrom),
      beginDate: providerIsoTimestamp(report.begin_date ?? report.beginDate),
      endDate: providerIsoTimestamp(report.end_date ?? report.endDate),
      dateCreated: providerIsoTimestamp(report.date_created ?? report.dateCreated),
      hasFileName: providerFileName(report.file_name ?? report.fileName) !== null,
    }]
  }).slice(0, 5)
  return { resultCount: results.length, candidates }
}

export function settlementTaskListDiagnostics(provider: unknown, taskId: string) {
  if (!Array.isArray(provider)) throw new Error('Mercado Pago devolvió una lista de reportes inválida.')
  const matchedTask = provider.some(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    return providerNumericId((item as Record<string, unknown>).id) === taskId
  })
  return { resultCount: provider.length, matchedTask }
}

export function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === delimiter && !quoted) { row.push(cell); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); cell = ''
      if (row.some(value => value.trim() !== '')) rows.push(row)
      row = []
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  if (rows.length < 2) return []
  const headers = rows[0].map(header => header.trim().toUpperCase())
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])))
}

export function classifyMpMovement(row: Record<string, string>): MpClassification {
  const haystack = [row.TRANSACTION_TYPE, row.DESCRIPTION, row.SALE_DETAIL, row.TAX_DETAIL, row.SOURCE_ID, row.REASON].filter(Boolean).join(' ').toLowerCase()
  if (/chargeback|contracargo/.test(haystack)) return 'chargeback'
  if (/refund|devoluci[oó]n/.test(haystack)) return 'refund'
  if (/withdraw|retiro|bank_transfer/.test(haystack)) return 'withdrawal'
  if (/withholding|retenci[oó]n|percepci[oó]n|iibb|ganancias/.test(haystack)) return 'withholding'
  if (/tax|impuesto|iva/.test(haystack)) return 'tax'
  if (/fee|comisi[oó]n|shipping_fee|financing_fee/.test(haystack)) return 'fee'
  if (/settlement|payment|approved|cobro/.test(haystack)) return 'received_payment'
  return 'unknown'
}

const MP_MOVEMENT_LABELS: Record<MpClassification, string> = {
  received_payment: 'Cobro recibido',
  fee: 'Comisión',
  tax: 'Impuesto',
  withholding: 'Retención',
  withdrawal: 'Retiro',
  refund: 'Devolución',
  chargeback: 'Contracargo',
  unknown: 'Movimiento',
}

function providerText(value: string | undefined) {
  const text = value?.trim()
  return text || null
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`
}

function stableMetadata(value: string | undefined) {
  const text = providerText(value)
  if (!text) return ''
  try {
    return stableJson(JSON.parse(text))
  } catch {
    return text
  }
}

function metadataEventReference(value: string | undefined) {
  const text = providerText(value)
  if (!text) return null
  try {
    const metadata = JSON.parse(text) as unknown
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
    const candidates = ['refund_id', 'event_id', 'movement_id', 'operation_id', 'transaction_id']
    const record = metadata as Record<string, unknown>
    for (const key of candidates) {
      const direct = record[key]
      if (typeof direct === 'string' || typeof direct === 'number') return String(direct).trim() || null
    }
    for (const nested of Object.values(record)) {
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue
      const nestedRecord = nested as Record<string, unknown>
      for (const key of candidates) {
        const candidate = nestedRecord[key]
        if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate).trim() || null
      }
    }
  } catch {
    return null
  }
  return null
}

function eventTypeSegment(value: string | undefined, classification: MpClassification) {
  const normalized = (providerText(value) ?? classification)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
  return normalized || classification
}

function eventFingerprint(value: string) {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

export function mpMovementExternalId(row: Record<string, string>, classification: MpClassification) {
  const sourceId = providerText(row.SOURCE_ID)
  const fallbackId = providerText(row.EXTERNAL_REFERENCE)
    ?? providerText(row.SETTLEMENT_ID)
    ?? providerText(row.TRANSACTION_ID)
  const baseId = sourceId ?? fallbackId
  if (!baseId || !sourceId || classification === 'received_payment') return baseId

  const explicitReference = providerText(row.EXTERNAL_REFERENCE) !== sourceId
    ? providerText(row.EXTERNAL_REFERENCE)
    : null
  const eventReference = explicitReference ?? metadataEventReference(row.METADATA)
  const transactionType = eventTypeSegment(row.TRANSACTION_TYPE, classification)
  const stableEventMaterial = eventReference
    ? `classification=${classification}|event=${eventReference}`
    : [
        `classification=${classification}`,
        `type=${transactionType}`,
        `date=${providerText(row.TRANSACTION_DATE) ?? providerText(row.DATE_CREATED) ?? providerText(row.SETTLEMENT_DATE) ?? providerText(row.DATE) ?? ''}`,
        `amount=${providerText(row.TRANSACTION_AMOUNT) ?? providerText(row.REAL_AMOUNT) ?? providerText(row.SETTLEMENT_NET_AMOUNT) ?? providerText(row.NET_CREDIT_AMOUNT) ?? providerText(row.NET_DEBIT_AMOUNT) ?? providerText(row.AMOUNT) ?? ''}`,
        `metadata=${stableMetadata(row.METADATA)}`,
        `order=${providerText(row.ORDER_ID) ?? ''}`,
      ].join('|')
  return `${sourceId}:${transactionType}:${eventFingerprint(stableEventMaterial)}`
}

export function mpMovementDescription(row: Record<string, string>, classification: MpClassification, externalId: string) {
  return providerText(row.PAYER_NAME)
    ?? providerText(row.SALE_DETAIL)
    ?? providerText(row.DESCRIPTION)
    ?? providerText(row.EXTERNAL_REFERENCE)
    ?? `${MP_MOVEMENT_LABELS[classification]} Mercado Pago · MP ${externalId}`
}

export function mpPostingPolicy(classification: MpClassification) {
  if (classification === 'received_payment') return { autoPost: true as const, transactionType: 'income' as const, paymentDirection: 'entrada' as const }
  if (['fee', 'tax', 'withholding', 'refund', 'chargeback'].includes(classification)) {
    return { autoPost: true as const, transactionType: 'expense' as const, paymentDirection: 'salida' as const }
  }
  return { autoPost: false as const, transactionType: null, paymentDirection: null }
}

export function parseMpAmount(value: string | undefined) {
  if (!value) return 0
  const trimmed = value.trim()
  const normalized = trimmed.includes(',') ? trimmed.replaceAll('.', '').replace(',', '.') : trimmed
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : 0
}

export function movementFromReportRow(row: Record<string, string>) {
  const date = row.TRANSACTION_DATE || row.SETTLEMENT_DATE || row.REAL_AMOUNT_DATE || row.DATE_CREATED || row.DATE
  const classification = classifyMpMovement(row)
  const externalId = mpMovementExternalId(row, classification)
  const transactionAmount = parseMpAmount(row.TRANSACTION_AMOUNT || row.GROSS_AMOUNT)
  const settlementNet = parseMpAmount(row.SETTLEMENT_NET_AMOUNT)
  const credit = parseMpAmount(row.NET_CREDIT_AMOUNT)
  const debit = parseMpAmount(row.NET_DEBIT_AMOUNT)
  const amount = classification === 'received_payment' && transactionAmount !== 0
    ? transactionAmount
    : settlementNet !== 0
      ? settlementNet
      : credit !== 0
      ? Math.abs(credit)
      : debit !== 0
        ? -Math.abs(debit)
        : parseMpAmount(row.REAL_AMOUNT || row.TRANSACTION_AMOUNT || row.AMOUNT)
  if (!externalId || !date || amount === 0) return null
  return {
    external_id: externalId,
    occurred_at: new Date(date).toISOString(),
    amount,
    gross_amount: transactionAmount || null,
    fee_amount: parseMpAmount(row.MP_FEE_AMOUNT || row.FEE_AMOUNT) || null,
    currency: row.SETTLEMENT_CURRENCY || row.TRANSACTION_CURRENCY || row.CURRENCY_ID || 'ARS',
    description: mpMovementDescription(row, classification, externalId),
    movement_type: row.TRANSACTION_TYPE || null,
    suggested_classification: classification,
    raw_data: row,
  }
}

/** A settlement row represents the business movement and, when present, a
 * separate fee component. Keeping both external IDs stable makes overlap safe. */
export function movementsFromReportRow(row: Record<string, string>) {
  const primary = movementFromReportRow(row)
  if (!primary) return []
  const fee = parseMpAmount(row.MP_FEE_AMOUNT || row.FEE_AMOUNT)
  const taxes = parseMpAmount(row.TAXES_AMOUNT)
  const movements = [primary]
  if (fee !== 0 && primary.suggested_classification !== 'fee') {
    movements.push({
      ...primary,
      external_id: `${primary.external_id}:fee`,
      amount: -Math.abs(fee),
      gross_amount: null,
      fee_amount: -Math.abs(fee),
      description: `Comisión Mercado Pago · ${primary.description ?? primary.external_id}`,
      movement_type: 'fee_component',
      suggested_classification: 'fee' as const,
      raw_data: { ...row, ERP_COMPONENT: 'fee', ERP_PARENT_EXTERNAL_ID: primary.external_id },
    })
  }
  if (taxes !== 0 && !['tax', 'withholding'].includes(primary.suggested_classification)) {
    const classification = /withholding|retenci[oó]n|percepci[oó]n|iibb|ganancias/i.test(row.TAX_DETAIL || '') ? 'withholding' as const : 'tax' as const
    movements.push({
      ...primary,
      external_id: `${primary.external_id}:${classification}`,
      amount: -Math.abs(taxes),
      gross_amount: null,
      fee_amount: null,
      description: `${MP_MOVEMENT_LABELS[classification]} Mercado Pago · ${primary.description}`,
      movement_type: `${classification}_component`,
      suggested_classification: classification,
      raw_data: { ...row, ERP_COMPONENT: classification, ERP_PARENT_EXTERNAL_ID: primary.external_id },
    })
  }
  return movements
}

export function pendingMovementPatch(movement: ReturnType<typeof movementsFromReportRow>[number], runId: string, updatedAt: string) {
  return {
    occurred_at: movement.occurred_at,
    amount: movement.amount,
    gross_amount: movement.gross_amount,
    fee_amount: movement.fee_amount,
    currency: movement.currency,
    description: movement.description,
    movement_type: movement.movement_type,
    suggested_classification: movement.suggested_classification,
    raw_data: movement.raw_data,
    last_seen_run_id: runId,
    updated_at: updatedAt,
  }
}
