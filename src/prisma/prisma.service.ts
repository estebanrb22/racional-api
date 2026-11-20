import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { ApiException } from '../common/api-exception';
import { postgresAdapterConfig } from '../common/database-url';
import { Prisma, PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    const databaseUrl = config.getOrThrow<string>('DATABASE_URL');
    const { connectionString, schema } = postgresAdapterConfig(databaseUrl);
    super({ adapter: new PrismaPg({ connectionString }, { schema }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async serializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';

        if (!retryable) {
          throw error;
        }
        if (attempt === maxAttempts) {
          throw new ApiException(
            409,
            'CONCURRENT_MODIFICATION',
            'The resource was modified concurrently; retry with the same Idempotency-Key',
          );
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 10));
      }
    }

    throw new Error('Unreachable transaction state');
  }
}
