import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { postgresAdapterConfig } from '../src/common/database-url';
import { PrismaClient } from '../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
const { connectionString, schema } = postgresAdapterConfig(databaseUrl);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }, { schema }),
});

export const seedIds = {
  user: '11111111-1111-4111-8111-111111111111',
  portfolio: '22222222-2222-4222-8222-222222222222',
  stocks: {
    AAPL: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    NVDA: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    MSFT: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  },
} as const;

async function main(): Promise<void> {
  await prisma.user.upsert({
    where: { id: seedIds.user },
    create: {
      id: seedIds.user,
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+1 555 0100',
    },
    update: {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+1 555 0100',
    },
  });

  await prisma.portfolio.upsert({
    where: { id: seedIds.portfolio },
    create: {
      id: seedIds.portfolio,
      userId: seedIds.user,
      name: 'Long-term portfolio',
      description: 'Demo portfolio in USD',
    },
    update: {
      name: 'Long-term portfolio',
      description: 'Demo portfolio in USD',
    },
  });

  const stocks = [
    {
      id: seedIds.stocks.AAPL,
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      currentPrice: '228.450000',
    },
    {
      id: seedIds.stocks.NVDA,
      symbol: 'NVDA',
      companyName: 'NVIDIA Corporation',
      currentPrice: '141.250000',
    },
    {
      id: seedIds.stocks.MSFT,
      symbol: 'MSFT',
      companyName: 'Microsoft Corporation',
      currentPrice: '512.600000',
    },
  ];

  for (const stock of stocks) {
    await prisma.stock.upsert({
      where: { id: stock.id },
      create: {
        ...stock,
        priceUpdatedAt: new Date('2026-11-20T12:00:00.000Z'),
      },
      update: {
        symbol: stock.symbol,
        companyName: stock.companyName,
        currentPrice: stock.currentPrice,
        priceUpdatedAt: new Date('2026-11-20T12:00:00.000Z'),
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
