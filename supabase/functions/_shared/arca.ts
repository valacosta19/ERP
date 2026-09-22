export type ArcaEnvironment = 'homologation' | 'production'

const endpoints = {
  homologation: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
  production: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
} as const

export function arcaEndpoints(environment: ArcaEnvironment) {
  return endpoints[environment]
}

export function escapeXml(value: string | number) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function buildLoginTicketRequest(uniqueId: number, now = new Date()) {
  const generation = new Date(now.getTime() - 10 * 60_000).toISOString()
  const expiration = new Date(now.getTime() + 10 * 60_000).toISOString()
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${uniqueId}</uniqueId><generationTime>${generation}</generationTime><expirationTime>${expiration}</expirationTime></header><service>wsfe</service></loginTicketRequest>`
}

export function buildLoginCmsEnvelope(cmsBase64: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Body><wsaa:loginCms><wsaa:in0>${escapeXml(cmsBase64)}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`
}

function readXmlTag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i'))
  return match?.[1]?.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&') ?? null
}

export function parseLoginTicketResponse(xml: string) {
  const loginXml = readXmlTag(xml, 'loginCmsReturn') ?? xml
  const token = readXmlTag(loginXml, 'token')
  const sign = readXmlTag(loginXml, 'sign')
  const expirationTime = readXmlTag(loginXml, 'expirationTime')
  if (!token || !sign) throw new Error('ARCA devolvió una respuesta WSAA sin token o firma.')
  return { token, sign, expirationTime }
}

export interface WsfeInvoiceInput {
  taxId: string
  token: string
  sign: string
  pointOfSale: number
  receiptType: 11 | 13
  receiptNumber: number
  issueDate: string
  documentType: number
  documentNumber: string
  taxConditionId: number
  total: number
  associatedPointOfSale?: number
  associatedReceiptNumber?: number
}

