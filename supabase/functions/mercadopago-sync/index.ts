import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  movementsFromReportRow,
  parseCsv,
  pendingMovementPatch,
  settlementFileNameFromReportSearch,
  settlementProviderShape,
  settlementReportConfiguration,
  settlementReportConfigurationNeedsUpdate,
  settlementReportIdFromTaskList,
  settlementReportSearchDiagnostics,
  settlementTaskId,
  settlementTaskListDiagnostics,
  settlementTaskLocator,
  settlementTaskResult,
} from '../_shared/mercadopago.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const apiBase = 'https://api.mercadopago.com/v1/account/settlement_report'

function buenosAiresWindow(days = 3) {
  const end = new Date()
  const start = new Date(end.getTime() - days * 86_400_000)
  return { begin_date: start.toISOString(), end_date: end.toISOString() }
}

class MercadoPagoHttpError extends Error {
  constructor(readonly status: number, method: string, path: string, body: string) {
    super(`Mercado Pago HTTP ${status} al ${method} ${path || '/'}: ${body.slice(0, 400) || 'respuesta vacía'}`)
  }
}

async function mpFetch(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${apiBase}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers } })
  const text = await response.text()
  if (!response.ok) throw new MercadoPagoHttpError(response.status, init?.method ?? 'GET', path, text)
  return { response, text }
}

function parseProviderJson(text: string, context: string) {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`Mercado Pago devolvió una respuesta inválida al ${context}.`)
  }
}

