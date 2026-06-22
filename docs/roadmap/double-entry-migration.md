# Plan: Migración a Doble Registro Oculto (Opción C)

## Contexto y principio rector

El sistema está en producción con datos reales. La UX (pensada para no contadores) **no debe cambiar**. El formulario de transacciones, el quick funnel, y las cuentas a pagar/cobrar siguen igual.

Lo que cambia es la **capa de persistencia**: cada evento que hoy escribe en `transactions` / `inventory_lots` / `supplier_debts` / etc., también va a postear un **asiento contable balanceado** (Debe = Haber) en un nuevo libro mayor (`journal_entries` + `journal_lines`). El sistema sigue siendo simple de usar, pero por dentro es contablemente exacto.

Con el tiempo, los reportes (Financiero, Utilidad, Balance) leen del libro mayor en vez de las tablas operativas, y el Patrimonio deja de ser un número tapón.

---

## Plan de cuentas contable (Chart of Accounts)

Antes de cualquier migración hay que definir el catálogo de cuentas de doble entrada. Se crea una nueva tabla `gl_accounts` independiente de `transaction_categories` (que sigue existiendo para la UX).

### Tipos y estructura

```
gl_accounts
  id            uuid PK
  code          text UNIQUE      -- ej. "1.1.1", "4.1.2"
  name          text
  type          enum(asset, liability, equity, income, expense)
  normal_balance enum(debit, credit)
  parent_id     uuid → gl_accounts (para agrupamiento en reportes)
  system        boolean DEFAULT true   -- si es fijo, no editable desde UI
  active        boolean DEFAULT true
  created_at    timestamptz
```

### Plan de cuentas inicial propuesto

| Código | Nombre | Tipo | Saldo normal |
|--------|--------|------|--------------|
| **1 — Activo** | | | |
| 1.1 | Caja y bancos | asset | debit |
| 1.1.X | [un hijo por `payment_method`: Efectivo, MP, etc.] | asset | debit |
| 1.2 | Inventario | asset | debit |
| 1.3 | Cuentas a cobrar — clientes | asset | debit |
| 1.4 | Cuentas a cobrar — staff (retiros) | asset | debit |
| 1.5 | Anticipos a cobrar (señas entregadas) | asset | debit |
| 1.6 | Fondos reservados | asset | debit |
| **2 — Pasivo** | | | |
| 2.1 | Cuentas a pagar — proveedores | liability | credit |
| 2.2 | Anticipos de clientes (señas cobradas) | liability | credit |
| 2.3 | Comisiones a pagar (devengadas) | liability | credit |
| **3 — Patrimonio** | | | |
| 3.1 | Capital aportado | equity | credit |
| 3.2 | Resultados acumulados | equity | credit |
| 3.3 | Resultado del ejercicio (cierre) | equity | credit |
| **4 — Ingresos** | | | |
| 4.1.X | [un hijo por subcategoría de Ingresos] | income | credit |
| **5 — Costos** | | | |
| 5.1 | COGS — inventario vendido (FIFO) | expense | debit |
| 5.2.X | [un hijo por subcategoría de Costos] | expense | debit |
| **6 — Gastos** | | | |
| 6.1.X | [un hijo por subcategoría de Gastos] | expense | debit |
| **9 — Cuentas de orden / clearing** | | | |
| 9.1 | Ajuste de inventario | expense | debit |
| 9.2 | Movimientos internos clearing | asset | debit |

### Tablas de mapeo (sin cambiar la UX)

```sql
-- Cada payment_method → cuenta GL de caja/banco
payment_method_gl_accounts
  payment_method text PK
  gl_account_id  uuid → gl_accounts

-- Cada subcategoría → cuenta GL de ingreso/egreso
subcategory_gl_accounts
  subcategory_id uuid PK → transaction_categories
  gl_account_id  uuid → gl_accounts
```

La UI no muestra estas tablas a la usuaria. El admin (o la contadora) las configura una vez en Settings. Las subcategorías nuevas que se creen necesitan ser mapeadas antes de poder postear.

---

## Tablas del libro mayor

