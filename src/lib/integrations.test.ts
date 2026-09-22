import { describe, expect, it } from 'vitest'
import forge from 'node-forge'
import migrationSql from '../../supabase/migrations/102_arca_mercadopago_integrations.sql?raw'
import mpAutoPostingMigrationSql from '../../supabase/migrations/103_mercadopago_auto_posting.sql?raw'
import arcaEdgeSource from '../../supabase/functions/arca-issue/index.ts?raw'
import mpEdgeSource from '../../supabase/functions/mercadopago-sync/index.ts?raw'
import denoConfig from '../../supabase/functions/deno.json?raw'
import packageJson from '../../package.json?raw'
import integrationsPageSource from '../pages/integrations/IntegrationsPage.tsx?raw'
import transactionsPageSource from '../pages/transactions/TransactionsPage.tsx?raw'
import { arcaQrPayload, edgeFunctionErrorDetail, fiscalGroupInvoiceState, fiscalTransactionEligibility, reconciliationRequirements, validateFiscalSource } from './integrations'
import { buildWsfeAuthorizeEnvelope, parseWsfeAuthorization, parseWsfeConsultation } from '../../supabase/functions/_shared/arca.ts'
import { ForgeCmsSigner } from '../../supabase/functions/_shared/cms.ts'
import {
  classifyMpMovement,
  movementFromReportRow,
  movementsFromReportRow,
  mpMovementExternalId,
  mpMovementDescription,
  mpPostingPolicy,
  parseCsv,
  pendingMovementPatch,
  SETTLEMENT_REPORT_COLUMNS,
  settlementFileNameFromReportSearch,
  settlementProviderShape,
  settlementReportConfiguration,
  settlementReportConfigurationNeedsUpdate,
  settlementReportIdFromTaskList,
  settlementReportSearchDiagnostics,
  settlementTaskId,
  settlementTaskLocator,
  settlementTaskListDiagnostics,
  settlementTaskResult,
} from '../../supabase/functions/_shared/mercadopago.ts'

