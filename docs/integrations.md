# Integraciones ARCA y Mercado Pago

Las dos integraciones son **server-side**. El navegador usa la sesión de Supabase para invocar Edge Functions, pero nunca recibe certificados, claves privadas, CUIT ni Access Tokens.

## Aplicación de la base

Aplicar `supabase/migrations/102_arca_mercadopago_integrations.sql` y luego `supabase/migrations/103_mercadopago_auto_posting.sql`. Las migraciones crean snapshots fiscales inmutables, la cola serializada de emisión, staging idempotente para Mercado Pago y las RPC atómicas de publicación. La pantalla queda en `/integrations` y requiere rol `admin`.

## ARCA — homologación

1. Crear en ARCA un punto de venta exclusivo para Web Services y relacionar el certificado con `wsfe`.
2. Configurar secrets del proyecto Supabase, sin prefijo `VITE_`:

   ```bash
   supabase secrets set ARCA_CUIT=... ARCA_CERT_PEM=... ARCA_PRIVATE_KEY_PEM=...
   ```

3. Desplegar `arca-issue` y comenzar siempre con ambiente **Homologación**.

La función implementa contratos WSAA/WSFEv1, firma CMS/PKCS#7 adjunta con `node-forge`, numeración consultada con `FECompUltimoAutorizado`, autorización con `FECAESolicitar` y recuperación de timeout con `FECompConsultar`. El número se persiste **antes** de enviar; si falla el guardado final se retiene evidencia y la acción “Recuperar sin reemitir” consulta ese número. La recuperación lee `CodAutorizacion` y `FchVto`; nunca llama nuevamente a `FECAESolicitar`. **Nunca genera un CAE falso.** Antes de producción hay que verificar certificado, reloj, punto de venta y todos los escenarios en homologación.

Una factura autorizada no se puede editar ni borrar. La base ya modela Nota de Crédito C (`receipt_type = 13` y `associated_document_id`), pero la UI del primer slice bloquea la anulación y no emite notas de crédito todavía.

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