```sql
journal_entries
  id              uuid PK
  date            date NOT NULL
  description     text
  reference_type  text   -- 'transaction', 'purchase_order', 'supplier_debt_payment',
                         -- 'receivable_collection', 'staff_withdrawal', 'commission_payout',
                         -- 'reserve_movement', 'inventory_adjustment', 'void_reversal', 'manual'
  reference_id    uuid   -- FK al objeto de origen (nullable para entradas manuales)
  currency        text NOT NULL DEFAULT 'ARS'
  fx_rate_ars     numeric  -- tasa ARS al momento del posteo (para USD/EUR)
  posted_at       timestamptz DEFAULT now()
  posted_by       uuid → auth.users
  period_year     int
  period_month    int
  reversed_by     uuid → journal_entries  -- para anulaciones

journal_lines
  id          uuid PK
  entry_id    uuid → journal_entries CASCADE
  account_id  uuid → gl_accounts
  debit       numeric NOT NULL DEFAULT 0
  credit      numeric NOT NULL DEFAULT 0
  description text
  -- invariante: CHECK (debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0))
```

**Invariante de balance** (trigger o constraint): para cada `journal_entry`, `Σ debit = Σ credit`. Si no cuadra, la inserción falla.

**Period locking**: extender el trigger de `locked_periods` para bloquear también inserts en `journal_entries` con el mismo `(period_year, period_month)`.

---

## Reglas de posteo: evento → asiento

Para cada evento del sistema, el posting engine genera estas entradas. Todo sucede dentro de una RPC con `SECURITY DEFINER` para mantener atomicidad.

### 1. Transacción de ingreso (venta, servicio)

Por cada `transaction_payments` row:
```
Dr  1.1.X [cuenta del payment_method]    amount
    Cr  4.1.X [cuenta de la subcategoría]   amount
```
Si tiene `seña_amount > 0` (se consume un anticipo previo):
```
Dr  2.2 Anticipos de clientes             seña_amount
    Cr  4.1.X [subcategoría]               seña_amount
```
(el total creditado = amount + seña_amount = valor real del servicio)

### 2. Transacción de gasto

```
Dr  6.1.X o 5.2.X [subcategoría]        amount
    Cr  1.1.X [payment_method]            amount
```

### 3. FIFO — realización de COGS (`consume_inventory_fifo`)

Por cada lote consumido en `sale_items`:
```
Dr  5.1 COGS                             unit_cost × qty
    Cr  1.2 Inventario                   unit_cost × qty
```
Esto se postea en la misma RPC FIFO, en la misma transacción DB.

### 4. Recepción de orden de compra — pago inmediato

**Corrección de bug actual**: hoy el sistema carga el costo de compra como `expense` (Costos). Eso está mal cuando el producto lleva FIFO — el gasto se realiza al vender, no al comprar. La migración corrige esto:
```
Dr  1.2 Inventario                       total_amount (con shipping prorrateado)
    Cr  1.1.X [payment_method]            total_amount
```

### 5. Recepción de orden de compra — diferido (A/P)

```
Dr  1.2 Inventario                       total_amount
    Cr  2.1 Cuentas a pagar              total_amount
```

### 6. Pago de deuda a proveedor

**Gap actual**: hoy no se crea ninguna `transaction` de caja. El posting engine crea el asiento igualmente, derivado del `supplier_debt_payment`:
```
Dr  2.1 Cuentas a pagar                 amount
    Cr  1.1.X [payment_method]           amount
```

### 7. Anticipo cobrado de cliente (`is_seña = true`, description 'Anticipo')

```
Dr  1.1.X [payment_method]              amount
    Cr  2.2 Anticipos de clientes        amount
```

### 8. Devolución de anticipo (`refunds_anticipo_id`)

```
Dr  2.2 Anticipos de clientes           amount
    Cr  1.1.X [payment_method]           amount
```

### 9. Creación de cuenta a cobrar (standalone)

```
Dr  1.3 Cuentas a cobrar — clientes     total_amount
    Cr  9.2 Clearing movimientos internos   total_amount
```
⚠ El `concept` es texto libre. La contadora necesita revisar el mapeo inicial. Préstamos otorgados: el Dr va a 1.5 (activo) no a 1.3.

### 10. Cobro de cuenta a cobrar