describe('integration domain rules', () => {
  it('rejects fiscal tickets that are empty, non-ARS, non-positive, or already invoiced', () => {
    expect(validateFiscalSource([], [])).toContain('Seleccioná')
    expect(validateFiscalSource([100], ['USD'])).toContain('ARS')
    expect(validateFiscalSource([-100], ['ARS'])).toContain('positivo')
    expect(validateFiscalSource([100], ['ARS'], true)).toContain('ya pertenece')
    expect(validateFiscalSource([100], ['ARS'])).toBeNull()
  })

  it('offers row invoicing only for active positive ARS income and opens existing documents', () => {
    const income = { amount: 100, currency: 'ARS', voided_at: null, subcategory: { transaction_type: 'income' as const } }
    expect(fiscalTransactionEligibility(income)).toEqual({ canCreate: true, canOpenExisting: false, reason: null })
    expect(fiscalTransactionEligibility({ ...income, voided_at: '2026-09-18T12:00:00Z' }).reason).toContain('anuladas')
    expect(fiscalTransactionEligibility({ ...income, subcategory: { transaction_type: 'expense' as const } }).reason).toContain('ingresos')
    expect(fiscalTransactionEligibility({ ...income, currency: 'USD' }).reason).toContain('ARS')
    expect(fiscalTransactionEligibility(income, 'queued')).toEqual({ canCreate: false, canOpenExisting: true, reason: 'La transacción ya tiene un comprobante fiscal.' })
  })

  it('uses every real group member for one fiscal total and rejects mixed eligibility', () => {
    const members = [
      { id: 'tx-1', amount: 100, currency: 'ARS', voided_at: null, subcategory: { transaction_type: 'income' as const } },
      { id: 'tx-2', amount: 250, currency: 'ARS', voided_at: null, subcategory: { transaction_type: 'income' as const } },
    ]
    expect(fiscalGroupInvoiceState(members, [])).toMatchObject({ kind: 'ready', transactionIds: ['tx-1', 'tx-2'], total: 350 })
    expect(fiscalGroupInvoiceState([...members, { ...members[1], id: 'tx-3', subcategory: { transaction_type: 'expense' as const } }], []).reason).toContain('ingresos')
    expect(fiscalGroupInvoiceState([{ ...members[0], voided_at: '2026-09-18T12:00:00Z' }, members[1]], []).reason).toContain('anuladas')
    expect(fiscalGroupInvoiceState([{ ...members[0], currency: 'USD' }, members[1]], []).reason).toContain('ARS')
  })

  it('opens one shared group document and blocks partial or conflicting links', () => {
    const members = [
      { id: 'tx-1', amount: 100, currency: 'ARS', voided_at: null, subcategory: { transaction_type: 'income' as const } },
      { id: 'tx-2', amount: 250, currency: 'ARS', voided_at: null, subcategory: { transaction_type: 'income' as const } },
    ]
    expect(fiscalGroupInvoiceState(members, [{ id: 'doc-1', status: 'draft', transaction_ids: ['tx-1', 'tx-2'] }])).toMatchObject({ kind: 'existing', document: { id: 'doc-1' } })
    expect(fiscalGroupInvoiceState(members, [{ id: 'doc-1', status: 'draft', transaction_ids: ['tx-1'] }])).toMatchObject({ kind: 'blocked', reason: expect.stringContaining('Parte del grupo') })
    expect(fiscalGroupInvoiceState(members, [
      { id: 'doc-1', status: 'authorized', transaction_ids: ['tx-1'] },
      { id: 'doc-2', status: 'draft', transaction_ids: ['tx-2'] },
    ])).toMatchObject({ kind: 'blocked', reason: expect.stringContaining('distintos') })
  })

  it('reserves a dedicated table actions column and invoices the aggregate group row', () => {
    expect(transactionsPageSource).toContain("className: 'w-[11rem] min-w-[11rem]'")
    expect(transactionsPageSource).toContain('renderGroupActions(row.group)')
    expect(transactionsPageSource).toContain('transactions: group.members')
    expect(transactionsPageSource).toContain('transaction-mobile-card__actions flex-wrap')
  })

  it('builds the official ARCA QR URL and exact payload contract', () => {
    const url = arcaQrPayload({ date: '2026-09-18', taxId: '20123456789', pointOfSale: 4, receiptType: 11, receiptNumber: 81, total: 12500.5, documentType: 99, documentNumber: '0', cae: '12345678901234' })
    const payload = JSON.parse(Buffer.from(new URL(url).searchParams.get('p')!, 'base64').toString('utf8'))
    expect(payload).toMatchObject({ ver: 1, ptoVta: 4, tipoCmp: 11, nroCmp: 81, importe: 12500.5, moneda: 'PES', tipoCodAut: 'E' })
  })

  it('keeps Mercado Pago independent and requires a destination only for withdrawals', () => {
    expect(reconciliationRequirements('received_payment')).toEqual({ category: false, destination: false })
    expect(reconciliationRequirements('fee').category).toBe(true)
    expect(reconciliationRequirements('withdrawal').destination).toBe(true)
    expect(reconciliationRequirements('unknown')).toEqual({ category: false, destination: false })
    expect(integrationsPageSource).not.toContain('Venta existente')
    expect(integrationsPageSource).not.toContain('existingTransactionId')
  })

  it('builds and parses WSFEv1 without inventing authorization data', () => {
    const request = buildWsfeAuthorizeEnvelope({ taxId: '20123456789', token: 'token', sign: 'sign', pointOfSale: 4, receiptType: 11, receiptNumber: 81, issueDate: '2026-09-18', documentType: 99, documentNumber: '0', taxConditionId: 5, total: 12500.5 })
    expect(request).toContain('<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>')
    expect(parseWsfeAuthorization('<Resultado>R</Resultado><Obs><Msg>Dato inválido</Msg></Obs>')).toEqual({ authorized: false, message: 'Dato inválido' })
    expect(parseWsfeAuthorization('<Resultado>A</Resultado><CAE>12345678901234</CAE><CAEFchVto>20260928</CAEFchVto><CbteDesde>81</CbteDesde>')).toEqual({ authorized: true, cae: '12345678901234', expires: '20260928', receiptNumber: 81 })
    expect(parseWsfeConsultation('<Resultado>A</Resultado><CodAutorizacion>12345678901234</CodAutorizacion><FchVto>20260928</FchVto><CbteDesde>81</CbteDesde>')).toEqual({ authorized: true, cae: '12345678901234', expires: '20260928', receiptNumber: 81 })
    expect(parseWsfeConsultation('<Resultado>R</Resultado><CAE>fake</CAE><CAEFchVto>20260928</CAEFchVto><CbteDesde>81</CbteDesde>').authorized).toBe(false)
  })

  it('parses quoted Mercado Pago reports and keeps debit direction', () => {
    const [row] = parseCsv('TRANSACTION_ID;SETTLEMENT_DATE;NET_DEBIT_AMOUNT;DESCRIPTION\nmp-1;2026-09-18T10:00:00-03:00;1.234,50;"Comisión, Mercado Pago"')
    expect(classifyMpMovement(row)).toBe('fee')
    expect(movementFromReportRow(row)).toMatchObject({ external_id: 'mp-1', amount: -1234.5, suggested_classification: 'fee' })
  })

  it('configures manual Mercado Pago reports with the current account-report columns', () => {
    const configuration = settlementReportConfiguration()
    expect(configuration).toMatchObject({
      scheduled: false,
      frequency: { hour: 0, value: 1, type: 'monthly' },
      separator: ';',
    })
    expect(configuration.columns.map(column => column.key)).toEqual(SETTLEMENT_REPORT_COLUMNS)
    expect(configuration.columns.map(column => column.key)).toEqual(expect.arrayContaining([
      'TRANSACTION_TYPE',
      'TRANSACTION_AMOUNT',
      'TRANSACTION_CURRENCY',
      'TRANSACTION_DATE',
      'SETTLEMENT_NET_AMOUNT',
      'SETTLEMENT_DATE',
      'SOURCE_ID',
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
    ]))
    const current = {
      ...configuration,
      file_name_prefix: 'erp-settlement-report-123456',
      include_withdrawal_at_end: true,
    }
    expect(settlementReportConfigurationNeedsUpdate(current)).toBe(false)
    expect(settlementReportConfigurationNeedsUpdate({ ...current, scheduled: true })).toBe(true)
    expect(settlementReportConfigurationNeedsUpdate({ ...current, columns: configuration.columns.slice(1) })).toBe(true)
  })

  it('tracks asynchronous Mercado Pago tasks until a processed file is available', () => {
    expect(settlementTaskLocator(99336983670)).toBe('task:99336983670')
    expect(settlementTaskId('task:99336983670')).toBe('99336983670')
    expect(settlementTaskId('settlement-report.csv')).toBeNull()
    expect(settlementTaskId(`task:${'9'.repeat(65)}`)).toBeNull()
    expect(settlementTaskResult({ status: 'pending' })).toEqual({ state: 'processing', status: 'pending' })
    expect(settlementTaskResult({ status: 'available', file_name: 'settlement-report.csv' })).toEqual({ state: 'ready', status: 'available', fileName: 'settlement-report.csv', reportId: null })
    expect(settlementTaskResult({ status: 'processed', report_id: 17012160 })).toEqual({ state: 'ready', status: 'processed', fileName: null, reportId: '17012160' })
    expect(settlementTaskResult({ status: 'available' })).toEqual({ state: 'ready', status: 'available', fileName: null, reportId: null })
    expect(() => settlementTaskResult({ status: 'failed', message: 'generation failed' })).toThrow('generation failed')
    expect(() => settlementTaskLocator(undefined)).toThrow('id de tarea válido')
    expect(() => settlementTaskLocator('9'.repeat(65))).toThrow('id de tarea válido')
    expect(settlementTaskResult({ status: 'available', report_id: '9'.repeat(65) })).toMatchObject({ reportId: null })
  })

  it('prefers an explicit report id from the exact task-list match', () => {
    expect(settlementReportIdFromTaskList([
      { id: 111, report_id: 222, status: 'processed' },
      { id: 99336983670, report_id: 17012160, status: 'available' },
    ], '99336983670')).toBe('17012160')
  })

  it('uses the exact matched task id when this provider omits report_id', () => {
    expect(settlementReportIdFromTaskList([], '99336983670')).toBeNull()
    expect(settlementReportIdFromTaskList([{ id: 103237377, status: 'processed' }], '103237377')).toBe('103237377')
    expect(settlementReportIdFromTaskList([{ id: 103237377, report_id: '9'.repeat(65), status: 'processed' }], '103237377')).toBeNull()
  })

  it('resolves ready Mercado Pago reports through exact-id search responses', () => {
    expect(settlementFileNameFromReportSearch({ results: [
      { id: 1, file_name: 'another-report.csv', status: 'processed' },
      { id: 17012160, file_name: 'settlement-report.csv', status: 'processed' },
    ] }, '17012160')).toBe('settlement-report.csv')
    expect(settlementFileNameFromReportSearch({ results: [] }, '17012160')).toBeNull()
    expect(settlementFileNameFromReportSearch({ results: [{ id: 17012160, status: 'available' }] }, '17012160')).toBeNull()
  })

  it('emits bounded schema-only task diagnostics without provider values', () => {
    const diagnostics = settlementProviderShape({
      status: 'available',
      access_token: 'APP_USR-super-secret',
      file_name: 'private-report-name.csv',
      report: { id: 17012160, file_name: 'nested-private-name.csv', account_id: 987654321 },
    })
    expect(diagnostics).toEqual({
      topLevelFields: ['access_token', 'file_name', 'report', 'status'],
      nestedObjectFields: [{ field: 'report', fields: ['account_id', 'file_name', 'id'] }],
    })
    expect(JSON.stringify(diagnostics)).not.toContain('APP_USR-super-secret')
    expect(JSON.stringify(diagnostics)).not.toContain('private-report-name.csv')
    expect(JSON.stringify(diagnostics)).not.toContain('987654321')
  })

  it('sanitizes and bounds broad report-search diagnostics without weakening exact matching', () => {
    const window = { begin_date: '2026-09-15T12:00:00Z', end_date: '2026-09-18T12:00:00Z' }
    const provider = { results: [
      {
        id: 17012160,
        ...window,
        status: 'PROCESSED',
        created_from: 'manual',
        date_created: '2026-09-18T12:01:00-03:00',
        file_name: 'private-matching-report.csv',
        user_id: 111222333,
        account_id: 444555666,
        metadata: 'private metadata',
        amount: 987654.32,
      },
      {
        id: 17012161,
        begin_date: '2026-09-14T12:00:00Z',
        end_date: window.end_date,
        status: 'available',
        created_from: 'manual',
        file_name: 'unrelated-report.csv',
      },
      ...Array.from({ length: 5 }, (_, index) => ({ id: 17012162 + index, status: 'available' })),
    ] }
    const diagnostics = settlementReportSearchDiagnostics(provider)
    expect(diagnostics.resultCount).toBe(7)
    expect(diagnostics.candidates).toHaveLength(5)
    expect(diagnostics.candidates[0]).toEqual({
      id: '17012160',
      status: 'processed',
      createdFrom: 'manual',
      beginDate: '2026-09-15T12:00:00.000Z',
      endDate: '2026-09-18T12:00:00.000Z',
      dateCreated: '2026-09-18T15:01:00.000Z',
      hasFileName: true,
    })
    const serialized = JSON.stringify(diagnostics)
    expect(serialized).not.toContain('private-matching-report.csv')
    expect(serialized).not.toContain('unrelated-report.csv')
    expect(serialized).not.toContain('private metadata')
    expect(serialized).not.toContain('111222333')
    expect(serialized).not.toContain('444555666')
    expect(serialized).not.toContain('987654.32')
    expect(settlementReportSearchDiagnostics({ results: [{ id: '9'.repeat(65), status: 'available' }] }).candidates[0].id).toBeNull()
  })

  it('limits list diagnostics to count and task presence', () => {
    expect(settlementTaskListDiagnostics([{ id: 42, account_id: 987654321, file_name: 'private.csv' }], '42')).toEqual({ resultCount: 1, matchedTask: true })
  })

  it('keeps broad search diagnostic-only even with one exact file-bearing candidate', () => {
    const diagnostics = settlementReportSearchDiagnostics({ results: [{
      id: 17012160,
      status: 'processed',
      created_from: 'manual',
      begin_date: '2026-09-15T12:00:00Z',
      end_date: '2026-09-18T12:00:00Z',
      date_created: '2026-09-18T12:01:00Z',
      file_name: 'must-not-be-selected.csv',
    }] })
    expect(diagnostics).toMatchObject({ resultCount: 1, candidates: [{ hasFileName: true }] })
    const broadSearchStart = mpEdgeSource.indexOf('const searchParams = new URLSearchParams')
    const broadSearchEnd = mpEdgeSource.indexOf('if (!fileName) {', broadSearchStart)
    expect(broadSearchStart).toBeGreaterThan(-1)
    expect(broadSearchEnd).toBeGreaterThan(broadSearchStart)
    expect(mpEdgeSource.slice(broadSearchStart, broadSearchEnd)).not.toContain('fileName =')
  })

  it('preserves terminal provider failures while resolving report metadata', () => {
    expect(() => settlementReportIdFromTaskList([
      { id: 99336983670, report_id: 17012160, status: 'failed', message: 'list generation failed' },
    ], '99336983670')).toThrow('list generation failed')
    expect(() => settlementFileNameFromReportSearch({ results: [
      { id: 17012160, status: 'rejected', detail: 'search generation failed' },
    ] }, '17012160')).toThrow('search generation failed')
  })

  it('maps current Mercado Pago account-report fields without legacy column names', () => {
    const movement = movementFromReportRow({
      SOURCE_ID: 'mp-current-1',
      EXTERNAL_REFERENCE: 'sale-1',
      TRANSACTION_TYPE: 'SETTLEMENT',
      TRANSACTION_AMOUNT: '1000.00',
      TRANSACTION_CURRENCY: 'ARS',
      TRANSACTION_DATE: '2026-09-18T10:00:00-03:00',
      FEE_AMOUNT: '100.00',
      SETTLEMENT_NET_AMOUNT: '900.00',
      SETTLEMENT_CURRENCY: 'ARS',
      SETTLEMENT_DATE: '2026-09-18T10:05:00-03:00',
      DESCRIPTION: 'Cobro salón',
    })
    expect(movement).toMatchObject({
      external_id: 'mp-current-1',
      occurred_at: '2026-09-18T13:00:00.000Z',
      amount: 1000,
      gross_amount: 1000,
      fee_amount: 100,
      currency: 'ARS',
      movement_type: 'SETTLEMENT',
      suggested_classification: 'received_payment',
    })
  })

  it('keeps the legacy settlement id while separating later provider events', () => {
    const settlement = {
      SOURCE_ID: 'payment-42',
      TRANSACTION_TYPE: 'SETTLEMENT',
      TRANSACTION_DATE: '2026-09-18T10:00:00-03:00',
      TRANSACTION_AMOUNT: '1000.00',
    }
    const refund = {
      SOURCE_ID: 'payment-42',
      TRANSACTION_TYPE: 'REFUND',
      TRANSACTION_DATE: '2026-09-19T10:00:00-03:00',
      TRANSACTION_AMOUNT: '-400.00',
      EXTERNAL_REFERENCE: 'refund-1',
    }
    expect(mpMovementExternalId(settlement, 'received_payment')).toBe('payment-42')
    expect(mpMovementExternalId(refund, 'refund')).toMatch(/^payment-42:refund:[0-9a-f]{16}$/)
    expect(mpMovementExternalId(refund, 'refund')).not.toBe('payment-42')
    expect(mpMovementExternalId(refund, 'refund')).toBe(mpMovementExternalId({ ...refund }, 'refund'))
  })

  it('separates partial refunds for one payment using stable event fields', () => {
    const first = {
      SOURCE_ID: 'payment-77',
      TRANSACTION_TYPE: 'REFUND',
      TRANSACTION_DATE: '2026-09-19T10:00:00-03:00',
      TRANSACTION_AMOUNT: '-100.00',
      METADATA: '{"reason":"partial"}',
    }
    const second = {
      ...first,
      TRANSACTION_DATE: '2026-09-20T11:00:00-03:00',
      TRANSACTION_AMOUNT: '-150.00',
    }
    expect(mpMovementExternalId(first, 'refund')).not.toBe(mpMovementExternalId(second, 'refund'))
    expect(mpMovementExternalId({ ...first, METADATA: '{"reason":"partial"}' }, 'refund')).toBe(mpMovementExternalId(first, 'refund'))
  })

  it('preserves safe fallback ids without SOURCE_ID and stable fee suffixes', () => {
    expect(mpMovementExternalId({ EXTERNAL_REFERENCE: 'refund-event-9', TRANSACTION_TYPE: 'REFUND' }, 'refund')).toBe('refund-event-9')
    const row = { SOURCE_ID: 'payment-9', SETTLEMENT_DATE: '2026-09-18T10:00:00-03:00', TRANSACTION_TYPE: 'PAYMENT', TRANSACTION_AMOUNT: '1000', FEE_AMOUNT: '100' }
    const first = movementsFromReportRow(row)
    const repeated = movementsFromReportRow({ ...row })
    expect(first.map(movement => movement.external_id)).toEqual(['payment-9', 'payment-9:fee'])
    expect(repeated.map(movement => movement.external_id)).toEqual(first.map(movement => movement.external_id))
  })

  it('surfaces JSON detail from a non-2xx Edge Function response', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify({ detail: 'Mercado Pago HTTP 404 al GET /config' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    })
    expect(await edgeFunctionErrorDetail(error)).toBe('Mercado Pago HTTP 404 al GET /config')
    expect(await edgeFunctionErrorDetail(new Error('network failed'))).toBe('network failed')
  })

  it('splits Mercado Pago fees into a stable idempotent movement', () => {
    const rows = movementsFromReportRow({ TRANSACTION_ID: 'mp-2', SETTLEMENT_DATE: '2026-09-18T10:00:00-03:00', NET_CREDIT_AMOUNT: '900.00', GROSS_AMOUNT: '1000.00', MP_FEE_AMOUNT: '100.00', TRANSACTION_TYPE: 'payment' })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ external_id: 'mp-2', amount: 1000 })
    expect(rows[1]).toMatchObject({ external_id: 'mp-2:fee', amount: -100, suggested_classification: 'fee' })
    expect(pendingMovementPatch(rows[1], 'run-2', '2026-09-18T14:00:00Z')).toMatchObject({ amount: -100, fee_amount: -100, last_seen_run_id: 'run-2', raw_data: { ERP_COMPONENT: 'fee' } })
  })

  it('uses rich Mercado Pago descriptions without discarding the source row', () => {
    expect(mpMovementDescription({ PAYER_NAME: 'Ana Pérez', SALE_DETAIL: 'Coloración' }, 'received_payment', 'mp-3')).toBe('Ana Pérez')
    expect(mpMovementDescription({ SALE_DETAIL: 'Coloración', DESCRIPTION: 'Pago' }, 'received_payment', 'mp-3')).toBe('Coloración')
    expect(mpMovementDescription({ EXTERNAL_REFERENCE: 'turno-42' }, 'received_payment', 'mp-3')).toBe('turno-42')
    expect(mpMovementDescription({}, 'withholding', 'mp-3')).toBe('Retención Mercado Pago · MP mp-3')
    expect(movementFromReportRow({
      SOURCE_ID: 'mp-3',
      TRANSACTION_DATE: '2026-09-18T10:00:00-03:00',
      TRANSACTION_TYPE: 'PAYMENT',
      TRANSACTION_AMOUNT: '500',
      PAYER_NAME: 'Ana Pérez',
      PAYER_ID_TYPE: 'DNI',
      PAYER_ID_NUMBER: '12345678',
    })).toMatchObject({ description: 'Ana Pérez', raw_data: { PAYER_ID_NUMBER: '12345678' } })
  })

  it('auto-posts only deterministic Mercado Pago classifications', () => {
    expect(mpPostingPolicy('received_payment')).toMatchObject({ autoPost: true, transactionType: 'income', paymentDirection: 'entrada' })
    for (const classification of ['fee', 'tax', 'withholding', 'refund', 'chargeback'] as const) {
      expect(mpPostingPolicy(classification)).toMatchObject({ autoPost: true, transactionType: 'expense', paymentDirection: 'salida' })
    }
    expect(mpPostingPolicy('withdrawal').autoPost).toBe(false)
    expect(mpPostingPolicy('unknown').autoPost).toBe(false)
  })

  it('defines an idempotent independent Mercado Pago posting boundary', () => {
    expect(mpAutoPostingMigrationSql).toContain('CREATE OR REPLACE FUNCTION post_mp_movement')
    expect(mpAutoPostingMigrationSql).toContain('FOR UPDATE')
    expect(mpAutoPostingMigrationSql).toContain('WHERE movement_id = p_movement_id')
    expect(mpAutoPostingMigrationSql).toContain("IF FOUND THEN RETURN v_transaction_id")
    expect(mpAutoPostingMigrationSql).toContain("IF NOT FOUND THEN RETURN NULL")
    expect(mpAutoPostingMigrationSql).toContain("'Cobros Mercado Pago'")
    expect(mpAutoPostingMigrationSql).toContain('no puede vincularse a una transacción manual')
    expect(mpAutoPostingMigrationSql).not.toContain('UPDATE mp_movements SET status = \'pending\'')
    expect(mpEdgeSource).toContain("adminClient.rpc('post_mp_movement'")
  })

  it('creates a parseable attached CMS/PKCS#7 payload for WSAA', async () => {
    const keys = forge.pki.rsa.generateKeyPair(512)
    const certificate = forge.pki.createCertificate()
    certificate.publicKey = keys.publicKey
    certificate.serialNumber = '01'
    certificate.validity.notBefore = new Date(Date.now() - 60_000)
    certificate.validity.notAfter = new Date(Date.now() + 60_000)
    const attributes = [{ name: 'commonName', value: 'ERP ARCA test' }]
    certificate.setSubject(attributes)
    certificate.setIssuer(attributes)
    certificate.sign(keys.privateKey, forge.md.sha256.create())
    const signer = new ForgeCmsSigner(forge.pki.certificateToPem(certificate), forge.pki.privateKeyToPem(keys.privateKey))
    const cms = await signer.sign('<loginTicketRequest><service>wsfe</service></loginTicketRequest>')
    const parsed = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(cms))) as unknown as { type: string; certificates: unknown[] }
    expect(parsed.type).toBe(forge.pki.oids.signedData)
    expect(parsed.certificates).toHaveLength(1)
  })

  it('locks down profile roles, fiscal writes, leases, and reconciled ledgers in SQL', () => {
    expect(migrationSql).toContain('CREATE TRIGGER profiles_protect_role')
    expect(migrationSql).toContain("NEW.role IS DISTINCT FROM OLD.role")
    expect(migrationSql).toContain("v_doc.status NOT IN ('draft', 'rejected')")
    expect(migrationSql).toContain('lease_owner IS DISTINCT FROM p_worker')
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION begin_fiscal_issue')
    expect(migrationSql).toContain("p_tax_id || ':' || v_doc.point_of_sale")
    expect(migrationSql).toContain('REVOKE ALL ON fiscal_customers, fiscal_documents')
    expect(migrationSql).toContain("THEN 'conciliación de Mercado Pago'")
    expect(mpAutoPostingMigrationSql).toContain('DROP FUNCTION IF EXISTS configure_mp_daily_sync')
    expect(mpAutoPostingMigrationSql).toContain("'erp-mp-daily-sync', 'erp-mp-poll-sync'")
    expect(migrationSql).toContain('record_fiscal_attempt_number')
    expect(migrationSql).toContain('record_fiscal_recovery_evidence')
    expect(migrationSql).toContain('recover_fiscal_document')
    expect(migrationSql).toContain("tc.transaction_type = 'income'")
    expect(migrationSql).toContain('debe facturarse junto con todos los miembros de su grupo')
    expect(migrationSql).toContain('CREATE UNIQUE INDEX fiscal_transaction_authorized_once')
    expect(migrationSql).not.toContain('GRANT SELECT, INSERT, UPDATE ON fiscal_documents')
    expect(arcaEdgeSource).toContain("adminClient.rpc('finalize_fiscal_document'")
    expect(arcaEdgeSource).toContain("input.action === 'recover'")
    expect(arcaEdgeSource).not.toContain("from('fiscal_documents').update")
    expect(mpEdgeSource).not.toContain("action === 'run'")
    expect(mpEdgeSource).toContain("await ensureReportConfiguration(token)")
    expect(mpEdgeSource).toContain("`/task/${encodeURIComponent(taskId)}`")
    expect(mpEdgeSource).toContain("await mpFetch('/list'")
    expect(mpEdgeSource).toContain("`/search?id=${encodeURIComponent(reportId)}`")
    expect(mpEdgeSource).toContain("created_from: 'manual'")
    expect(mpEdgeSource).not.toContain('settlementFileNameFromReportWindow')
    expect(mpEdgeSource).toContain('searchDiagnostics = settlementReportSearchDiagnostics(searchProvider)')
    expect(mpEdgeSource).toContain(".eq('status', 'pending')")
  })

  it('pins one exact node-forge version for tests and Deno', () => {
    expect(JSON.parse(packageJson).dependencies['node-forge']).toBe('1.4.0')
    expect(JSON.parse(denoConfig).imports['node-forge']).toBe('npm:node-forge@1.4.0')
  })
})