export function buildWsfeAuthorizeEnvelope(input: WsfeInvoiceInput) {
  const date = input.issueDate.replaceAll('-', '')
  const docNumber = input.documentNumber.replace(/\D/g, '') || '0'
  const associated = input.receiptType === 13 && input.associatedReceiptNumber
    ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>11</ar:Tipo><ar:PtoVta>${input.associatedPointOfSale}</ar:PtoVta><ar:Nro>${input.associatedReceiptNumber}</ar:Nro><ar:Cuit>${escapeXml(input.taxId)}</ar:Cuit><ar:CbteFch>${date}</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Body><ar:FECAESolicitar><ar:Auth><ar:Token>${escapeXml(input.token)}</ar:Token><ar:Sign>${escapeXml(input.sign)}</ar:Sign><ar:Cuit>${escapeXml(input.taxId)}</ar:Cuit></ar:Auth><ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${input.pointOfSale}</ar:PtoVta><ar:CbteTipo>${input.receiptType}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest><ar:Concepto>2</ar:Concepto><ar:DocTipo>${input.documentType}</ar:DocTipo><ar:DocNro>${docNumber}</ar:DocNro><ar:CbteDesde>${input.receiptNumber}</ar:CbteDesde><ar:CbteHasta>${input.receiptNumber}</ar:CbteHasta><ar:CbteFch>${date}</ar:CbteFch><ar:ImpTotal>${input.total.toFixed(2)}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>${input.total.toFixed(2)}</ar:ImpNeto><ar:ImpOpEx>0.00</ar:ImpOpEx><ar:ImpIVA>0.00</ar:ImpIVA><ar:ImpTrib>0.00</ar:ImpTrib><ar:FchServDesde>${date}</ar:FchServDesde><ar:FchServHasta>${date}</ar:FchServHasta><ar:FchVtoPago>${date}</ar:FchVtoPago><ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>${input.taxConditionId}</ar:CondicionIVAReceptorId>${associated}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq></ar:FECAESolicitar></soap:Body></soap:Envelope>`
}

export function buildWsfeLastAuthorizedEnvelope(auth: { token: string; sign: string; taxId: string }, pointOfSale: number, receiptType: number) {
  return `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Body><ar:FECompUltimoAutorizado><ar:Auth><ar:Token>${escapeXml(auth.token)}</ar:Token><ar:Sign>${escapeXml(auth.sign)}</ar:Sign><ar:Cuit>${escapeXml(auth.taxId)}</ar:Cuit></ar:Auth><ar:PtoVta>${pointOfSale}</ar:PtoVta><ar:CbteTipo>${receiptType}</ar:CbteTipo></ar:FECompUltimoAutorizado></soap:Body></soap:Envelope>`
}

export function buildWsfeConsultEnvelope(auth: { token: string; sign: string; taxId: string }, pointOfSale: number, receiptType: number, receiptNumber: number) {
  return `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Body><ar:FECompConsultar><ar:Auth><ar:Token>${escapeXml(auth.token)}</ar:Token><ar:Sign>${escapeXml(auth.sign)}</ar:Sign><ar:Cuit>${escapeXml(auth.taxId)}</ar:Cuit></ar:Auth><ar:FeCompConsReq><ar:CbteTipo>${receiptType}</ar:CbteTipo><ar:CbteNro>${receiptNumber}</ar:CbteNro><ar:PtoVta>${pointOfSale}</ar:PtoVta></ar:FeCompConsReq></ar:FECompConsultar></soap:Body></soap:Envelope>`
}

export function parseLastAuthorized(xml: string) {
  const value = Number(readXmlTag(xml, 'CbteNro'))
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('ARCA no devolvió el último comprobante autorizado.')
  return value
}

export function parseWsfeAuthorization(xml: string) {
  const result = readXmlTag(xml, 'Resultado')
  const cae = readXmlTag(xml, 'CAE')
  const expires = readXmlTag(xml, 'CAEFchVto')
  const receiptNumber = Number(readXmlTag(xml, 'CbteDesde') ?? readXmlTag(xml, 'CbteNro'))
  const message = readXmlTag(xml, 'Msg') ?? readXmlTag(xml, 'Err') ?? 'ARCA rechazó el comprobante.'
  if (result === 'A' && cae && expires && Number.isSafeInteger(receiptNumber)) {
    return { authorized: true as const, cae, expires, receiptNumber }
  }
  return { authorized: false as const, message }
}

/** FECompConsultar uses CodAutorizacion/FchVto, not the FECAESolicitar CAE tags. */
export function parseWsfeConsultation(xml: string) {
  const result = readXmlTag(xml, 'Resultado')
  const authorizationCode = readXmlTag(xml, 'CodAutorizacion')
  const expires = readXmlTag(xml, 'FchVto')
  const receiptNumber = Number(readXmlTag(xml, 'CbteDesde') ?? readXmlTag(xml, 'CbteNro'))
  if (result === 'A' && authorizationCode && expires && Number.isSafeInteger(receiptNumber)) {
    return { authorized: true as const, cae: authorizationCode, expires, receiptNumber }
  }
  return { authorized: false as const, message: readXmlTag(xml, 'Msg') ?? 'ARCA no confirmó el comprobante consultado.' }
}

export function buildArcaQrPayload(input: { date: string; taxId: string; pointOfSale: number; receiptType: number; receiptNumber: number; total: number; documentType: number; documentNumber: string; cae: string }) {
  const payload = {
    ver: 1,
    fecha: input.date,
    cuit: Number(input.taxId),
    ptoVta: input.pointOfSale,
    tipoCmp: input.receiptType,
    nroCmp: input.receiptNumber,
    importe: Number(input.total.toFixed(2)),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: input.documentType,
    nroDocRec: Number(input.documentNumber.replace(/\D/g, '') || 0),
    tipoCodAut: 'E',
    codAut: Number(input.cae),
  }
  return `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(payload))}`
}
