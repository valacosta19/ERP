# ERP de Peluquería — Manual contable del sistema

Este documento describe con precisión la lógica de valuación, costeo y reporting del sistema. Está redactado para un contador que necesite verificar los números, replicar los cálculos de forma independiente o auditar el criterio aplicado en cada sección.

---

## 1. Método de valuación de inventario: FIFO

El sistema aplica **FIFO estricto** (First In, First Out) para costear cada egreso de inventario. No se utiliza costo promedio ni LIFO.

Cada ingreso de mercadería genera un **lote** con los siguientes atributos:

| Campo | Descripción |
|-------|-------------|
| `product_id` | Producto al que pertenece |
| `quantity` | Unidades recibidas |
| `remaining_quantity` | Unidades aún no consumidas |
| `unit_cost` | Costo unitario real pagado (incluye proporción de flete) |
| `received_at` | Fecha de recepción (define el orden FIFO) |

### Distribución del flete

Cuando un pedido de compra incluye costo de envío, ese importe se **prorratea proporcionalmente** entre los ítems del pedido. La base de prorrateo es el subtotal de cada ítem sobre el total del pedido.

```
Costo unitario efectivo = Costo unitario del ítem
                        + (Flete total × Subtotal del ítem / Subtotal total del pedido)
```

El prorrateo se calcula sobre las **unidades efectivamente recibidas**, no sobre las pedidas. En una recepción parcial, el flete se distribuye solo sobre lo que llegó.

**Ejemplo numérico:**

```
Pedido: 2 ítems
  Ítem A: 10 un × $100 = $1.000 (50% del subtotal)
  Ítem B: 5 un × $200 = $1.000 (50% del subtotal)
  Subtotal: $2.000 | Flete: $200

Costo unitario ajustado:
  Ítem A: $100 + ($200 × $1.000 / $2.000) / 10 = $100 + $10 = $110 por unidad
  Ítem B: $200 + ($200 × $1.000 / $2.000) / 5  = $200 + $20 = $220 por unidad
```

---

## 2. Consumo FIFO en ventas

Cuando se registra una transacción de ingreso con categoría **"Producto"**, el sistema ejecuta el RPC `consume_inventory_fifo` en la base de datos. Este procedimiento:

1. Recupera los lotes del producto ordenados por `received_at` ascendente.
2. Consume unidades del lote más antiguo primero.
3. Si el lote se agota antes de cubrir la cantidad vendida, continúa con el siguiente.
4. Por cada consumo, registra un **`sale_item`** con los campos:

| Campo | Contenido |
|-------|-----------|
| `transaction_id` | Transacción que originó la venta |
| `product_id` | Producto consumido |
| `lot_id` | Lote específico consumido |
| `quantity` | Unidades consumidas de ese lote |
| `unit_cost` | Costo FIFO del lote consumido |
| `unit_sale_price` | Precio de venta unitario registrado en la transacción |

Los `sale_items` son **inmutables**: no admiten edición ni eliminación. Garantizan la trazabilidad contable permanente.

---

## 3. Stock disponible

El stock de cada producto **no se almacena como campo**; se calcula en tiempo real:

```
Stock disponible = Σ remaining_quantity  (para todos los lotes del producto con remaining_quantity > 0)
```

Fuente: tabla `inventory_lots`.

---

## 4. Valuación de inventario

El reporte de valuación responde: ¿cuánto valen a costo los productos actualmente en stock?

```
Valor del producto = Σ (remaining_quantity × unit_cost)  [por cada lote activo del producto]

Valor total del inventario = Σ Valor de cada producto
```

Como cada lote conserva su costo de adquisición original, la valuación refleja el costo histórico real, no el costo de reposición.

---

## 5. Comisiones

### 5.1 Estructura de datos

Las comisiones se registran en la tabla `transaction_hairdressers`, que vincula una transacción con una profesional y un porcentaje:

