CREATE TYPE "cash_movement_type" AS ENUM ('DEPOSIT', 'WITHDRAWAL');
CREATE TYPE "order_side" AS ENUM ('BUY', 'SELL');
CREATE TYPE "order_status" AS ENUM ('PENDING', 'EXECUTED', 'REJECTED', 'CANCELLED');

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(30),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_full_name_not_blank" CHECK (length(trim("full_name")) > 0),
    CONSTRAINT "users_email_not_blank" CHECK (length(trim("email")) > 0)
);

CREATE TABLE "portfolios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "base_currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "cash_balance" NUMERIC(20,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "portfolios_name_not_blank" CHECK (length(trim("name")) > 0),
    CONSTRAINT "portfolios_cash_balance_non_negative" CHECK ("cash_balance" >= 0),
    CONSTRAINT "portfolios_currency_usd" CHECK ("base_currency" = 'USD')
);

CREATE TABLE "stocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "symbol" VARCHAR(12) NOT NULL,
    "company_name" VARCHAR(150) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "current_price" NUMERIC(20,6) NOT NULL,
    "price_updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stocks_symbol_not_blank" CHECK (length(trim("symbol")) > 0),
    CONSTRAINT "stocks_company_name_not_blank" CHECK (length(trim("company_name")) > 0),
    CONSTRAINT "stocks_price_non_negative" CHECK ("current_price" >= 0),
    CONSTRAINT "stocks_currency_usd" CHECK ("currency" = 'USD')
);

CREATE TABLE "holdings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "portfolio_id" UUID NOT NULL,
    "stock_id" UUID NOT NULL,
    "quantity" NUMERIC(20,8) NOT NULL,
    CONSTRAINT "holdings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "holdings_quantity_non_negative" CHECK ("quantity" >= 0)
);

CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "portfolio_id" UUID NOT NULL,
    "type" "cash_movement_type" NOT NULL,
    "amount" NUMERIC(20,2) NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cash_movements_amount_positive" CHECK ("amount" > 0)
);

CREATE TABLE "stock_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "portfolio_id" UUID NOT NULL,
    "stock_id" UUID NOT NULL,
    "side" "order_side" NOT NULL,
    "quantity" NUMERIC(20,8) NOT NULL,
    "executed_price" NUMERIC(20,6),
    "status" "order_status" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executed_at" TIMESTAMPTZ(6),
    CONSTRAINT "stock_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_orders_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "stock_orders_executed_price_positive" CHECK ("executed_price" IS NULL OR "executed_price" > 0),
    CONSTRAINT "stock_orders_execution_coherent" CHECK (
      ("status" = 'EXECUTED' AND "executed_price" IS NOT NULL AND "executed_at" IS NOT NULL)
      OR ("status" <> 'EXECUTED' AND "executed_price" IS NULL AND "executed_at" IS NULL)
    )
);

CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "portfolio_id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "cash_movement_id" UUID,
    "stock_order_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "idempotency_records_one_resource" CHECK (
      ("cash_movement_id" IS NOT NULL)::int + ("stock_order_id" IS NOT NULL)::int = 1
    )
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_email_lower_key" ON "users"(lower("email"));
CREATE INDEX "portfolios_user_id_idx" ON "portfolios"("user_id");
CREATE UNIQUE INDEX "stocks_symbol_key" ON "stocks"("symbol");
CREATE UNIQUE INDEX "holdings_portfolio_id_stock_id_key" ON "holdings"("portfolio_id", "stock_id");
CREATE INDEX "holdings_stock_id_idx" ON "holdings"("stock_id");
CREATE INDEX "cash_movements_portfolio_id_effective_at_id_idx" ON "cash_movements"("portfolio_id", "effective_at" DESC, "id" DESC);
CREATE INDEX "stock_orders_portfolio_id_executed_at_id_idx" ON "stock_orders"("portfolio_id", "executed_at" DESC, "id" DESC);
CREATE INDEX "stock_orders_stock_id_idx" ON "stock_orders"("stock_id");
CREATE UNIQUE INDEX "idempotency_records_cash_movement_id_key" ON "idempotency_records"("cash_movement_id");
CREATE UNIQUE INDEX "idempotency_records_stock_order_id_key" ON "idempotency_records"("stock_order_id");
CREATE UNIQUE INDEX "idempotency_records_portfolio_id_key_key" ON "idempotency_records"("portfolio_id", "key");

ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_orders" ADD CONSTRAINT "stock_orders_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_orders" ADD CONSTRAINT "stock_orders_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_stock_order_id_fkey" FOREIGN KEY ("stock_order_id") REFERENCES "stock_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
