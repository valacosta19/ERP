# Runbook — Cuadrar el inventario

Guía operativa paso a paso. Tenés **115 productos activos**.

> **Regla de oro:** contá y aplicá el mismo día, sin vender en el medio. El recuento es una
> foto de un momento. Si contás el lunes y aplicás el miércoles habiendo vendido, los
> números quedan mal y hay que contar de nuevo.

---

> **Antes de todo:** si hay pedidos de compra sin cargar cuyos productos ya se vendieron, hay
> que recibirlos y correr `068_backfill_pending_sales_cost.sql` **antes** de contar. FIFO no
> filtra por fecha y el recuento pone todos los lotes en cero: si el backfill corre después,
> las ventas viejas se comen el lote del recuento y descuentan las mismas unidades dos veces.

---

## Paso 0 — Cerrar el agujero de seguridad

Correr en el SQL editor de Supabase:

```
supabase/migrations/067_secure_recount_preview.sql
```

Verificar que quedó cerrado (esto debe devolver un error de autenticación, **no** datos):

```bash
curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/preview_inventory_recount" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"p_lines":[]}'
```

---

## Paso 1 — Anotar la línea base (no te saltees esto)

Es la única forma de comprobar después que el pasado no se movió. Guardá capturas o
copiá los números a un papel:

1. `/reportes` → **Utilidad** → totales de **dos meses cerrados** (ej. mayo y junio).
2. `/reportes` → **Financiero** → totales de esos mismos dos meses.
3. `/reportes` → **Valoración** → valor total de inventario de hoy.

Y el estado actual de la base, para comparar después del dry-run:

```sql
SELECT
  (SELECT COUNT(*) FROM inventory_movements) AS movimientos,
  (SELECT COUNT(*) FROM inventory_lots)      AS lotes,
  (SELECT COUNT(*) FROM inventory_recounts)  AS recuentos,
  (SELECT COUNT(*) FROM transactions)        AS transacciones;
```

---

## Paso 2 — Descargar la planilla

`/inventory` → botón **«Exportar planilla de conteo»**. Baja
`conteo-inventario-<fecha>.xlsx` con una fila por producto.

Antes de salir a contar, revisá la columna **Notas**: los productos que digan
*«Sin compras registradas»* no tienen costo sugerido y vas a tener que poner el
**Costo a usar** a mano.

---

## Paso 3 — Contar en el salón

### Las columnas, una por una

| # | Columna | Qué es | ¿La tocás? |
|---|---|---|---|
| 1 | **ID** | Identificador interno del producto | **No. Y no la borres.** |
| 2 | SKU | Código del producto | No |
| 3 | Producto | Nombre | No |
| 4 | Marca | Marca | No |
| 5 | Unidad | En qué viene (ml, gr, u…) | No — es referencia |
| 6 | Stock sistema | Lo que el sistema cree que tenés | No — es para comparar |
| 7 | **Conteo físico** | Lo que contaste de verdad | **SÍ. Es la única obligatoria.** |
| 8 | Costo última compra | Costo de tu última compra real | No — es referencia |
| 9 | **Costo a usar** | Con qué costo entra el lote nuevo | Solo si el sugerido está mal |
| 10 | Notas | Avisos | Opcional |

### Columna 7 — «Conteo físico»

| Situación | Qué poner |
|---|---|
| Conté y hay 8 | `8` |
| Conté y no hay nada | `0` |
| **No llegué a contarlo** | **dejar vacío** |

**Vacío y `0` NO son lo mismo.** Vacío = el producto no se toca, queda como está.
`0` = el stock se lleva a cero. Podés contar por partes: lo que dejes vacío queda
intacto y lo contás en otro recuento.

**Se cuentan unidades, no gramos ni mililitros.** Si tenés 3 botellas de shampoo de
500 ml, va `3`, no `1500`. La columna Unidad está solo para que sepas de qué producto
te habla.

**Envases abiertos:** admite decimales (hasta 3). Lo práctico es contar los cerrados
como enteros y el que está en uso como `0,5` si está más o menos por la mitad. Lo que
importa es elegir un criterio y repetirlo siempre, más que la precisión.

**Solo números o vacío.** No poner `ok`, `?`, `-` ni texto: esas filas se rechazan.

### Columna 9 — «Costo a usar»

Es el **costo de compra por unidad**, no el precio de venta. Viene pre-cargado con el
costo de tu última compra real (ya con el flete repartido adentro), así que en general
no la tocás.

Cuándo sí la tocás:
- La columna **Notas** dice *«Sin compras registradas»* → viene vacía y hay que
  completarla a mano. **Si ese producto lo contás con cantidad mayor a 0 y dejás el
  costo vacío, la fila se rechaza.** Si lo contás en `0`, no hace falta costo.
- El costo sugerido no refleja lo que pagás hoy → escribí el real.

Da igual si escribís `13529,90` o `13529.90`: entiende los dos formatos.

### Lo que no hay que hacer

- **No borrar ni mover la columna `ID`.** Es la que identifica cada producto. Sin ella
  la planilla no se puede subir.
- **No agregar filas de productos nuevos.** Si aparece algo que no está en el sistema,
  creá el producto primero en `/inventory` (el SKU se genera solo) y volvé a exportar.
- **No repetir un producto en dos filas.** Si aparece dos veces, la segunda se rechaza.
- Ordenar o filtrar en Excel es seguro: cada fila viaja con su `ID`.

Si un costo está mal, corregí **«Costo a usar»**. Lo que quede ahí es el costo con el
que va a entrar el lote nuevo.