| Campo | Tipo |
|-------|------|
| `transaction_id` | FK a `transactions` |
| `hairdresser_id` | FK a `hairdressers` |
| `commission_rate` | Porcentaje (ej: `30` significa 30%) |

Una transacción puede tener múltiples profesionales, cada una con su propio `commission_rate`.

### 5.2 Cálculo en el reporte de Comisiones (Tab "Comisiones")

En este reporte, la base de cálculo incluye el monto de seña previa:

```
Base de comisión = amount + seña_amount   (ambos convertidos a ARS si la moneda es USD)

Comisión de la profesional = Base de comisión × (commission_rate / 100)
```

Este es el importe que se muestra en la columna "Comisión" del tab, y el que se suma en los totales quincenales.

### 5.3 Comisiones en el Tab "Costos" (análisis por servicio)

El tab Costos usa `transaction_hairdressers` para calcular la comisión promedio por servicio individual. El propósito es evaluar el margen por servicio, no el resultado del período.

```
commissionAmounts = [ amount_en_ARS × (Σ commission_rate / 100) ]
                    (para cada transacción del servicio en el historial completo)

avgCommissionCost = Σ commissionAmounts / cantidad de transacciones del servicio
```

### 5.4 Comisiones en el Tab "Utilidad" (P&L del período)

En el P&L, las comisiones **no se calculan automáticamente** desde `transaction_hairdressers`. Se capturan como transacciones de egreso de la categoría `Costos > [subcategoría]` (por ejemplo, "Costos > Comisiones"). Esto evita discrepancias entre el registro real pagado y el cálculo estimado.

Ver §15 para la separación de categorías Costos vs Gastos.

---

## 6. Campo `seña_amount` e `is_seña` — regla general

El sistema distingue dos tipos de transacción relacionadas con anticipos:

**Transacción de seña (`is_seña = true`)**
Se genera cuando la descripción es exactamente "Seña". Representa el cobro del anticipo. `seña_amount` es `null` en este caso. Esta transacción **se excluye de todos los reportes de utilidad** (`service_income`, `totalIncomeByMonth`, `txRevenue`). Aparece en el tab Financiero como ingreso de caja del día.

**Transacción de servicio con seña previa (`is_seña = false`, `seña_amount > 0`)**
Representa el cobro del saldo restante de un servicio cuyo anticipo ya fue registrado. `amount` es lo cobrado ese día; `seña_amount` es el anticipo previo. El **valor real del servicio** es `amount + seña_amount`, y esa es la base para todos los cálculos de ingresos, comisiones y costos.

```
Valor real del servicio = amount + seña_amount

Ingreso contabilizado en Utilidad = amount + seña_amount
(la transacción is_seña=true correspondiente se excluye para evitar doble conteo)
```

---

## 7. Tab "Financiero"

Muestra ingresos, egresos y balance agrupados por categoría contable. Filtrable por período y moneda.

```
Ingresos de la categoría = Σ amount  (transacciones type='income' de esa categoría, en el período)
Egresos de la categoría  = Σ amount  (transacciones type='expense' de esa categoría, en el período)
Balance de la categoría  = Ingresos − Egresos

Total ingresos = Σ Ingresos de todas las categorías
Total egresos  = Σ Egresos de todas las categorías
Balance neto   = Total ingresos − Total egresos
```

Los montos se muestran en la moneda original registrada (ARS, USD o EUR). No hay conversión en este tab; los balances son mono-moneda según el filtro seleccionado.

---

## 8. Tab "Utilidad" — Estado de Resultados (P&L)

El tab Utilidad es un Estado de Resultados en base al efectivo. Todas las cifras se expresan en ARS.

### 8.1 Conversión de monedas

Las transacciones en USD se convierten usando el tipo de cambio **dólar blue (precio de venta)** obtenido de `dolarapi.com/v1/dolares/blue` al momento de abrir el reporte. El tipo se cachea 30 minutos.

```
Monto en ARS = amount × tipo_blue_venta   (si currency = 'USD')
Monto en ARS = amount                     (si currency = 'ARS')
```