```
Dr  1.1.X [payment_method]              amount
    Cr  1.3 Cuentas a cobrar — clientes  amount
```

### 11. Retiro de producto por staff (`create_staff_receivable`)

```
Dr  1.4 Cuentas a cobrar — staff        unit_cost_snapshot × qty
    Cr  1.2 Inventario                   unit_cost_snapshot × qty
```
(FIFO ya consume el inventario; el asiento refleja que ese valor pasa a "debe el empleado")

### 12. Liquidación de comisiones (`settle_commission_payout`)

```
-- Parte neta (efectivo pagado):
Dr  6.1.X [subcategoría Comisiones]     net_amount
    Cr  1.1.X [payment_method]           net_amount

-- Parte offset (retiros descontados, sin caja):
Dr  2.3 Comisiones a pagar              receivables_offset
    Cr  1.4 Ctas a cobrar — staff        receivables_offset
```
⚠ Nota: hoy las comisiones devengadas no generan asiento al momento del servicio. A futuro (fase avanzada) se puede agregar: `Dr 6.1.X Comisiones / Cr 2.3 Comisiones a pagar` al momento de cada servicio, para reconocimiento accrual puro.

### 13. Movimiento de fondo reservado

```
Dr  1.6 Fondos reservados               abs(amount)    [si deposita]
    Cr  9.2 Clearing internos            abs(amount)

-- o inverso si es devolución
```
⚠ Gap actual: el movimiento de fondo crea una `transactions` row pero sin `transaction_payments`, así que no tiene método de pago. La usuaria debería indicar de qué caja sale/entra. Por ahora usa clearing.

### 14. Ajuste manual de lote (LotDrawer)

```
Dr  9.1 Ajuste de inventario            abs(delta × unit_cost)   [si baja]
    Cr  1.2 Inventario                   abs(delta × unit_cost)

-- o inverso si sube
```

### 15. Anulación de transacción (`voided_at`)

Genera un asiento espejo con `reference_type = 'void_reversal'`, revirtiéndolo todo:
```
-- Inversión exacta del asiento original (debit↔credit)
-- reference_id = journal_entry_id del asiento original
```
⚠ COGS (sale_items) no se deshace automáticamente hoy. El asiento contable se revierte, pero el inventario físico no vuelve. La contadora debe saber esto o se agrega un ajuste de inventario manual.

---

## Manejo de multi-moneda

**Problema actual**: no se guarda la tasa de cambio histórica. Los reportes convierten USD → ARS a la tasa del momento de consulta (dólar blue en vivo).

**Solución para el libro mayor**:
- Agregar `fx_rate_ars` en `journal_entries`. Al postear, si `currency = 'USD'` o `'EUR'`, guardar la tasa vigente (la misma que `useDolarBlue` cachea).
- Cada `journal_line` guarda el monto en la moneda original; la columna `fx_rate_ars` del entry permite convertir.
- Los reportes del libro mayor pueden mostrar ARS nativo + equivalente ARS histórico (no el del día).
- **Para la migración histórica**: los asientos backfill no tienen tasa histórica real — se puede usar la tasa del día de migración, o dejar `fx_rate_ars = null` y tratarlos como "sin conversión fiable".

---

## Arquitectura de implementación

### Motor de posteo: RPCs de Postgres

Cada flujo tiene una RPC de posteo `post_journal_XXXX(reference_id)` que:
1. Lee el objeto de referencia (transaction, debt_payment, etc.)
2. Resuelve las cuentas GL (via tablas de mapeo)
3. Inserta `journal_entries` + `journal_lines` en una sola transacción
4. Falla si `Σ debit ≠ Σ credit` (constraint)
5. Respeta `locked_periods`

Las RPCs existentes se extienden para llamar al motor de posteo dentro de la misma transacción DB (atomicidad garantizada). No hay lógica de posteo en el frontend.

### Modo "dual write" durante la transición

Durante la migración, el sistema sigue leyendo de las tablas operativas para todos los reportes. El libro mayor se escribe en paralelo pero no se usa para nada todavía. Esto permite:
- Verificar que los asientos cuadran antes de confiar en ellos
- La contadora audita sin riesgo
- Si algo falla en el posting, no bloquea la operación principal

