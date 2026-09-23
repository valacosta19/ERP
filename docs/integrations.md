# Integraciones ARCA y Mercado Pago

Las dos integraciones son **server-side**. El navegador usa la sesión de Supabase para invocar Edge Functions, pero nunca recibe certificados, claves privadas, CUIT ni Access Tokens.

## Aplicación de la base

Las migraciones `102` a `106` ya están aplicadas en el proyecto remoto. Para preparar otro ambiente, aplicarlas estrictamente en este orden:

1. `supabase/migrations/102_arca_mercadopago_integrations.sql`
2. `supabase/migrations/103_mercadopago_auto_posting.sql`
3. `supabase/migrations/104_fiscal_issue_date.sql`
4. `supabase/migrations/105_mp_manual_approval_only.sql`
5. `supabase/migrations/106_mp_sales_registration.sql`

La `104` agrega la fecha fiscal validada y el claim seguro para emitir; la `105` desactiva la publicación automática histórica de Mercado Pago; y la `106` incorpora la aprobación de ventas agrupadas. Desplegar `arca-issue` después de aplicar la `104`, y `mercadopago-sync` después de aplicar la `105` y la `106`. La pantalla requiere rol `admin`.

## ARCA — homologación

1. Crear en ARCA un punto de venta exclusivo para Web Services y relacionar el certificado con `wsfe`.
2. Configurar los secrets dedicados de homologación, sin prefijo `VITE_`:

   ```bash
   supabase secrets set \
     ARCA_HOMOLOGATION_CUIT=... \
     ARCA_HOMOLOGATION_CERT_PEM=... \
     ARCA_HOMOLOGATION_PRIVATE_KEY_PEM=...
   ```

3. Desplegar `arca-issue` y comenzar siempre con ambiente **Homologación**.

Los nombres anteriores `ARCA_CUIT`, `ARCA_CERT_PEM` y `ARCA_PRIVATE_KEY_PEM` siguen funcionando exclusivamente como fallback de homologación. No los reemplaces con credenciales productivas.

La función implementa contratos WSAA/WSFEv1, firma CMS/PKCS#7 adjunta con `node-forge`, numeración consultada con `FECompUltimoAutorizado`, autorización con `FECAESolicitar` y recuperación de timeout con `FECompConsultar`. El número se persiste **antes** de enviar; si falla el guardado final se retiene evidencia y la acción “Recuperar sin reemitir” consulta ese número. La recuperación lee `CodAutorizacion` y `FchVto`; nunca llama nuevamente a `FECAESolicitar`. **Nunca genera un CAE falso.** Antes de producción hay que verificar certificado, reloj, punto de venta y todos los escenarios en homologación.

Una factura autorizada no se puede editar ni borrar. La base ya modela Nota de Crédito C (`receipt_type = 13` y `associated_document_id`), pero la UI del primer slice bloquea la anulación y no emite notas de crédito todavía.

## ARCA — habilitación segura de producción

Producción usa un conjunto de credenciales separado y permanece bloqueada en el servidor hasta habilitarla explícitamente. **Nunca reutiliza ni toma como fallback las credenciales de homologación.**

### Orden de activación

1. En ARCA, crear un punto de venta productivo exclusivo para Web Services.
2. Generar la clave privada y el CSR productivos. Crear el certificado mediante **Administración de Certificados Digitales**; WSASS emite certificados de homologación y no sirve para producción.
3. Asociar el certificado productivo al servicio `wsfe` y a la CUIT emisora.
4. Mantener `ARCA_PRODUCTION_ENABLED` ausente o distinto de `true` y cargar primero el conjunto productivo:

   ```bash
   supabase secrets set \
     ARCA_PRODUCTION_CUIT=... \
     ARCA_PRODUCTION_CERT_PEM=... \
     ARCA_PRODUCTION_PRIVATE_KEY_PEM=...
   ```

5. Verificar que las migraciones `104`, `105` y `106` estén aplicadas —en el proyecto remoto actual ya lo están— y desplegar la versión actual de `arca-issue`.
6. Volver a verificar una emisión y una recuperación en homologación. Confirmar además que el certificado y la clave productivos forman el mismo par y que la CUIT y el punto de venta pertenecen al ambiente productivo.
7. Habilitar producción como último paso:

   ```bash
   supabase secrets set ARCA_PRODUCTION_ENABLED=true
   ```

8. En el ERP, elegir **Producción**, ingresar el punto de venta productivo y marcar la confirmación explícita antes de preparar el borrador. Comenzar con un comprobante controlado y revisar CAE, fecha, importe y QR.

### Contrato de secrets

| Ambiente | Secrets requeridos | Habilitación |
| --- | --- | --- |
| Homologación | `ARCA_HOMOLOGATION_CUIT`, `ARCA_HOMOLOGATION_CERT_PEM`, `ARCA_HOMOLOGATION_PRIVATE_KEY_PEM` | Siempre disponible; admite los nombres legacy como fallback. |
| Producción | `ARCA_PRODUCTION_CUIT`, `ARCA_PRODUCTION_CERT_PEM`, `ARCA_PRODUCTION_PRIVATE_KEY_PEM` | Requiere además `ARCA_PRODUCTION_ENABLED=true`; no admite fallback. |

La bandera es la autoridad del servidor. La confirmación de la interfaz es una segunda barrera para evitar errores humanos, pero no habilita producción por sí sola. Si falta la bandera o cualquier secret productivo, tanto la emisión como la recuperación fallan antes de autenticarse contra ARCA y explican qué configuración falta.

## Mercado Pago — reporte de todas las transacciones

1. Configurar el token de la cuenta propia como secret:

   ```bash
   supabase secrets set MERCADOPAGO_ACCESS_TOKEN=...
   ```

2. Desplegar `mercadopago-sync`.
3. En la pestaña Mercado Pago, **Sincronizar ahora** crea el reporte asíncrono. Cuando el reporte esté listo, **Consultar reporte** lo descarga e importa.

En la primera sincronización, la función consulta la configuración de reportes de la cuenta. Si no existe, la crea; si faltan columnas o parámetros requeridos, la actualiza. Siempre mantiene `scheduled: false`: el flujo se inicia manualmente una vez por día y no usa cron. La solicitud guarda el identificador opaco de la tarea; cada consulta resuelve el archivo mediante la tarea y el buscador oficial antes de descargar el CSV.

La ventana manual incluye tres días de solapamiento. `source_type + external_id` hace la ingesta idempotente. Los movimientos determinísticos crean transacciones normales con categorías específicas y el método de pago Mercado Pago:

- cobro: crea un ingreso independiente;
- comisión, impuesto, retención, devolución o contracargo: crea un egreso independiente;
- retiro: permanece pendiente hasta elegir una cuenta de destino;
- desconocido: permanece pendiente hasta que un administrador lo clasifique.

La bandeja muestra únicamente excepciones pendientes. La importación no vincula movimientos con transacciones cargadas manualmente ni reescribe importaciones históricas; una fila histórica pendiente puede procesarse cuando reaparece en un reporte solapado.

La RPC rechaza importes inválidos, períodos cerrados, métodos/categorías inexistentes y movimientos ya conciliados.

## Verificación local

Las Edge Functions necesitan Deno/Supabase CLI para chequeo local y secrets ficticios para servirlas. No se debe invocar ARCA ni Mercado Pago desde tests. Los parsers y reglas puras se prueban sin red mediante Vitest.