### 8.2 Estructura del Estado de Resultados

```
INGRESOS
  Servicios        = Σ amount_ARS  [transactions type='income', category.name = 'servicio']
  Venta productos  = Σ (unit_sale_price × quantity)  [sale_items del período]
                   + Σ amount_ARS  [transactions type='income', category.name = 'producto', sin sale_items]
  ─────────────────────────────────────────────────────
  Total Ingresos

COSTO DE VENTAS
  COGS productos (FIFO) = Σ (unit_cost × quantity)  [sale_items del período, costo real del lote]
  Insumos servicios     = Σ [ quantity_grams × ((min_cost + max_cost) / 2) / unit_size ]
                          [por cada ingrediente de cada receta de cada servicio vendido en el período]
                          (solo productos con lotes activos; $0 si min_cost = NULL — ver §16)
  Costos directos       = Σ amount_ARS  [transactions type='expense', parent_category.name = 'Costos']
  ─────────────────────────────────────────────────────
  Total Costo de ventas

  Utilidad Bruta = Total Ingresos − Total Costo de ventas

GASTOS OPERATIVOS
  Gastos = Σ amount_ARS  [transactions type='expense', parent_category.name = 'Gastos'
                           o subcategorías sin padre de tipo 'expense']
  ─────────────────────────────────────────────────────
  Utilidad Neta = Utilidad Bruta − Gastos Operativos
```

### 8.3 Fuentes de datos

| Línea | Hook | Tabla(s) |
|-------|------|----------|
| Servicios, Venta productos | `useProfitReport` | `transactions`, `sale_items`, `transaction_categories` |
| COGS productos | `useProfitReport` | `sale_items` |
| Insumos servicios | cálculo en `ReportsPage` | `service_recipes`, `products_with_stock`, `transactions` |
| Costos directos | `useProfitReport` | `transactions`, `transaction_categories` (parent_id lookup) |
| Gastos operativos | `useProfitReport` | `transactions`, `transaction_categories` (parent_id lookup) |

### 8.4 Detalle mensual

La tabla mes a mes replica la misma lógica por período:

```
rowIngresos = row.product_revenue + row.service_income
rowCOGS     = row.product_cogs + insumos_servicios_del_mes + row.direct_costs
rowGastos   = row.operating_expenses
rowNeta     = rowIngresos − rowCOGS − rowGastos
```

---

## 9. Tab "Costos" — margen bruto por servicio

Este tab muestra el análisis de rentabilidad individual de cada servicio del catálogo. Su propósito es evaluar si el precio está bien puesto, no calcular el resultado del período.

### 9.1 Precio de venta promedio (`avgRevenue`)

```
avgRevenue = Σ amount_en_ARS / cantidad de transacciones
             (para todas las transacciones vinculadas a ese servicio vía catalog_item_id)
```

Si el servicio no tiene transacciones registradas con `catalog_item_id`, se usa el precio en efectivo del catálogo (`price`) como valor de referencia. El campo muestra una advertencia (⚠) en este caso.

Las transacciones con `is_seña = true` se excluyen de este promedio. Se usan únicamente las transacciones del servicio final, con base `amount + seña_amount`.

### 9.2 Costo de materiales por servicio

```
costo_por_gramo = ((min_cost + max_cost) / 2) / unit_size

materialCost = Σ [ recipe.quantity_grams × costo_por_gramo ]
               (para cada ingrediente de la receta del servicio)
```

`min_cost` y `max_cost` son el costo del lote más barato y más caro activos en inventario para ese producto. Si solo hay un lote activo, `min_cost = max_cost`. Si el producto no tiene lotes activos, `min_cost = NULL` y el ingrediente contribuye $0 (ver §16).

### 9.3 Comisión promedio por servicio

```
commissionAmounts = [ amount_en_ARS × (Σ commission_rate / 100) ]
                    (para cada transacción del servicio, desde transaction_hairdressers)

avgCommissionCost = Σ commissionAmounts / cantidad de transacciones
```

