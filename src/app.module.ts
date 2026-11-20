import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CashMovementsModule } from './cash-movements/cash-movements.module';
import { HealthModule } from './health/health.module';
import { OrdersModule } from './orders/orders.module';
import { PortfoliosModule } from './portfolios/portfolios.module';
import { PrismaModule } from './prisma/prisma.module';
import { StocksModule } from './stocks/stocks.module';
import { UsersModule } from './users/users.module';

function validateEnvironment(environment: Record<string, unknown>): {
  DATABASE_URL: string;
  PORT: number;
  CORS_ORIGIN?: string;
} {
  const databaseUrl = environment.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || !databaseUrl.startsWith('postgres')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  const port = Number(environment.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }

  return {
    DATABASE_URL: databaseUrl,
    PORT: port,
    CORS_ORIGIN:
      typeof environment.CORS_ORIGIN === 'string'
        ? environment.CORS_ORIGIN
        : undefined,
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.DATABASE_URL !== undefined,
      validate: validateEnvironment,
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    PortfoliosModule,
    StocksModule,
    CashMovementsModule,
    OrdersModule,
  ],
})
export class AppModule {}
