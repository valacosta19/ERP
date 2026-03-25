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

### 5.3 Cálculo en los reportes de Utilidad y Costos (Tabs "Utilidad" y "Costos")

Los tabs Utilidad y Costos usan la misma base que el tab Comisiones:

```
Base del servicio = amount + seña_amount   (convertidos a ARS si currency = 'USD')

Comisión deducida = Base del servicio × (Σ commission_rate de esa transacción / 100)
```

Las transacciones con `is_seña = true` se excluyen completamente de estos cálculos (ver §6).

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

## 8. Tab "Utilidad"

Este tab tiene dos secciones: **Gross profit por línea de negocio** y **Utilidad neta estimada**.

### 8.1 Conversión de monedas

Todas las cifras del tab Utilidad se expresan en ARS. Las transacciones en USD se convierten usando el tipo de cambio **dólar blue (precio de venta)** obtenido de `dolarapi.com/v1/dolares/blue` al momento de abrir el reporte. El tipo se cachea 30 minutos.

```
Monto en ARS = amount × tipo_blue_venta   (si currency = 'USD')
Monto en ARS = amount                     (si currency = 'ARS')
```

### 8.2 GP Productos

```
product_revenue = Σ (unit_sale_price × quantity)  [de sale_items del período]
               + Σ amount_en_ARS                  [de transacciones tipo 'income', categoría 'producto',
                                                    sin sale_items asociados]

product_cogs = Σ (unit_cost × quantity)  [de sale_items del período, costo FIFO real del lote]

GP Productos = product_revenue − product_cogs
```

El `unit_sale_price` en `sale_items` es el precio de venta al momento de la transacción. El `unit_cost` es el costo FIFO del lote consumido.

### 8.3 Utilidad de Servicios

```
service_income = Σ amount_en_ARS  (transacciones type='income', categories.name = 'servicio')
```

Solo se incluyen transacciones cuya categoría sea exactamente `"servicio"` (comparación case-insensitive). Transacciones sin categoría o de otra categoría no se acumulan aquí.

Las **deducciones** se calculan sobre las transacciones que tienen `catalog_item_id` no nulo (transacciones vinculadas a un servicio del catálogo):

```
Comisiones del período = Σ [ amount_en_ARS × (Σ commission_rate de la tx / 100) ]
                         (por cada transacción de servicio en el período)

Costo de materiales del período = Σ [ quantity_grams × costo_por_gramo ]
                                  (por cada ingrediente de cada receta de cada servicio en el período)

donde:
  costo_por_gramo = ((min_cost + max_cost) / 2) / unit_size

  min_cost  = costo unitario del lote más barato en stock del producto
  max_cost  = costo unitario del lote más caro en stock del producto
  unit_size = tamaño de la unidad del producto (ej: 500 ml para un shampoo de 500 ml)
```

```
Utilidad servicios = service_income − Comisiones del período − Costo de materiales del período
```

### 8.4 Utilidad neta estimada

```
Total gross profit = GP Productos + Utilidad servicios

Gastos fijos del período = total_monthly_fixed × número de meses en el período filtrado

Utilidad neta estimada = Total gross profit − Gastos fijos del período
```

`total_monthly_fixed` es la suma de todos los gastos fijos activos configurados en Ajustes → Costos. Es un presupuesto mensual, no los gastos reales registrados como transacciones.

### 8.5 Detalle mensual

La tabla mes a mes replica la misma lógica. Por cada mes:

```
rowUtil (Util. servicios) = service_income del mes − comisiones del mes − materiales del mes
rowGP                     = product_profit del mes + rowUtil
rowNeta                   = rowGP − total_monthly_fixed
```

Los gastos fijos se restan en forma uniforme (`total_monthly_fixed` fijo por cada mes), independientemente de cuántos gastos reales haya habido ese mes.

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

`min_cost` y `max_cost` son el costo del lote más barato y más caro activos en inventario para ese producto. Si solo hay un lote activo, `min_cost = max_cost`.

### 9.3 Comisión promedio por servicio

```
commissionAmounts = [ amount_en_ARS × (Σ commission_rate / 100) ]
                    (para cada transacción del servicio)

avgCommissionCost = Σ commissionAmounts / cantidad de transacciones
```

Si no hay transacciones, `avgCommissionCost = 0`.

### 9.4 Margen bruto del servicio

```
Costo variable = materialCost + avgCommissionCost

Margen bruto $ = avgRevenue − Costo variable

Margen bruto % = (Margen bruto $ / avgRevenue) × 100
```

Los gastos fijos **no se incluyen** en este cálculo. Son un costo del negocio en conjunto; no se atribuyen a servicios individuales. El impacto de los gastos fijos se visualiza en el tab Utilidad (§8.4).

---

## 10. Gastos fijos

Los gastos fijos configurados en Ajustes → Costos son un **presupuesto mensual de referencia**. Se usan exclusivamente en el tab Utilidad para estimar la utilidad neta.

No se descuentan automáticamente del tab Financiero ni afectan ningún registro contable de transacciones. Los gastos operativos reales (alquiler, servicios, etc.) deben registrarse como transacciones de egreso para que aparezcan en el tab Financiero.

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