Si no hay transacciones, `avgCommissionCost = 0`.

### 9.4 Margen bruto del servicio

```
Costo variable = materialCost + avgCommissionCost

Margen bruto $ = avgRevenue − Costo variable

Margen bruto % = (Margen bruto $ / avgRevenue) × 100
```

Los gastos fijos y los gastos operativos **no se incluyen** en este cálculo. Son costos del negocio en conjunto; no se atribuyen a servicios individuales. Su impacto se visualiza en el tab Utilidad (§8).

La tarjeta "Gastos fijos mensuales" visible en este tab muestra el monto configurado en Ajustes → Costos como **referencia orientativa**; no se deduce de ningún cálculo del tab.

---

## 10. Gastos fijos (Ajustes → Costos)

Los gastos fijos configurados en Ajustes → Costos son un **presupuesto mensual de referencia**. A partir de la Phase 26 soportan historial de montos con fecha de vigencia (`fixed_cost_rates`).

**Importante:** estos montos **no se descuentan automáticamente del P&L** (Tab Utilidad). Los gastos operativos reales (alquiler, servicios, impuestos, etc.) deben registrarse como transacciones de egreso con subcategoría bajo la categoría padre "Gastos" para que aparezcan en el Estado de Resultados.

El campo es útil como control presupuestario: permite comparar mentalmente el gasto real (transacciones) contra el presupuesto configurado.

---

## 11. Balance financiero por método de pago

Cada transacción puede distribuirse en múltiples métodos de pago (efectivo, Mercado Pago, tarjeta, transferencia). El panel de balance descompone los movimientos por método:

```
Balance del método = Σ montos de ingresos con ese método − Σ montos de egresos con ese método
```

Sirve para saber, por ejemplo, cuánto efectivo ingresó vs. cuánto entró por transferencia en el período.

---

## 12. Sugerencia de reposición

Al crear un pedido de compra, el sistema sugiere una cantidad a pedir basada en el historial de ventas real (tabla `sale_items`).

**Con historial del mismo mes en años anteriores:**

```
Sugerencia = Promedio de unidades vendidas ese mes (años anteriores)
           × (1 + tasa_de_crecimiento)

donde:
  tasa_de_crecimiento = (Ingresos últimos 12 meses / Ingresos 12 meses anteriores) − 1
  aplicada con un tope de ±50–100% para evitar distorsiones por outliers
```

**Sin historial del mismo mes:**

```
Sugerencia = Unidades vendidas el mes anterior
```

Es una estimación orientativa; el usuario la ajusta antes de confirmar el pedido.

---

## 13. Roles y permisos

| Rol | Capacidades |
|-----|-------------|
| **Admin** | CRUD completo de productos, proveedores, pedidos, catálogo, profesionales, métodos de pago. Acceso a todos los reportes. Puede importar datos desde Excel. |
| **Empleado** | Puede registrar transacciones. No tiene acceso a configuración ni reportes de utilidad. |

Los permisos se aplican mediante Row Level Security (RLS) en PostgreSQL. No son solo restricciones de interfaz.

---

## 14. Integridad de los datos

- **`sale_items` son inmutables.** Sin política de UPDATE ni DELETE. El historial de costos FIFO no puede modificarse retroactivamente.
- **Stock es calculado, no almacenado.** No existe campo `stock` en `products`. Siempre se deriva de `inventory_lots.remaining_quantity`.
- **Operaciones atómicas.** Las ventas con múltiples productos y las recepciones de pedidos son transacciones de base de datos; si algún paso falla, se revierte todo.
- **Flete distribuido al recibir.** El costo de envío se prorratea sobre lo efectivamente recibido, no sobre lo pedido.

---

## 15. Categorías contables — Costos vs Gastos

Las categorías son de dos niveles: categorías padre fijas del sistema (Ingresos, Costos, Gastos, Movimientos) y subcategorías definidas por el usuario.

