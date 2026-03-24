# ERP de Peluquería — Cómo funciona el sistema contable

Este documento explica la lógica de negocio del sistema: qué problema resuelve, cómo registra los números y qué fórmulas usa para calcular utilidades, comisiones y valuación de inventario. Está escrito para personas que entienden el negocio, no para programadores.

---

## El problema que reemplaza

Antes del sistema, el negocio usaba Excel. El problema central de Excel en este contexto es uno: **cuando vendés un producto, Excel siempre te dice que el costo fue el del último precio que pagaste**, aunque ese producto lo hayas comprado hace tres meses a otro precio.

Eso genera distorsiones. Si compraste champú en enero a $100 y en marzo te aumentaron a $150, y en abril vendés una unidad de las que compraste en enero, Excel te va a decir que el costo de esa venta fue $150 — cuando en realidad fue $100. Tu utilidad real fue mayor de lo que Excel te muestra.

Este sistema resuelve eso con un método contable llamado **FIFO**.

---

## Qué es FIFO y por qué importa

**FIFO** significa "First In, First Out" (primero que entra, primero que sale). Es la forma más precisa de costear inventario cuando los precios de compra cambian con el tiempo.

La regla es simple: cuando vendés una unidad, el sistema asume que vendiste la unidad más antigua que tenés en stock. Y usa el costo real de esa unidad.

### Ejemplo práctico

| Compra | Fecha | Unidades | Costo unitario |
|--------|-------|----------|----------------|
| Lote A | Enero | 10 un | $100 |
| Lote B | Marzo | 10 un | $150 |

Si en abril vendés 12 unidades, FIFO dice:
- Las primeras 10 salen del **Lote A** → costo $100 cada una
- Las 2 restantes salen del **Lote B** → costo $150 cada una
- **Costo total de la venta = (10 × $100) + (2 × $150) = $1.300**

Si el precio de venta fue $200 por unidad:
- **Ingresos = 12 × $200 = $2.400**
- **Utilidad bruta = $2.400 − $1.300 = $1.100**

Sin FIFO, si solo mirás el último precio pagado ($150), calcularías un costo de $1.800 y una utilidad de solo $600. La diferencia no es menor.

---

## Cómo se registra una compra

Cuando el negocio compra productos, se crea un **Pedido de Compra** con los ítems y sus costos. Al confirmar la recepción de la mercadería, el sistema genera un **lote de inventario** por cada producto comprado.

Un lote guarda:
- Qué producto es
- Cuántas unidades llegaron
- Cuántas unidades quedan disponibles
- El costo unitario que se pagó
- La fecha de recepción (que determina el orden FIFO)

### Distribución del costo de envío

Si la compra tuvo un costo de flete, el sistema no lo ignora ni lo registra por separado: lo **distribuye proporcionalmente entre los productos del pedido**, aumentando el costo unitario de cada uno.

**Fórmula:**

```
Costo efectivo unitario = Costo unitario del producto
                        + (Flete total × Costo del ítem / Costo total del pedido)
```

**Ejemplo:** Pedido de $1.000 en mercadería + $100 de flete. Un producto que costó $300 (30% del pedido) absorbe $30 de flete → su costo real en inventario es $330 por el total del ítem.

---

## Cómo se registra una venta

Cuando se registra una transacción de **ingreso** con categoría "Producto", el sistema descuenta automáticamente el stock usando FIFO. No hace falta registrar la salida por separado.

Lo que hace el sistema internamente:
1. Busca los lotes disponibles de ese producto, ordenados del más antiguo al más nuevo.
2. Consume las unidades empezando por el lote más antiguo.
3. Si un lote no alcanza para cubrir toda la venta, pasa al siguiente.
4. Registra exactamente qué lote se consumió, cuántas unidades y a qué costo.

Esto queda guardado como un **sale item** (ítem de venta) y es **inmutable** — no se puede editar después. Es la garantía de que el historial contable no cambia.

---

## Cómo se calcula el stock disponible

El stock de cada producto **no es un número fijo guardado en ningún lado**. Se calcula dinámicamente sumando las unidades restantes en todos los lotes activos de ese producto.

```
Stock disponible = Σ (unidades restantes en cada lote del producto)
```

Esto tiene una ventaja importante: el stock siempre refleja la realidad exacta de los lotes, y no puede "desincronizarse" por errores manuales.

---

## Cómo se calcula la valuación del inventario

La **valuación del inventario** responde a la pregunta: ¿cuánto valen, en pesos de costo, los productos que tengo en stock ahora mismo?

```
Valor total = Σ (unidades restantes × costo unitario del lote)
```

Como cada lote tiene su propio costo (el precio real que se pagó en esa compra), la valuación es precisa incluso cuando los precios cambiaron entre compras.

El sistema también muestra el **rango de precios de compra** de cada producto: el costo del lote más barato y el del más caro que están activos en stock.

---

## Cómo se calculan las comisiones

Las comisiones se asignan por transacción. Cuando se registra una venta de servicio, se indica qué profesional/es participaron y el porcentaje de comisión de cada uno.

El porcentaje es libre — se define en el momento de la transacción, por profesional.

**Fórmula:**