Una vez reconciliado, se migran los reportes uno a uno.

---

## Fases de implementación

### Fase 1 — Fundamentos (4-6 semanas)
1. Tabla `gl_accounts` + plan de cuentas inicial (seed migration)
2. Tablas `journal_entries` + `journal_lines` con constraint de balance
3. Tablas de mapeo `payment_method_gl_accounts` + `subcategory_gl_accounts`
4. UI mínima en Settings para configurar los mapeos (admin only)
5. Extensión del trigger `locked_periods` a `journal_entries`
6. `post_journal_transaction` RPC (cubre eventos 1 y 2: ingresos/gastos)
7. Integración en `useCreateTransaction` y `useUpdateTransaction`
8. **Validación**: comparar saldos de `usePaymentMethodBalances` vs saldos del libro mayor

### Fase 2 — Inventario y COGS (3-4 semanas)
1. Extender `consume_inventory_fifo` para postear evento 3 (COGS)
2. Extender `receive_purchase_order` para postear eventos 4 y 5
3. Posteo de ajustes manuales de lote (evento 14)
4. **Corrección**: compras inmediatas pasan de `Expense → Cash` a `Inventory → Cash`
   - ⚠ Esto cambia el Utilidad histórico: las compras ya no son gasto al comprar sino al vender via COGS. Validar con la contadora.
5. **Validación**: saldo de `1.2 Inventario` en el libro mayor vs `useInventoryValuation`

### Fase 3 — Cuentas a pagar y cobrar (3-4 semanas)
1. Posteo de `supplier_debt_payment` (evento 6) — el gap más importante
2. Posteo de señas/anticipos (eventos 7 y 8)
3. Posteo de `receivable` create + collection (eventos 9 y 10)
4. Posteo de retiro de staff (evento 11)
5. Posteo de liquidación de comisiones (evento 12)
6. Posteo de movimientos de fondos (evento 13)
7. **Validación**: `2.1 A/P` vs `useSupplierDebts`, `1.3 A/R` vs `useReceivables`

### Fase 4 — Anulaciones y void (2 semanas)
1. Extender `useVoidTransaction` para postear asiento reversal (evento 15)
2. Decidir política de COGS en void (¿se revierte físicamente? ¿solo contable?)
3. Test de cuadre post-void

### Fase 5 — Backfill histórico (2-3 semanas, con la contadora)
1. Script de migración que recorre todos los datos existentes en orden cronológico y genera asientos retroactivos
2. Reconciliación período por período contra los reportes actuales
3. Documentar discrepancias conocidas (PO inmediatas mal clasificadas, USD sin tasa histórica)

### Fase 6 — Migrar reportes al libro mayor (4-6 semanas)
1. `useBalanceSheet` → leer de `gl_accounts` balances (activo/pasivo/patrimonio real)
2. `useFinancialReport` → leer de `journal_lines` agrupado por cuenta
3. `useProfitReport` → COGS del libro mayor (5.1) vs ingresos (4.x)
4. Nueva vista **Libro Mayor** por cuenta (la pestaña Cuentas que planificamos, ahora sobre datos reales de doble entrada)
5. Equity deja de ser un tapón: aparece `3.2 Resultados acumulados` + `3.3 Resultado del ejercicio`

### Fase 7 — Cierre de período contable (futuro)
1. RPC `close_period(year, month)` que:
   - Bloquea el período
   - Calcula el resultado neto (ingresos − costos − gastos)
   - Postea asiento de cierre: `Dr Resultado del ejercicio / Cr Resultados acumulados`
2. UI de cierre en Settings (admin only)

---

## Problemas conocidos y decisiones pendientes