Para las transacciones de egreso, el P&L las clasifica según la **categoría padre**:

| Padre | Clasificación en P&L | Línea en Estado de Resultados |
|-------|---------------------|-------------------------------|
| `Costos` | `direct_costs` | Costo de ventas |
| `Gastos` | `operating_expenses` | Gastos operativos |
| Sin padre / otro | `operating_expenses` | Gastos operativos |
| `Movimientos` | excluida | (no aparece) |

La separación se implementa en `useProfitReport` (`src/hooks/useReports.ts`): el hook carga la tabla completa de `transaction_categories`, construye un mapa `id → nombre`, y para cada transacción de egreso consulta el nombre del padre por `parent_id`.

**Criterio de diseño:** "Costos" agrupa los costos directamente vinculados a la prestación del servicio o la venta del producto (insumos, comisiones, materiales). "Gastos" agrupa los gastos operativos del negocio (alquiler, servicios, impuestos, marketing). La separación es la misma que en un estado de resultados contable estándar.

---

## 16. Insumos de servicios — inventario vs transacción directa

Existen dos tipos de insumos según cómo se gestiona su stock:

### Productos gestionados como inventario (OC + lotes)

Productos para los cuales se crean Pedidos de Compra. Al recibirlos se generan lotes en `inventory_lots`. Ejemplos: shampoos, acondicionadores, productos de reventa.

- `products_with_stock` view calcula `min_cost = MIN(unit_cost WHERE remaining_quantity > 0)` y `max_cost = MAX(...)`.
- "Insumos servicios" calcula el costo usando `((min_cost + max_cost) / 2) / unit_size × quantity_grams`.
- **No se registra una transacción de egreso al comprar** estos insumos; el costo se reconoce vía COGS cuando se vende el producto (sale_items) o vía receta cuando se presta el servicio.

### Productos NO gestionados como inventario (transacción directa)

Productos para los cuales no se crean OC ni lotes. Ejemplos: tintes, decolorantes, productos de consumo difícil de medir por unidad.

- No tienen registros en `inventory_lots` → `min_cost = NULL`, `max_cost = NULL`.
- "Insumos servicios" calcula $0 para estos productos (el cálculo de receta resulta cero).
- El costo se registra como **transacción de egreso** con subcategoría `Costos > Insumos` al momento de comprar el lote completo.

### Regla de consistencia (evitar doble conteo)

```
Si el producto TIENE lotes activos:
  → costo capturado por "Insumos servicios" (receta)
  → NO registrar transacción de egreso por esos insumos

Si el producto NO tiene lotes activos:
  → "Insumos servicios" = $0 (automático, no require acción)
  → costo capturado por transacción "Costos > Insumos" al comprar
```

Mientras un producto no tenga OC/lotes, no hay doble conteo posible. Si en el futuro se decide migrar un producto de "transacción directa" a "inventario", hay que dejar de registrar la transacción de egreso por ese insumo para evitar duplicar el costo en el P&L.

---

## 17. Tab "Balance" — Balance General

El Balance General muestra la posición patrimonial del negocio en una fecha determinada (base al efectivo y a los registros del sistema).

### 17.1 Estructura

```
ACTIVOS
  Efectivo por método de pago:
    Para cada método: Σ ingresos − Σ egresos  [transaction_payments, date ≤ fecha de corte,
                                                 voided_at IS NULL, type ≠ 'transfer']
  Cuentas por cobrar:
    Σ (receivables.total_amount − receivables.collected_amount)
  Inventario (valor FIFO):
    Σ (inventory_lots.remaining_quantity × inventory_lots.unit_cost)  [remaining_quantity > 0]
  ─────────────────────────────────────────────────────
  Total Activos = Efectivo + Cuentas por cobrar + Inventario

PASIVOS
  Cuentas por pagar:
    Σ (supplier_debts.total_amount − supplier_debts.paid_amount)
  ─────────────────────────────────────────────────────
  Total Pasivos

Patrimonio Neto = Total Activos − Total Pasivos
```

