import forge from 'node-forge'

export interface CmsSigner {
  sign(loginTicketXml: string): Promise<string>
}

/** Creates the attached CMS/PKCS#7 payload required by WSAA LoginCms. */
export class ForgeCmsSigner implements CmsSigner {
  private readonly certificatePem: string
  private readonly privateKeyPem: string

  constructor(certificatePem: string, privateKeyPem: string) {
    this.certificatePem = certificatePem
    this.privateKeyPem = privateKeyPem
  }

  async sign(loginTicketXml: string): Promise<string> {
    if (!this.certificatePem.includes('BEGIN CERTIFICATE') || !this.privateKeyPem.includes('BEGIN')) {
      throw new Error('not_configured: ARCA_CERT_PEM o ARCA_PRIVATE_KEY_PEM no tienen formato PEM válido.')
    }
    try {
      const certificate = forge.pki.certificateFromPem(this.certificatePem)
      const privateKey = forge.pki.privateKeyFromPem(this.privateKeyPem)
      const signed = forge.pkcs7.createSignedData()
      signed.content = forge.util.createBuffer(loginTicketXml, 'utf8')
      signed.addCertificate(certificate)
      signed.addSigner({
        key: privateKey,
        certificate,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
          { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
          { type: forge.pki.oids.messageDigest },
          { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
        ],
      })
      signed.sign({ detached: false })
      return forge.util.encode64(forge.asn1.toDer(signed.toAsn1()).getBytes())
    } catch (error) {
      throw new Error(`cms_sign_failed: ${error instanceof Error ? error.message : 'No se pudo firmar el LoginTicketRequest.'}`)
    }
  }
}