---

## Paso 4 — Ensayo con 3 productos

No arranques con los 115. Hacé una copia de la planilla, dejá el **Conteo físico**
lleno en 3 productos y vacío en todo el resto.

1. `/inventory` → **«Recuento físico»** → subir esa copia.
2. Mirá la **vista previa**: sistema → contado → diferencia → impacto. Tiene que decir
   *3 contados* y *112 sin contar*.
3. **Antes de confirmar**, volvé a correr la consulta del Paso 1. Los cuatro números
   tienen que ser **idénticos**: el preview no escribe nada.
4. Confirmá la fecha de corte (por defecto hoy) y aplicá.

### Verificar el ensayo

```sql
-- 1. El recuento quedó registrado
SELECT id, cutoff_date, totals, created_at
FROM inventory_recounts ORDER BY created_at DESC LIMIT 1;

-- 2. Los movimientos: 'adjustment' en negativo, 'in' en positivo
SELECT movement_type, COUNT(*) AS filas, SUM(quantity) AS total_unidades
FROM inventory_movements
WHERE reference_type = 'inventory_recount'
  AND reference_id = (SELECT id FROM inventory_recounts ORDER BY created_at DESC LIMIT 1)
GROUP BY movement_type;

-- 3. El costo de los lotes viejos quedó INTACTO. Debe devolver 0 filas.
SELECT il.id, il.unit_cost AS costo_lote, im.unit_cost AS costo_registrado
FROM inventory_movements im
JOIN inventory_lots il ON il.id = im.lot_id
WHERE im.reference_type = 'inventory_recount'
  AND im.movement_type = 'adjustment'
  AND il.unit_cost <> im.unit_cost;

-- 4. NO se creó ninguna transacción. Debe dar 0.
SELECT COUNT(*) AS transacciones_creadas
FROM transactions
WHERE created_at >= (SELECT created_at FROM inventory_recounts ORDER BY created_at DESC LIMIT 1);
```

En `/inventory`, el stock de esos 3 productos debe ser exactamente lo que contaste, y
en `/reportes` → **Valoración** tiene que aparecer la fila del recuento en «Recuentos
físicos» con la merma.

> **Nota:** `apply_inventory_recount` y `preview_inventory_recount` **no se pueden
> correr desde el SQL editor** — exigen sesión de admin y ahí `auth.uid()` es nulo.
> Todo se hace desde la app; el SQL editor es solo para estas verificaciones de lectura.

---

## Paso 5 — El recuento completo

Ya con confianza en el mecanismo:

1. `/inventory` → **«Recuento físico»** → subir la planilla completa.
2. Revisar la vista previa **con calma**. Viene ordenada por impacto en valor, así que
   las diferencias más grandes están arriba. Si algo te sorprende mucho, es más probable
   que sea un error de tipeo en la planilla que una diferencia real: cancelá, corregí y
   volvé a subir.
3. Mirá el contador de **«Filas con error»** si aparece: esas filas quedaron afuera y el
   detalle está listado abajo.
4. Confirmar la fecha de corte y aplicar.
5. Anotá el resumen que queda en pantalla (valor antes, valor después, merma).

---

## Paso 6 — Comprobar que el pasado no se movió

Esto es lo que valida todo el enfoque:

1. `/reportes` → **Utilidad** → los dos meses cerrados del Paso 1 tienen que dar
   **exactamente igual**.
2. `/reportes` → **Financiero** → ídem.
3. `/reportes` → **Valoración** → **sí cambió**, y eso está bien: ahora es el valor real.

Cuadre del valor de inventario:

```sql
SELECT SUM(remaining_quantity * unit_cost) AS valor_inventario
FROM inventory_lots WHERE remaining_quantity > 0;
```

Si contaste todo, tiene que coincidir con la suma de (cantidad contada × costo) de tu
planilla.

Y que el historial siga vivo: entrá a crear una orden de compra de un producto con
ventas y verificá que la **sugerencia de reposición no sea 0**. Eso confirma que los
movimientos históricos sobrevivieron.

---

## Paso 7 — Cerrar

1. Agregar la fila de **fase 29** en `PROJECT_STATE.md`.
2. Commitear los cambios.
3. Marcar `OPS-002` como `done` en `docs/pending-tasks.json`.

---

## De acá en adelante

- **Conteo mensual**, aunque sea parcial, sobre los productos que más rotan. Es lo que
  evita volver a este punto.
- Mirá el aviso amarillo en `/inventory` cuando aparezca: son transacciones que debían
  descontar inventario y no lo hicieron. Cada una es una diferencia nueva.
- Las diferencias van a seguir apareciendo mientras `INV-001` esté abierto (**anular una
  transacción no devuelve el stock**). Ese es el arreglo de fondo que sigue.

---

## Si algo sale mal

- **«El período está cerrado»** → la fecha de corte cae en un mes bloqueado. Elegí una
  fecha de un mes abierto, o desbloqueá el mes en Settings.
- **«El producto no existe o está archivado»** → ese producto se archivó después de que
  exportaste la planilla. Volvé a exportar.
- **«falta el Costo a usar»** → hay una fila con cantidad mayor a 0 y el costo vacío.
- **Se cortó la conexión al aplicar** → volvé a subir la misma planilla y aplicá otra vez.
  Si la primera llegó a entrar, la operación es idempotente y no se duplica.
- **Aplicaste con números mal** → no hay botón de deshacer. Se corrige con **otro
  recuento** con los números correctos. Nada se perdió: los movimientos de ajuste quedan
  todos registrados y auditables.