### 17.2 Notas contables importantes

- **Base al efectivo, no devengado.** El efectivo refleja los cobros y pagos reales registrados en el sistema desde el inicio de los datos, no los devengados.
- **El patrimonio neto no equivale a la utilidad acumulada.** Incluye el capital inicial aportado y cualquier saldo de apertura registrado como transacción de ingreso. Para cargar saldos iniciales de cuentas (al migrar desde otro sistema), se registra una transacción de tipo "Saldo inicial" con la categoría "Ingresos > Saldo inicial" por cada método de pago.
- **Las transferencias entre métodos de pago están excluidas** del cálculo de efectivo (tipo `transfer` en `transaction_categories`). Solo se toman transacciones de tipo `income` o `expense`.
- **Cuentas por cobrar y por pagar** reflejan el saldo pendiente neto (total menos lo ya cobrado/pagado), independientemente de la fecha de vencimiento.

### 17.3 Fuente de datos

Hook: `useBalanceSheet(asOfDate)` en `src/hooks/useReports.ts`.

Tablas consultadas: `transaction_payments`, `receivables`, `inventory_lots`, `supplier_debts`.

---

## 18. Limitaciones y riesgos del diseño actual

Esta sección documenta los puntos donde el sistema se desvía de un Estado de Resultados contable estándar. El sistema está diseñado para gerentes de pyme, no para contadores; estas simplificaciones son decisiones intencionales de diseño, pero es importante entender cuándo pueden distorsionar los números.

---

### 18.1 "Insumos servicios" — costo bloqueado al momento de la transacción ✅ Resuelto

**Cómo funciona ahora:** Al registrar un servicio, el sistema guarda en `transaction_recipe_costs` el costo promedio de cada insumo de la receta en ese momento exacto (`(min_cost + max_cost) / 2` de los lotes activos). El P&L usa esos valores guardados para calcular el costo de materiales histórico.

**Comportamiento con datos anteriores:** Las transacciones creadas antes de esta mejora no tienen snapshot guardado. Para esas, el sistema sigue usando el costo actual como fallback (comportamiento anterior). Solo las nuevas transacciones tienen el costo bloqueado.

**Resultado:** El P&L de un mes es ahora estático para todos los servicios registrados desde la fecha de implementación. Dos personas mirando el mismo mes ven los mismos números, aunque hayan entrado lotes nuevos a distinto precio.

---

### 18.2 El tipo de cambio USD siempre es el actual (dólar blue del día)

**Qué pasa:** Todas las transacciones en USD, sin importar en qué mes fueron, se convierten a ARS usando el tipo de cambio blue **vigente al momento de abrir el reporte**. No se guarda el tipo de cambio histórico de cada transacción.

**Ejemplo concreto:** Cobraste U$D 100 en octubre cuando el blue estaba a $900. Si mirás el P&L de octubre en abril con el blue a $1.200, verás $120.000 de ingreso en lugar de $90.000. El margen de octubre aparece inflado.

**Cuándo importa:** Solo si el negocio tiene una proporción relevante de ingresos o gastos en USD y el tipo de cambio varió mucho entre el período analizado y hoy. Para un salón que cobra casi todo en ARS, el impacto es marginal.

**Qué no tiene solución hoy:** Habría que guardar el tipo de cambio al momento de cada transacción. Decisión pendiente.

---

### 18.3 Cobro de cuentas por cobrar no aparece en el P&L (ni bien ni mal)

**Qué pasa:** Cuando se registra el cobro de una cuenta por cobrar (préstamo a empleado, adelanto a cliente, etc.), el sistema crea automáticamente una transacción con `subcategory_id = null`. Las transacciones sin categoría son **ignoradas por el P&L**.

**Consecuencia:** El cobro de un préstamo no aparece como ingreso en el Estado de Resultados, lo cual es contablemente correcto (recuperar un préstamo no es un ingreso, es una recuperación de activo). El problema puede surgir si el préstamo original fue registrado como un **egreso de costos o gastos** (en lugar de una transferencia o movimiento): en ese caso el P&L muestra la salida como gasto pero no muestra el reingreso, exagerando las pérdidas.

