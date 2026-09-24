import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  arcaPublicErrorDetail,
  arcaEndpoints,
  arcaProductionPreflightCredentials,
  buildLoginCmsEnvelope,
  buildLoginTicketRequest,
  buildWsfeDummyEnvelope,
  buildWsfeLastAuthorizedEnvelope,
  buildWsfePointsOfSaleEnvelope,
  buildWsfeReceiptTypesEnvelope,
  isCaeEmissionType,
  parseLastAuthorized,
  parseLoginTicketResponse,
  parseWsfeDummy,
  parseWsfePointsOfSale,
  parseWsfeReceiptTypes,
  sanitizeArcaPublicDetail,
} from '../_shared/arca.ts'
import { ForgeCmsSigner } from '../_shared/cms.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
})

type PreflightStage = 'configuration' | 'wsaa' | 'wsfe' | 'point_of_sale' | 'receipt_type' | 'last_authorized'

function sanitizedDetail(error: unknown) {
  const message = error instanceof Error ? error.message : 'La validación contra ARCA no pudo completarse.'
  return sanitizeArcaPublicDetail(message.replace(/^not_configured:\s*/i, ''))
}

async function postSoap(url: string, action: string, body: string, timeoutMs = 20_000) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: action },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const responseText = await response.text()
  if (!response.ok) {
    const publicDetail = arcaPublicErrorDetail(responseText)
    throw new Error(`ARCA respondió HTTP ${response.status}.${publicDetail ? ` ${publicDetail}` : ''}`)
  }
  return responseText
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !anonKey) return json({ error: 'server_not_configured' }, 503)

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'unauthorized' }, 401)

  const { data: profile, error: profileError } = await userClient.from('profiles').select('role').eq('id', user.id).single()
  if (profileError || profile?.role !== 'admin') return json({ error: 'forbidden' }, 403)

  const input = await req.json().catch(() => ({})) as { pointOfSale?: unknown; receiptType?: unknown }
  if (typeof input.pointOfSale !== 'number' || !Number.isSafeInteger(input.pointOfSale) || input.pointOfSale <= 0 || input.pointOfSale > 99_999) {
    return json({ error: 'invalid_point_of_sale' }, 400)
  }
  if (input.receiptType !== 11) return json({ error: 'invalid_receipt_type', detail: 'El preflight solo admite Factura C (tipo 11).' }, 400)

  const pointOfSale = input.pointOfSale
  const receiptType = input.receiptType
  const endpoint = arcaEndpoints('production')
  let stage: PreflightStage = 'configuration'

  try {
    const credentials = arcaProductionPreflightCredentials(name => Deno.env.get(name))
    if (!/^\d{11}$/.test(credentials.taxId)) throw new Error('ARCA_PRODUCTION_CUIT debe contener exactamente 11 dígitos.')

    stage = 'wsaa'
    const signer = new ForgeCmsSigner(credentials.certificatePem, credentials.privateKeyPem)
    const ticketXml = buildLoginTicketRequest(Math.floor(Date.now() / 1000))
    const cms = await signer.sign(ticketXml)
    const loginXml = await postSoap(endpoint.wsaa, 'loginCms', buildLoginCmsEnvelope(cms))
    const login = parseLoginTicketResponse(loginXml)
    const auth = { token: login.token, sign: login.sign, taxId: credentials.taxId }

    stage = 'wsfe'
    const dummyXml = await postSoap(endpoint.wsfe, 'http://ar.gov.afip.dif.FEV1/FEDummy', buildWsfeDummyEnvelope())
    const services = parseWsfeDummy(dummyXml)

    stage = 'point_of_sale'
    const pointsXml = await postSoap(endpoint.wsfe, 'http://ar.gov.afip.dif.FEV1/FEParamGetPtosVenta', buildWsfePointsOfSaleEnvelope(auth))
    const selectedPoint = parseWsfePointsOfSale(pointsXml).find(point => point.number === pointOfSale)
    if (!selectedPoint) throw new Error(`El punto de venta ${pointOfSale} no fue informado por WSFE.`)
    if (selectedPoint.blocked) throw new Error(`El punto de venta ${pointOfSale} está bloqueado en WSFE.`)
    if (selectedPoint.disabledOn) throw new Error(`El punto de venta ${pointOfSale} está dado de baja en WSFE.`)
    if (!isCaeEmissionType(selectedPoint.emissionType)) {
      throw new Error(`El punto de venta ${pointOfSale} no usa modalidad CAE.`)
    }

    stage = 'receipt_type'
    const receiptTypesXml = await postSoap(endpoint.wsfe, 'http://ar.gov.afip.dif.FEV1/FEParamGetTiposCbte', buildWsfeReceiptTypesEnvelope(auth))
    const selectedReceiptType = parseWsfeReceiptTypes(receiptTypesXml).find(type => type.id === receiptType)
    if (!selectedReceiptType) throw new Error('Factura C (tipo 11) no está habilitada para esta CUIT.')
    const today = new Date().toISOString().slice(0, 10).replaceAll('-', '')
    if (selectedReceiptType.validFrom && selectedReceiptType.validFrom > today) throw new Error('Factura C todavía no está vigente en WSFE.')
    if (selectedReceiptType.validUntil && selectedReceiptType.validUntil < today) throw new Error('Factura C ya no está vigente en WSFE.')

    stage = 'last_authorized'
    const lastXml = await postSoap(
      endpoint.wsfe,
      'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
      buildWsfeLastAuthorizedEnvelope(auth, pointOfSale, receiptType),
    )
    const lastAuthorized = parseLastAuthorized(lastXml)

    return json({
      status: 'ready',
      environment: 'production',
      readOnly: true,
      credentials: { configured: true, cuit: `*******${credentials.taxId.slice(-4)}` },
      checks: {
        wsaa: { status: 'ok', ticketExpiresAt: login.expirationTime },
        wsfe: { status: 'ok', services },
        pointOfSale: {
          status: 'ok',
          number: selectedPoint.number,
          emissionType: selectedPoint.emissionType,
          blocked: selectedPoint.blocked,
        },
        receiptType: {
          status: 'ok',
          id: selectedReceiptType.id,
          description: selectedReceiptType.description,
          validFrom: selectedReceiptType.validFrom,
          validUntil: selectedReceiptType.validUntil,
        },
        lastAuthorized: { status: 'ok', number: lastAuthorized },
      },
    })
  } catch (error) {
    const configurationError = stage === 'configuration'
    return json({
      error: configurationError ? 'not_configured' : 'arca_preflight_failed',
      stage,
      detail: sanitizedDetail(error),
      environment: 'production',
      readOnly: true,
    }, configurationError ? 503 : 502)
  }
})
