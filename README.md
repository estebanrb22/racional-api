# Racional Investment API

API REST transaccional para administrar usuarios y portafolios, registrar depósitos y retiros, ejecutar compras y ventas simuladas, valorizar posiciones y consultar movimientos recientes.

El proyecto prioriza integridad de datos, precisión decimal y trazabilidad por sobre amplitud funcional. No intenta modelar un broker ni un sistema contable completo.

## Funcionalidad

- Editar información personal de un usuario.
- Editar metadatos de un portafolio sin exponer saldos ni posiciones.
- Registrar depósitos y retiros con fecha efectiva.
- Ejecutar órdenes `BUY` y `SELL` inmediatamente al precio de referencia.
- Consultar efectivo, valorización de posiciones y valor total.
- Consultar movimientos de todos los portafolios de un usuario.
- Reintentar operaciones financieras de forma segura mediante idempotencia.
- Consultar usuarios, portafolios y el catálogo de acciones para facilitar la demo.

## Stack

- Node.js 24 LTS y TypeScript estricto.
- NestJS 11 con módulos, controladores, servicios e inyección de dependencias.
- PostgreSQL 17.
- Prisma ORM 7 y Prisma Migrate.
- `class-validator` y `class-transformer`.
- Swagger/OpenAPI.
- Jest y Supertest sobre PostgreSQL real.
- Docker Compose, ESLint y Prettier.

NestJS organiza responsabilidades HTTP y de dominio sin agregar repositories ni capas abstractas. PostgreSQL y Prisma proporcionan relaciones, restricciones, decimales y transacciones ACID.

## Inicio rápido

### Requisitos

- Node.js 24 LTS. El repositorio incluye `.nvmrc`.
- npm.
- Docker con Docker Compose.

### Instalación

```bash
nvm use
npm install
cp .env.example .env
docker compose up -d postgres
npm run db:migrate:deploy
npm run db:seed
npm run start:dev
```

La API queda disponible en `http://localhost:3000` y Swagger en:

```text
http://localhost:3000/docs
```

El health check comprueba también la conexión a PostgreSQL:

```bash
curl http://localhost:3000/health
```

### Variables de entorno

| Variable       | Requerida | Valor de ejemplo                                                       | Uso                                    |
| -------------- | --------: | ---------------------------------------------------------------------- | -------------------------------------- |
| `DATABASE_URL` |        Sí | `postgresql://racional:racional@localhost:5432/racional?schema=public` | Conexión PostgreSQL                    |
| `PORT`         |        No | `3000`                                                                 | Puerto HTTP                            |
| `CORS_ORIGIN`  |        No | `http://localhost:5173`                                                | Orígenes permitidos separados por coma |

Las credenciales incluidas son exclusivamente locales para Docker Compose. No son secretos de producción.

### Migraciones y seed

```bash
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

Para crear una migración durante desarrollo:

```bash
npm run db:migrate -- --name nombre_de_migracion
```

El seed es idempotente y crea:

| Recurso              | ID                                     |
| -------------------- | -------------------------------------- |
| Usuario Ada Lovelace | `11111111-1111-4111-8111-111111111111` |
| Portafolio demo      | `22222222-2222-4222-8222-222222222222` |
| AAPL                 | `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` |
| NVDA                 | `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb` |
| MSFT                 | `cccccccc-cccc-4ccc-8ccc-cccccccccccc` |

El portafolio comienza sin efectivo para que el flujo depósito, compra y venta sea explícito.

## API

| Método  | Ruta                                   | Respuesta exitosa | Descripción                          |
| ------- | -------------------------------------- | ----------------: | ------------------------------------ |
| `GET`   | `/health`                              |             `200` | Estado de API y base de datos        |
| `GET`   | `/users/:userId`                       |             `200` | Consultar usuario                    |
| `PATCH` | `/users/:userId`                       |             `200` | Editar `fullName`, `email` o `phone` |
| `GET`   | `/users/:userId/movements?limit=20`    |             `200` | Movimientos recientes combinados     |
| `GET`   | `/portfolios/:portfolioId`             |             `200` | Consultar metadatos y efectivo       |
| `PATCH` | `/portfolios/:portfolioId`             |             `200` | Editar `name` o `description`        |
| `GET`   | `/portfolios/:portfolioId/valuation`   |             `200` | Valorizar efectivo y posiciones      |
| `POST`  | `/portfolios/:portfolioId/deposits`    |             `201` | Registrar depósito                   |
| `POST`  | `/portfolios/:portfolioId/withdrawals` |             `201` | Registrar retiro                     |
| `POST`  | `/portfolios/:portfolioId/orders`      |             `201` | Ejecutar compra o venta              |
| `GET`   | `/stocks`                              |             `200` | Listar acciones y precios actuales   |

Los UUID de ruta deben ser UUID v4. Los DTO usan whitelist estricta: un campo no permitido, como `cashBalance` en un `PATCH`, produce `400`.

### Decimales

Los importes, precios y cantidades se reciben y devuelven como strings decimales. No se aceptan números JSON en campos financieros.

| Concepto | Formato de respuesta | Ejemplo        |
| -------- | -------------------- | -------------- |
| Dinero   | 2 decimales          | `"1250.00"`    |
| Precio   | 6 decimales          | `"228.450000"` |
| Cantidad | 8 decimales          | `"1.25000000"` |

### Depósito

```bash
curl -X POST http://localhost:3000/portfolios/22222222-2222-4222-8222-222222222222/deposits \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-deposit-001' \
  -d '{
    "amount": "1000.00",
    "effectiveAt": "2025-01-15T15:00:00.000Z"
  }'