async function ensureReportConfiguration(token: string) {
  try {
    const { text } = await mpFetch('/config', token, { method: 'GET' })
    const configuration = parseProviderJson(text, 'consultar la configuración del reporte')
    if (settlementReportConfigurationNeedsUpdate(configuration)) {
      await mpFetch('/config', token, { method: 'PUT', body: JSON.stringify(settlementReportConfiguration()) })
    }
  } catch (error) {
    if (!(error instanceof MercadoPagoHttpError) || error.status !== 404) throw error
    await mpFetch('/config', token, { method: 'POST', body: JSON.stringify(settlementReportConfiguration()) })
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const authHeader = req.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const token = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
  if (!token) return json({ error: 'not_configured', detail: 'Configurá MERCADOPAGO_ACCESS_TOKEN como secret de la Edge Function.' }, 503)

  const userClient = createClient(supabaseUrl, anon, authHeader ? { global: { headers: { Authorization: authHeader } } } : {})
  const adminClient = createClient(supabaseUrl, serviceRole)
  if (!authHeader) return json({ error: 'unauthorized' }, 401)
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'unauthorized' }, 401)
  const { data: profile, error: profileError } = await userClient.from('profiles').select('role').eq('id', user.id).single()
  if (profileError || profile?.role !== 'admin') return json({ error: 'forbidden' }, 403)
  const userId = user.id

  const input = await req.json().catch(() => ({})) as { action?: string; runId?: string; days?: number }
  const action = input.action ?? 'start'
  let currentRunId = input.runId
  try {
    if (action === 'start') {
      const { data: existing, error: existingError } = await adminClient.from('mp_sync_runs').select('id, status').in('status', ['requested', 'processing']).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (existingError) throw existingError
      if (existing) return json({ status: existing.status, runId: existing.id }, 202)
      const window = buenosAiresWindow(Math.max(1, Math.min(input.days ?? 3, 31)))
      const { data: run, error } = await adminClient.from('mp_sync_runs').insert({ status: 'requested', date_from: window.begin_date, date_to: window.end_date, created_by: userId }).select('*').single()
      if (error) throw error
      currentRunId = run.id
      await ensureReportConfiguration(token)
      const { text } = await mpFetch('', token, { method: 'POST', body: JSON.stringify(window) })
      const provider = parseProviderJson(text, 'crear el reporte')
      const taskLocator = settlementTaskLocator(provider.id)
      const { error: updateError } = await adminClient.from('mp_sync_runs').update({ status: 'processing', report_file_name: taskLocator }).eq('id', run.id)
      if (updateError) throw updateError
      return json({ status: 'processing', runId: run.id, providerStatus: provider.status ?? 'pending' }, 202)
    }

    if (action !== 'poll' || !input.runId) return json({ error: 'invalid_action' }, 400)
    const { data: run, error: runError } = await adminClient.from('mp_sync_runs').select('*').eq('id', input.runId).single()
    if (runError) throw runError
    if (!run?.report_file_name) return json({ error: 'run_not_ready' }, 409)
    let fileName = run.report_file_name
    const taskId = settlementTaskId(fileName)
    if (taskId) {
      const { text: taskText } = await mpFetch(`/task/${encodeURIComponent(taskId)}`, token, { method: 'GET' })
      const taskProvider = parseProviderJson(taskText, 'consultar la tarea del reporte')
      const taskShape = settlementProviderShape(taskProvider)
      const task = settlementTaskResult(taskProvider)
      if (task.state === 'processing') return json({ status: 'processing', providerStatus: task.status, runId: run.id }, 202)
      fileName = task.fileName ?? ''
      let reportId = task.reportId
      let listChecked = false
      let searchChecked = false
      let listDiagnostics: { resultCount: number; matchedTask: boolean } | null = null
      let searchDiagnostics: ReturnType<typeof settlementReportSearchDiagnostics> | null = null
      if (!fileName && !reportId) {
        listChecked = true
        const { text: listText } = await mpFetch('/list', token, { method: 'GET' })
        const listProvider = parseProviderJson(listText, 'consultar la lista de reportes')
        listDiagnostics = settlementTaskListDiagnostics(listProvider, taskId)
        reportId = settlementReportIdFromTaskList(listProvider, taskId)
      }
      if (!fileName && reportId) {
        searchChecked = true
        const { text: searchText } = await mpFetch(`/search?id=${encodeURIComponent(reportId)}`, token, { method: 'GET' })
        const searchProvider = parseProviderJson(searchText, 'buscar el reporte generado')
        searchDiagnostics = settlementReportSearchDiagnostics(searchProvider)
        fileName = settlementFileNameFromReportSearch(searchProvider, reportId) ?? ''
      }
      if (!fileName && !reportId) {
        searchChecked = true
        const searchParams = new URLSearchParams({
          created_from: 'manual',
          limit: '30',
        })
        const { text: searchText } = await mpFetch(`/search?${searchParams.toString()}`, token, { method: 'GET' })
        const searchProvider = parseProviderJson(searchText, 'inspeccionar reportes manuales')
        searchDiagnostics = settlementReportSearchDiagnostics(searchProvider)
      }
      if (!fileName) {
        return json({
          status: 'processing',
          providerStatus: task.status,
          runId: run.id,
          resolution: {
            taskId,
            taskReportId: task.reportId,
            resolvedReportId: reportId,
            listChecked,
            searchChecked,
            taskTopLevelFields: taskShape.topLevelFields,
            taskNestedObjectFields: taskShape.nestedObjectFields,
            listResultCount: listDiagnostics?.resultCount ?? null,
            listMatchedTask: listDiagnostics?.matchedTask ?? null,
            searchResultCount: searchDiagnostics?.resultCount ?? null,
            searchCandidates: searchDiagnostics?.candidates ?? [],
          },
        }, 202)
      }
      const { error: fileNameError } = await adminClient.from('mp_sync_runs').update({ report_file_name: fileName }).eq('id', run.id)
      if (fileNameError) throw fileNameError
    }
    const { response, text } = await mpFetch(`/${encodeURIComponent(fileName)}`, token, { method: 'GET' })
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const provider = parseProviderJson(text, 'descargar el reporte')
      throw new Error(`Mercado Pago respondió JSON al descargar ${fileName}: ${String(provider.message ?? provider.error ?? provider.status ?? 'sin detalle')}.`)
    }
    const rows = parseCsv(text)
    const movements = rows.flatMap(movementsFromReportRow)
    for (const movement of movements) {
      const { data: inserted, error: insertError } = await adminClient.from('mp_movements').insert({ ...movement, first_seen_run_id: run.id, last_seen_run_id: run.id }).select('id').single()
      if (insertError?.code === '23505') {
        const { error: updateError } = await adminClient.from('mp_movements').update(pendingMovementPatch(movement, run.id, new Date().toISOString())).eq('source_type', 'settlement_report').eq('external_id', movement.external_id).eq('status', 'pending')
        if (updateError) throw updateError
      } else if (insertError) throw insertError
      else if (!inserted?.id) throw new Error('No se pudo registrar el movimiento de Mercado Pago.')
    }
    const { error: completionError } = await adminClient.from('mp_sync_runs').update({ status: 'completed', imported_count: movements.length, completed_at: new Date().toISOString() }).eq('id', run.id)
    if (completionError) throw completionError
    return json({ status: 'completed', runId: run.id, imported: movements.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de sincronización'
    if (currentRunId) {
      const { error: persistError } = await adminClient.from('mp_sync_runs').update({ status: 'failed', error_code: 'provider_error', error_message: message.slice(0, 500), completed_at: new Date().toISOString() }).eq('id', currentRunId)
      if (persistError) return json({ error: 'persistence_failed', detail: `${message}; ${persistError.message}` }, 500)
    }
    return json({ error: 'mercadopago_error', detail: message }, 502)
  }
})