```
Comisión de la profesional = (Monto total cobrado + Seña previa) × (Porcentaje / 100)
```

El sistema incluye la **seña** (anticipo) en la base de cálculo porque forma parte del cobro real del servicio, aunque se haya recibido en otra fecha.

**Ejemplo:** Un servicio de $5.000 donde la clienta pagó una seña de $1.000 previamente y $4.000 el día del turno. La profesional tiene 30% de comisión.

```
Base = $4.000 (monto del día) + $1.000 (seña previa) = $5.000
Comisión = $5.000 × 30% = $1.500
```

---

## El concepto de Seña

Una **seña** es un anticipo que se cobra antes de que se realice el servicio. El sistema maneja dos situaciones:

**1. Registrar la seña cuando se cobra:** Se crea una transacción con descripción "Seña". El sistema la identifica automáticamente y la marca como anticipo. En esta transacción no se calcula comisión todavía.

**2. Registrar el servicio cuando se realiza:** Se crea la transacción del servicio completo e indicás el monto de seña que ya se había cobrado previamente. La comisión se calcula sobre el total (servicio + seña).

**Total cobrado** en el listado de transacciones:
- Para una seña: `Total cobrado = monto de la seña` (es lo que ingresó)
- Para un servicio con seña previa: `Total cobrado = monto del día + seña previa`

---

## Cómo se calcula la utilidad del negocio

El reporte de utilidad separa el negocio en dos partes:

### Utilidad bruta de productos

```
Utilidad bruta productos = Ingresos por ventas de productos − COGS

COGS (Costo de Mercadería Vendida) = Σ (unidades vendidas × costo FIFO de cada unidad)
```

El COGS siempre usa el costo real del lote que se consumió, no el precio de lista ni el último precio pagado.

### Utilidad de servicios

```
Utilidad servicios = Total de ingresos del período − Ingresos por productos
```

Los servicios no tienen COGS calculable de la misma forma (no consumen inventario físico), por lo que su utilidad es directamente el ingreso registrado.

### Utilidad total del negocio

```
Utilidad total = Utilidad bruta productos + Utilidad servicios − Gastos del período
```

Los gastos son todas las transacciones de egreso: insumos, sueldos, alquiler, servicios, etc.

---

## Balance por método de pago

El sistema registra **cómo pagó el cliente**, no solo cuánto. Cada transacción puede tener varios métodos de pago (efectivo, Mercado Pago, tarjeta, transferencia, etc.).

El panel de balance muestra, por método de pago:
```
Balance del método = Σ entradas con ese método − Σ salidas con ese método
```

Esto sirve para saber, por ejemplo, cuánto hay "en efectivo" vs. cuánto está en Mercado Pago, en el período seleccionado.

---

## Balance financiero general

```
Balance neto = Total ingresos − Total egresos
```

Se puede filtrar por período (fecha desde / hasta) y por moneda (ARS, USD, EUR). El sistema soporta multicurrency: cada transacción se registra en la moneda en que ocurrió, y los balances se muestran separados por moneda para no mezclar pesos con dólares.

---

## Sugerencia de cantidad a reponer

Cuando se va a crear un pedido de compra, el sistema sugiere cuántas unidades pedir de cada producto. El algoritmo usa el historial de ventas real:

**Si hay historial del mismo mes en años anteriores:**
```
Sugerencia = Promedio de unidades vendidas ese mes (años anteriores)
           × (1 + Tasa de crecimiento del negocio)
```

La tasa de crecimiento compara los ingresos de los últimos 12 meses contra los 12 meses anteriores, y se aplica como ajuste (con un tope de ±50–100% para evitar distorsiones).

**Si no hay historial del mismo mes:**
```
Sugerencia = Unidades vendidas el mes anterior
```

Es una estimación, no una orden automática. El usuario puede aceptarla o modificarla antes de confirmar el pedido.

---

## Roles y permisos

El sistema tiene dos tipos de usuario:

- **Admin:** puede crear y editar todo — productos, proveedores, pedidos, categorías, profesionales, métodos de pago. También puede ver el reporte de utilidades e importar datos desde Excel.
- **Empleado:** puede registrar transacciones propias. No puede modificar la configuración del negocio ni ver reportes avanzados.

Los permisos se aplican a nivel de base de datos, no solo en la interfaz. Aunque alguien intentara hacer algo fuera de su rol, el sistema lo rechaza.

---

## Integridad de los datos

Algunos principios que garantizan que los números no se corrompan:

- **Los sale items son inmutables.** Una vez que se registra una venta y se consume un lote, ese registro no se puede editar ni borrar. El historial contable es permanente.
- **El stock es calculado, no ingresado manualmente.** No hay un campo "stock" que alguien pueda sobrescribir. Siempre se calcula de los lotes reales.
- **Las operaciones son atómicas.** Una venta con varios productos o la recepción de un pedido suceden "todo o nada". Si algo falla a la mitad, se revierte todo y no quedan datos a medias.
- **La distribución de envío se calcula al recibir, no al pedir.** El flete se distribuye sobre las unidades que realmente llegaron (recepción parcial incluida), no sobre las que se pidieron originalmente.