```

```json
{
  "movement": {
    "id": "c842e0de-9c52-4dbe-b5f0-a7075ca77999",
    "portfolioId": "22222222-2222-4222-8222-222222222222",
    "type": "DEPOSIT",
    "amount": "1000.00",
    "effectiveAt": "2025-01-15T15:00:00.000Z",
    "createdAt": "2026-11-20T15:00:01.000Z"
  },
  "idempotencyReplayed": false
}
```

Los retiros usan el mismo cuerpo en `/withdrawals`. `effectiveAt` debe contener zona horaria y no puede estar en el futuro.

### Orden

```bash
curl -X POST http://localhost:3000/portfolios/22222222-2222-4222-8222-222222222222/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-buy-aapl-001' \
  -d '{
    "stockId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "side": "BUY",
    "quantity": "1.25000000"
  }'
```

```json
{
  "order": {
    "id": "627925e9-cadc-4cf8-b851-d064d9600d8e",
    "portfolioId": "22222222-2222-4222-8222-222222222222",
    "stock": {
      "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "symbol": "AAPL"
    },
    "side": "BUY",
    "quantity": "1.25000000",
    "executedPrice": "228.450000",
    "amount": "285.56",
    "status": "EXECUTED",
    "createdAt": "2026-11-20T15:05:00.000Z",
    "executedAt": "2026-11-20T15:05:00.000Z"
  },
  "idempotencyReplayed": false
}
```

### Valoración

```json
{
  "portfolioId": "22222222-2222-4222-8222-222222222222",
  "baseCurrency": "USD",
  "asOf": "2026-11-20T15:10:00.000Z",
  "cashBalance": "714.44",
  "positionsValue": "285.56",
  "totalValue": "1000.00",
  "positions": [
    {
      "stockId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "symbol": "AAPL",
      "quantity": "1.25000000",
      "currentPrice": "228.450000",
      "marketValue": "285.56",
      "priceUpdatedAt": "2026-11-20T12:00:00.000Z"
    }
  ]
}
```

### Movimientos recientes

`GET /users/:userId/movements?limit=20` combina depósitos, retiros y órdenes ejecutadas de todos los portafolios del usuario. `limit` acepta 1 a 100.

El orden es descendente por `effectiveAt` para efectivo o `executedAt` para órdenes. Un empate se resuelve por ID descendente para mantener resultados deterministas. La respuesta incluye `occurredAt` y `recordedAt`, preservando la diferencia entre fecha efectiva y fecha de registro.

### Errores

```json
{
  "statusCode": 409,
  "code": "INSUFFICIENT_FUNDS",
  "message": "The portfolio has insufficient cash",
  "path": "/portfolios/22222222-2222-4222-8222-222222222222/orders",
  "timestamp": "2026-11-20T15:00:00.000Z"
}
```

| Estado | Casos principales                                                                                   |
| -----: | --------------------------------------------------------------------------------------------------- |
|  `400` | DTO inválido, UUID inválido, campo prohibido, fecha futura, operación menor a un centavo            |
|  `404` | Usuario, portafolio o acción inexistente                                                            |
|  `409` | Fondos/acciones insuficientes, email duplicado, clave idempotente conflictiva, concurrencia agotada |
|  `500` | Error inesperado sin detalles internos                                                              |

## Modelo de datos

```mermaid
erDiagram
    User ||--o{ Portfolio : owns
    Portfolio ||--o{ Holding : contains
    Stock ||--o{ Holding : represents
    Portfolio ||--o{ CashMovement : records
    Portfolio ||--o{ StockOrder : records
    Stock ||--o{ StockOrder : trades
    Portfolio ||--o{ IdempotencyRecord : scopes
    CashMovement |o--o| IdempotencyRecord : protects
    StockOrder |o--o| IdempotencyRecord : protects
```

`Portfolio.cashBalance` y `Holding.quantity` son el estado actual. `CashMovement` y `StockOrder` son historial inmutable. El valor total no se persiste porque depende de precios que cambian.

`IdempotencyRecord` es infraestructura, no una séptima entidad financiera. Relaciona una clave con el hash canónico de la solicitud y exactamente uno de sus resultados. Una restricción SQL `CHECK` impide que apunte a cero o dos operaciones.

La migración contiene restricciones que Prisma Schema no expresa directamente:

- Saldos y cantidades no negativos.
- Movimientos y cantidades de órdenes estrictamente positivos.
- Precios ejecutados positivos.
- Coherencia entre estado `EXECUTED`, precio y fecha de ejecución.
- Moneda USD.
- Email único, también de forma insensible a mayúsculas.
- Una posición por combinación de portafolio y acción.

## Decisiones de diseño

### Precisión y redondeo

Todos los cálculos usan `Prisma.Decimal`. El código no convierte valores financieros a `number`.

El importe ejecutado es `quantity * currentPrice`, redondeado a dos decimales mediante `ROUND_HALF_UP`. Una orden cuyo resultado sea menor a `0.01 USD` se rechaza para evitar adquirir o vender acciones por un importe efectivo cero.

La valoración redondea cada posición a centavos y suma esos resultados. Por ello, el detalle siempre suma exactamente `positionsValue` y `totalValue`.

### Transacciones y concurrencia

Depósitos, retiros, compras y ventas se ejecutan con aislamiento `SERIALIZABLE`. Los retiros y compras debitan mediante una actualización condicional que exige saldo suficiente en la propia sentencia. Las ventas aplican la misma estrategia sobre la cantidad del holding.

Esto evita el patrón inseguro de leer un saldo y actualizarlo posteriormente. Los conflictos serializables se reintentan hasta tres veces. Si persisten, se devuelve `CONCURRENT_MODIFICATION` y el cliente puede reenviar la misma clave idempotente.

### Idempotencia

`Idempotency-Key` es obligatorio en todas las operaciones financieras, acepta entre 8 y 128 caracteres y se limita al portafolio. La clave está compartida entre depósitos, retiros y órdenes del mismo portafolio.

La clave, el hash y el resultado se guardan dentro de la misma transacción financiera:

- Misma clave y contenido: se devuelve el recurso original con `idempotencyReplayed: true`.
- Misma clave y contenido diferente: `409 IDEMPOTENCY_KEY_REUSED`.
- Operación fallida: no se reserva la clave porque toda la transacción se revierte.

### Semántica de órdenes

Las órdenes válidas se ejecutan inmediatamente al `Stock.currentPrice`. El precio se copia a `executedPrice`, por lo que el historial no cambia si posteriormente cambia el catálogo.

Las operaciones rechazadas por validación o saldo no se persisten como órdenes `REJECTED`; se responde con error y no hay cambio parcial. Los demás estados se mantienen en el modelo para expresar el ciclo de vida admitido, aunque esta versión solo crea `EXECUTED`.

### Valoración

La valoración usa el último precio almacenado y devuelve `priceUpdatedAt` y `asOf`. No implica que el precio sea de mercado en tiempo real. La lectura usa una transacción `REPEATABLE READ` para mantener un snapshot coherente entre portafolio, holdings y acciones.

## Pruebas

PostgreSQL debe estar levantado:

```bash
docker compose up -d postgres
npm run test:e2e
```

La suite usa el schema `test`, configurado en `.env.test`, aplica migraciones con `migrate deploy` y limpia sus propias tablas. No ejecuta `migrate reset` ni elimina el schema de desarrollo.

La cobertura funcional incluye:

- Depósito y retiro exitosos.
- Retiro con fondos insuficientes y rollback.
- Compra, venta e incremento de holdings.
- Fondos o acciones insuficientes sin cambios parciales.
- Valorización con cantidad fraccionaria y redondeo.
- Historial combinado y ordenado.
- Contrato decimal y campos prohibidos.
- Replay y conflicto de idempotencia.
- Dos retiros concurrentes sin saldo negativo.

Comandos adicionales:

```bash
npm test
npm run lint
npm run format:check
npm run build
```

## Seguridad y limitaciones

La API no implementa autenticación ni autorización porque no forman parte del desafío. Los UUID no son autorización. Este servicio no debe exponerse públicamente sin identidad, control de acceso, rate limiting, TLS, gestión segura de secretos y políticas CORS de producción.

Limitaciones deliberadas:

- Solo USD.
- Precios simulados administrados por seed/base de datos; no existe endpoint público para cambiarlos.
- Sin brokers, datos en tiempo real, comisiones, impuestos ni rentabilidad.
- Sin contabilidad de partida doble ni conciliación bancaria.
- Sin órdenes pendientes, cancelaciones ni ejecución parcial.
- El historial usa un límite y no un cursor; es suficiente para los movimientos recientes solicitados.
- Los holdings en cero se conservan para simplificar concurrencia, pero no aparecen en la valoración.
- `npm audit` reporta vulnerabilidades en `effect`, una dependencia transitiva del CLI de Prisma 7 (`@prisma/config`). No forma parte del runtime HTTP y la corrección automática degradaría a Prisma 6.

## Uso de inteligencia artificial

La IA se utilizó como herramienta de asistencia para analizar requisitos, comparar alternativas, generar una primera implementación, identificar riesgos de concurrencia y redactar casos de prueba y documentación.

Las decisiones finales fueron contrastadas contra el comportamiento real de NestJS, Prisma y PostgreSQL. Durante el desarrollo se ejecutaron migraciones, seed, compilación y pruebas E2E reales. Los errores encontrados, como cambios de CLI en Prisma 7 y configuración de Supertest, se investigaron y corrigieron antes de documentar los comandos.

La IA no sustituye revisión humana de seguridad, producto ni operación en producción.