| # | Problema | Decisión requerida |
|---|----------|--------------------|
| 1 | **PO inmediata = gasto (bug actual)**: el sistema actual carga el costo de compra como gasto Costos. Con doble entrada pasa a ser activo (Inventario). Cambia el estado de resultados histórico. | Validar con la contadora si corregir en la migración o solo desde la fecha de go-live. |
| 2 | **USD sin tasa histórica**: los asientos históricos en USD no tienen tasa al momento de la operación. | Opción A: backfill con tasa del día de migración (distorsiona). Opción B: campo nullable, reportes excluyen las operaciones sin tasa o las convierten al valor del día. |
| 3 | **Supplier debt payment sin cash transaction**: un pago de A/P no genera `transactions` hoy, entonces no tiene método de pago. | Opción A: el posteo usa el `payment_method` del `supplier_debt_payments.payment_method` (ya existe el campo). Opción B: crear una `transactions` de tipo transfer para cada pago (más limpio). Recomendado: A. |
| 4 | **Reserve movement sin payment_method**: la `transactions` de un movimiento de fondo no tiene `transaction_payments`. | Agregar un campo `payment_method` al form de movimiento de fondo. Bajo impacto en UX. |
| 5 | **Receivable concept libre**: al crear una A/R standalone, no hay cuenta crédito clara. | Agregar un selector de tipo (préstamo, venta diferida, otro) en el form de A/R. Mínimo: 3 opciones, mapean a cuentas distintas. |
| 6 | **Void no deshace FIFO**: al anular una venta, el inventario no vuelve. El asiento contable se revierte pero el stock físico no. | Política: void revierte el asiento, pero la contadora debe hacer un ajuste de inventario manual (documentado). O agregar un "unwind FIFO" en el void (complejo, sale_items son inmutables por diseño). |
| 7 | **Comisiones devengadas no se registran al momento del servicio**: solo al liquidar. | Fase 7 opcional: accrual de comisiones (Dr Comisiones / Cr Comisiones a pagar) en el momento del servicio. Por ahora, omitir y aceptar como limitación conocida. |
| 8 | **Subcategorías nuevas sin mapeo GL**: si la usuaria crea una nueva subcategoría, no tiene cuenta GL asignada. | Bloquear el posteo si no hay mapeo y mostrar alerta al admin. La subcategoría funciona para la UX pero no postea hasta ser mapeada. |

---

## Archivos críticos a crear/modificar

### Nuevas migraciones
- `061_gl_accounts.sql` — tabla + plan de cuentas seed
- `062_journal_ledger.sql` — `journal_entries` + `journal_lines` + constraint de balance + trigger locked_periods
- `063_gl_account_mappings.sql` — `payment_method_gl_accounts` + `subcategory_gl_accounts`
- `064_post_journal_transaction.sql` — RPC para eventos 1 y 2
- `065_extend_fifo_with_cogs_posting.sql` — modifica `consume_inventory_fifo`
- `066_extend_receive_po_with_inventory_posting.sql` — modifica `receive_purchase_order`
- *(y así para cada fase)*

### Archivos TS a modificar (eventualmente)
- `src/types/database.ts` — agregar tipos para las nuevas tablas
- `src/hooks/useTransactions.ts` — el dual-write ocurre en el backend; el hook no cambia en las fases iniciales
- `src/hooks/useReports.ts` — migrar en Fase 6 para leer del libro mayor
- `src/pages/settings/SettingsPage.tsx` — UI para mapeos de cuentas GL
- `src/pages/reports/ReportsPage.tsx` — nueva pestaña Cuentas con libro mayor real (Fase 6)

---

## Checklist para presentar a la contadora antes de empezar

- [ ] Revisar y aprobar el plan de cuentas propuesto (códigos, nombres, jerarquía)
- [ ] Definir qué hacer con las compras inmediatas históricas (¿corregir o solo forward?)
- [ ] Definir política de void + COGS
- [ ] Confirmar tratamiento de USD histórico
- [ ] Definir si las comisiones devengadas se reconocen al servicio o al pago (accrual vs cash basis para comisiones)
- [ ] Revisar que el `concept` libre de A/R tiene suficiente contexto o si agregar un tipo estructura el dato

---

## Lo que NO cambia (garantía de UX)

- El formulario de transacciones y el Quick Funnel: mismos campos, misma lógica
- La pestaña de Cuentas (A/P y A/R): mismos campos
- La creación de órdenes de compra: mismos campos
- Los ajustes de inventario: mismos campos
- Las categorías/subcategorías: el usuario sigue creando y usando subcategorías normalmente
- Los métodos de pago: el usuario sigue nombrándolos como quiere

El mapeo GL es una capa de configuración técnica, visible solo para el admin y la contadora, invisible para el resto.