**Regla operativa:** Los préstamos a empleados o anticipos deben registrarse usando la categoría de tipo `Movimientos` (transfer), no como `Costos` ni `Gastos`. Si se registran como "Movimientos", ni la salida ni el cobro afectan el P&L y el resultado es correcto.

---

### 18.4 Saldo inicial registrado como ingreso infla el P&L

**Qué pasa:** Si al migrar al sistema se registraron los saldos de las cuentas (efectivo en caja, saldo en Mercado Pago, etc.) como transacciones de ingreso con subcategoría "Ingresos > Saldo inicial", esos montos van a aparecer como **ingresos del período** en el P&L del mes en que se registraron.

**Ejemplo concreto:** Registraste $500.000 como saldo inicial en enero. El P&L de enero va a mostrar $500.000 de ingresos "fantasma" que no corresponden a servicios ni ventas del período.

**Cómo evitarlo:** Los saldos iniciales deben registrarse con una subcategoría de tipo `transfer` (Movimientos), no de tipo `income`. Si ya están cargados como ingresos y distorsionan el análisis, la solución práctica es filtrar el P&L desde una fecha posterior a la carga de saldos iniciales.

---

### 18.5 Dos fuentes para comisiones: Tab Costos vs Tab Utilidad

**Qué pasa:** El Tab Costos calcula comisiones automáticamente desde la tabla `transaction_hairdressers` (el porcentaje asignado a cada profesional por transacción). El Tab Utilidad las toma de las transacciones de egreso con subcategoría `Costos > Comisiones` que el operador cargó manualmente.

**Riesgo:** Si no se registran las transacciones de comisiones, el P&L (Tab Utilidad) no va a incluirlas y la utilidad neta aparecerá sobreestimada. Si se registran con un monto diferente al calculado automáticamente (por redondeos, pagos en cuotas, etc.), los dos tabs van a mostrar números distintos.

**Regla operativa:** Registrar siempre el pago real de comisiones como transacción de egreso `Costos > Comisiones`. El Tab Costos es una herramienta de análisis de precio por servicio; el Tab Utilidad refleja lo que realmente se pagó.

---

### 18.6 Fondos (reservas): excluidos del P&L por diseño

Los movimientos hacia y desde cuentas de reserva (Fondos) se registran como transacciones de tipo `transfer`. Las transferencias están excluidas del P&L y del Tab Financiero. Esto es correcto: mover dinero a una reserva no es un gasto, y recuperarlo no es un ingreso.

**Riesgo:** Si se usa la categoría equivocada al cargar un movimiento de Fondo (por ejemplo, una subcategoría de `Gastos` en lugar de `Movimientos`), el monto aparecerá como gasto en el P&L. Verificar siempre que los movimientos a/desde Fondos usen una subcategoría de tipo `transfer`.

---

### 18.7 El Patrimonio Neto no equivale a la utilidad acumulada del negocio

**Qué pasa:** El Patrimonio Neto del Balance General (Tab Balance) es simplemente `Total Activos − Total Pasivos`. Incluye el capital inicial de la dueña, los saldos de apertura, y cualquier otro ingreso/egreso desde el inicio del sistema. No separa "capital aportado" de "ganancias retenidas".

**Consecuencia:** Un Patrimonio Neto positivo no significa que el negocio sea rentable; puede ser positivo simplemente porque la dueña aportó capital. Para medir rentabilidad, el indicador correcto es la Utilidad Neta del Tab Utilidad, no el Patrimonio Neto.

**Nota para futuros desarrolladores:** Para tener un Balance General contablemente riguroso habría que separar el capital en secciones: "Capital aportado", "Resultados acumulados" y "Resultado del ejercicio". Esto requiere marcar explícitamente las transacciones de aporte de capital y está fuera del alcance del MVP.
