import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  arcaCredentials, arcaEndpoints, buildArcaQrPayload, buildLoginCmsEnvelope,
  buildLoginTicketRequest, buildWsfeAuthorizeEnvelope, buildWsfeConsultEnvelope,
  buildWsfeLastAuthorizedEnvelope, parseLastAuthorized, parseLoginTicketResponse,
  parseWsfeAuthorization, parseWsfeConsultation, type ArcaEnvironment,
} from '../_shared/arca.ts'
import { ForgeCmsSigner } from '../_shared/cms.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function postSoap(url: string, action: string, body: string, timeoutMs = 20_000) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: action }, body, signal: AbortSignal.timeout(timeoutMs) })
  const text = await response.text()
  if (!response.ok) throw new Error(`ARCA HTTP ${response.status}: ${text.slice(0, 400)}`)
  return text
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  const adminClient = createClient(url, serviceRole)
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'unauthorized' }, 401)
  const { data: profile, error: profileError } = await userClient.from('profiles').select('role').eq('id', user.id).single()
  if (profileError || profile?.role !== 'admin') return json({ error: 'forbidden' }, 403)

  const input = await req.json().catch(() => ({})) as { documentId?: string; action?: 'issue' | 'recover' }
  const documentId = input.documentId
  if (typeof documentId !== 'string') return json({ error: 'documentId_required' }, 400)
  const { data: document, error: documentError } = await adminClient.from('fiscal_documents').select('*').eq('id', documentId).single()
  if (documentError || !document) return json({ error: 'document_not_found' }, 404)
  const environment = document.environment as ArcaEnvironment
  const endpoint = arcaEndpoints(environment)
  let credentials: ReturnType<typeof arcaCredentials>
  try {
    credentials = arcaCredentials(environment, name => Deno.env.get(name))
  } catch (error) {
    return json({ error: 'not_configured', detail: error instanceof Error ? error.message.replace(/^not_configured:\s*/, '') : 'La configuración de ARCA está incompleta.' }, 503)
  }
  const { taxId, certificatePem, privateKeyPem } = credentials
  const authenticate = async () => {
    const signer = new ForgeCmsSigner(certificatePem, privateKeyPem)
    const ticketXml = buildLoginTicketRequest(Math.floor(Date.now() / 1000))
    const cms = await signer.sign(ticketXml)
    const loginResponse = await postSoap(endpoint.wsaa, 'loginCms', buildLoginCmsEnvelope(cms))
    const login = parseLoginTicketResponse(loginResponse)
    return { ...login, taxId }
  }

  if (input.action === 'recover') {
    if (!['queued', 'recovery_pending'].includes(document.status) || !document.receipt_number) return json({ error: 'not_recoverable' }, 409)
    try {
      if (document.status === 'queued') {
        const { error: staleError } = await adminClient.rpc('mark_stale_fiscal_recovery', { p_document_id: documentId, p_actor_id: user.id })
        if (staleError) return json({ error: 'still_processing', detail: staleError.message }, 409)
      }
      const auth = await authenticate()
      const consultation = await postSoap(endpoint.wsfe, 'http://ar.gov.afip.dif.FEV1/FECompConsultar', buildWsfeConsultEnvelope(auth, document.point_of_sale, document.receipt_type, document.receipt_number))
      const parsed = parseWsfeConsultation(consultation)
      if (!parsed.authorized || parsed.receiptNumber !== Number(document.receipt_number)) {
        return json({ status: 'recovery_pending', detail: 'ARCA todavía no confirmó este comprobante. No se reemitió.' }, 409)
      }
      const customer = document.customer_snapshot as { document_type: number; document_number: string }
      const expires = `${parsed.expires.slice(0, 4)}-${parsed.expires.slice(4, 6)}-${parsed.expires.slice(6, 8)}`
      const qr = buildArcaQrPayload({ date: document.issue_date, taxId, pointOfSale: document.point_of_sale, receiptType: document.receipt_type, receiptNumber: parsed.receiptNumber, total: Number(document.total), documentType: customer.document_type, documentNumber: customer.document_number, cae: parsed.cae })
      const { error: recoveryError } = await adminClient.rpc('recover_fiscal_document', { p_document_id: documentId, p_actor_id: user.id, p_receipt_number: parsed.receiptNumber, p_cae: parsed.cae, p_cae_expires_on: expires, p_qr_payload: qr })
      if (recoveryError) return json({ error: 'persistence_failed', detail: recoveryError.message }, 500)
      return json({ status: 'authorized', receiptNumber: parsed.receiptNumber, cae: parsed.cae })
    } catch (error) {
      return json({ error: 'arca_recovery_error', detail: error instanceof Error ? error.message : 'No se pudo consultar ARCA.' }, 502)
    }
  }

  const worker = crypto.randomUUID()
  const { data: authoritativeIssueDate, error: claimError } = await adminClient.rpc('begin_fiscal_issue', { p_document_id: documentId, p_tax_id: taxId, p_worker: worker, p_actor_id: user.id })
  if (claimError) return json({ error: 'claim_failed', detail: claimError.message }, 409)
  if (typeof authoritativeIssueDate !== 'string') return json({ error: 'claim_failed', detail: 'No se pudo fijar la fecha fiscal del comprobante.' }, 409)

  const finalize = async (status: 'draft' | 'authorized' | 'rejected' | 'recovery_pending', values: { receiptNumber?: number; cae?: string; expires?: string; qr?: string; error?: string } = {}) => {
    const { error } = await adminClient.rpc('finalize_fiscal_document', {
      p_document_id: documentId,
      p_worker: worker,
      p_status: status,
      p_receipt_number: values.receiptNumber ?? null,
      p_cae: values.cae ?? null,
      p_cae_expires_on: values.expires ?? null,
      p_qr_payload: values.qr ?? null,
      p_last_error: values.error ?? null,
    })
    if (error) throw new Error(`persistence_failed: ${error.message}`)
  }

  let authorizationAttempted = false
  let providerAuthorized = false
  let authorizedEvidence: { receiptNumber: number; cae: string; expires: string; qr: string } | null = null
  try {
    const auth = await authenticate()
    const lastXml = await postSoap(endpoint.wsfe, 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado', buildWsfeLastAuthorizedEnvelope(auth, document.point_of_sale, document.receipt_type))
    const receiptNumber = parseLastAuthorized(lastXml) + 1
    const { error: attemptError } = await adminClient.rpc('record_fiscal_attempt_number', { p_document_id: documentId, p_worker: worker, p_receipt_number: receiptNumber })
    if (attemptError) throw new Error(`persistence_failed: ${attemptError.message}`)
    const customer = document.customer_snapshot as { document_type: number; document_number: string; tax_condition_id: number }
    const invoice = { taxId, token: auth.token, sign: auth.sign, pointOfSale: document.point_of_sale, receiptType: document.receipt_type, receiptNumber, issueDate: authoritativeIssueDate, documentType: customer.document_type, documentNumber: customer.document_number, taxConditionId: customer.tax_condition_id, total: Number(document.total) }

    let parsed
    try {
      authorizationAttempted = true
      const response = await postSoap(endpoint.wsfe, 'http://ar.gov.afip.dif.FEV1/FECAESolicitar', buildWsfeAuthorizeEnvelope(invoice))
      parsed = parseWsfeAuthorization(response)
    } catch (error) {
      const consultation = await postSoap(endpoint.wsfe, 'http://ar.gov.afip.dif.FEV1/FECompConsultar', buildWsfeConsultEnvelope(auth, document.point_of_sale, document.receipt_type, receiptNumber))
      parsed = parseWsfeConsultation(consultation)
      if (!parsed.authorized) {
        await finalize('recovery_pending', { receiptNumber, error: error instanceof Error ? error.message : 'ARCA no confirmó la autorización.' })
        return json({ status: 'recovery_pending', detail: 'La emisión tuvo una respuesta incierta. Verificá el comprobante en ARCA antes de continuar.' }, 409)
      }
    }

    if (!parsed.authorized) {
      await finalize('rejected', { receiptNumber, error: parsed.message })
      return json({ status: 'rejected', detail: parsed.message }, 422)
    }
    providerAuthorized = true
    const expires = `${parsed.expires.slice(0, 4)}-${parsed.expires.slice(4, 6)}-${parsed.expires.slice(6, 8)}`
    const qrPayload = buildArcaQrPayload({ date: authoritativeIssueDate, taxId, pointOfSale: document.point_of_sale, receiptType: document.receipt_type, receiptNumber: parsed.receiptNumber, total: Number(document.total), documentType: customer.document_type, documentNumber: customer.document_number, cae: parsed.cae })
    authorizedEvidence = { receiptNumber: parsed.receiptNumber, cae: parsed.cae, expires, qr: qrPayload }
    await finalize('authorized', { receiptNumber: parsed.receiptNumber, cae: parsed.cae, expires, qr: qrPayload })
    return json({ status: 'authorized', receiptNumber: parsed.receiptNumber, cae: parsed.cae })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de emisión'
    if (providerAuthorized) {
      let recoveryRecorded = false
      if (authorizedEvidence) {
        const { error: recoveryError } = await adminClient.rpc('record_fiscal_recovery_evidence', {
          p_document_id: documentId,
          p_worker: worker,
          p_receipt_number: authorizedEvidence.receiptNumber,
          p_evidence: { cae: authorizedEvidence.cae, expires: authorizedEvidence.expires },
          p_last_error: message,
        })
        recoveryRecorded = !recoveryError
      }
      return json({ error: 'persistence_failed', recoveryRecorded, receiptNumber: authorizedEvidence?.receiptNumber, detail: 'ARCA respondió, pero no se pudo persistir la autorización. No reintentes: usá Recuperar para consultar el comprobante sin emitirlo otra vez.' }, 500)
    }
    const notConfigured = message.startsWith('not_configured:')
    try {
      await finalize(notConfigured || !authorizationAttempted ? 'draft' : 'recovery_pending', { error: message })
    } catch (persistError) {
      return json({ error: 'persistence_failed', detail: persistError instanceof Error ? persistError.message : 'No se pudo persistir el fallo.' }, 500)
    }
    return json({ error: notConfigured ? 'not_configured' : 'arca_error', detail: message }, notConfigured ? 503 : 502)
  }
})
