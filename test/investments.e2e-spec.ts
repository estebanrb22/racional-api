import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { OrderSide } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

const ids = {
  user: '11111111-1111-4111-8111-111111111111',
  portfolio: '22222222-2222-4222-8222-222222222222',
  stock: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

describe('Investment API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.idempotencyRecord.deleteMany();
    await prisma.stockOrder.deleteMany();
    await prisma.cashMovement.deleteMany();
    await prisma.holding.deleteMany();
    await prisma.portfolio.deleteMany();
    await prisma.stock.deleteMany();
    await prisma.user.deleteMany();

    await prisma.user.create({
      data: {
        id: ids.user,
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    });
    await prisma.portfolio.create({
      data: {
        id: ids.portfolio,
        userId: ids.user,
        name: 'Test portfolio',
      },
    });
    await prisma.stock.create({
      data: {
        id: ids.stock,
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        currentPrice: '10.000000',
        priceUpdatedAt: new Date('2026-11-20T12:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const movementBody = (amount: string) => ({
    amount,
    effectiveAt: new Date(Date.now() - 1000).toISOString(),
  });

  async function deposit(amount: string, key = `deposit-${Date.now()}`) {
    return request(app.getHttpServer())
      .post(`/portfolios/${ids.portfolio}/deposits`)
      .set('Idempotency-Key', key)
      .send(movementBody(amount));
  }

  it('deposits cash and replays the same idempotent request once', async () => {
    const body = movementBody('100.25');
    const first = await request(app.getHttpServer())
      .post(`/portfolios/${ids.portfolio}/deposits`)
      .set('Idempotency-Key', 'deposit-replay-1')
      .send(body)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post(`/portfolios/${ids.portfolio}/deposits`)
      .set('Idempotency-Key', 'deposit-replay-1')
      .send(body)
      .expect(201);

    expect(first.body.movement.amount).toBe('100.25');
    expect(replay.body.movement.id).toBe(first.body.movement.id);
    expect(replay.body.idempotencyReplayed).toBe(true);
    const portfolio = await prisma.portfolio.findUniqueOrThrow({
      where: { id: ids.portfolio },
    });
    expect(portfolio.cashBalance.toFixed(2)).toBe('100.25');
    expect(await prisma.cashMovement.count()).toBe(1);
  });

  it('rejects reuse of an idempotency key with different content', async () => {
    await request(app.getHttpServer())
      .post(`/portfolios/${ids.portfolio}/deposits`)
      .set('Idempotency-Key', 'deposit-conflict-1')
      .send(movementBody('10.00'))
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/portfolios/${ids.portfolio}/deposits`)
      .set('Idempotency-Key', 'deposit-conflict-1')
      .send(movementBody('20.00'))
      .expect(409);

    expect(response.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await prisma.cashMovement.count()).toBe(1);
  });

  it('withdraws available cash', async () => {
    await deposit('100.00');
    const response = await request(app.getHttpServer())
      .post(`/portfolios/${ids.portfolio}/withdrawals`)
      .set('Idempotency-Key', 'withdrawal-success-1')
      .send(movementBody('40.50'))
      .expect(201);

    expect(response.body.movement.type).toBe('WITHDRAWAL');
    const portfolio = await prisma.portfolio.findUniqueOrThrow({
      where: { id: ids.portfolio },
    });
    expect(portfolio.cashBalance.toFixed(2)).toBe('59.50');
  });

  it('rejects an overdraw without partial changes', async () => {
    await deposit('10.00');
    const before = await prisma.cashMovement.count();
    const response = await request(app.getHttpServer())
      .post(`/portfolios/${ids.portfolio}/withdrawals`)
      .set('Idempotency-Key', 'withdrawal-failure-1')
      .send(movementBody('20.00'))
      .expect(409);

    expect(response.body.code).toBe('INSUFFICIENT_FUNDS');
    expect(await prisma.cashMovement.count()).toBe(before);
    expect(await prisma.idempotencyRecord.count()).toBe(1);
    const portfolio = await prisma.portfolio.findUniqueOrThrow({
      where: { id: ids.portfolio },
    });
    expect(portfolio.cashBalance.toFixed(2)).toBe('10.00');
  });

  it('buys stock and creates or increments its holding', async () => {
    await deposit('100.00');

    for (const [index, quantity] of ['1.25000000', '0.75000000'].entries()) {
      await request(app.getHttpServer())
        .post(`/portfolios/${ids.portfolio}/orders`)
        .set('Idempotency-Key', `buy-success-${index}`)
        .send({ stockId: ids.stock, side: OrderSide.BUY, quantity })
        .expect(201);
    }

    const holding = await prisma.holding.findUniqueOrThrow({
      where: {
        portfolioId_stockId: {
          portfolioId: ids.portfolio,
          stockId: ids.stock,
        },
      },
    });
    const portfolio = await prisma.portfolio.findUniqueOrThrow({
      where: { id: ids.portfolio },
    });
    expect(holding.quantity.toFixed(8)).toBe('2.00000000');
    expect(portfolio.cashBalance.toFixed(2)).toBe('80.00');
    expect(await prisma.stockOrder.count()).toBe(2);
  });

  it('rejects a buy without cash and leaves no holding or order', async () => {
    const response = await request(app.getHttpServer())
      .post(`/portfolios/${ids.portfolio}/orders`)
      .set('Idempotency-Key', 'buy-failure-1')
      .send({
        stockId: ids.stock,
        side: OrderSide.BUY,
        quantity: '1.00000000',
      })
      .expect(409);

    expect(response.body.code).toBe('INSUFFICIENT_FUNDS');
    expect(await prisma.holding.count()).toBe(0);
    expect(await prisma.stockOrder.count()).toBe(0);
    expect(await prisma.idempotencyRecord.count()).toBe(0);
  });

  it('sells stock, decreases the holding and credits cash', async () => {
    await prisma.holding.create({
      data: {
        portfolioId: ids.portfolio,
        stockId: ids.stock,
        quantity: '2.00000000',
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/portfolios/${ids.portfolio}/orders`)
      .set('Idempotency-Key', 'sell-success-1')
      .send({
        stockId: ids.stock,
        side: OrderSide.SELL,
        quantity: '0.50000000',
      })
      .expect(201);

    expect(response.body.order.amount).toBe('5.00');
    const holding = await prisma.holding.findFirstOrThrow();
    const portfolio = await prisma.portfolio.findUniqueOrThrow({
      where: { id: ids.portfolio },
    });
    expect(holding.quantity.toFixed(8)).toBe('1.50000000');
    expect(portfolio.cashBalance.toFixed(2)).toBe('5.00');
  });

  it('rejects a sell without enough shares and leaves no partial changes', async () => {
    await prisma.holding.create({
      data: {
        portfolioId: ids.portfolio,
        stockId: ids.stock,
        quantity: '0.25000000',
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/portfolios/${ids.portfolio}/orders`)
      .set('Idempotency-Key', 'sell-failure-1')
      .send({
        stockId: ids.stock,
        side: OrderSide.SELL,
        quantity: '0.50000000',
      })
      .expect(409);

    expect(response.body.code).toBe('INSUFFICIENT_SHARES');
    const holding = await prisma.holding.findFirstOrThrow();
    expect(holding.quantity.toFixed(8)).toBe('0.25000000');
    expect(await prisma.stockOrder.count()).toBe(0);
  });

  it('calculates valuation using Decimal and explicit cent rounding', async () => {
    await prisma.portfolio.update({
      where: { id: ids.portfolio },
      data: { cashBalance: '10.00' },
    });
    await prisma.stock.update({
      where: { id: ids.stock },
      data: { currentPrice: '10.015000' },
    });
    await prisma.holding.create({
      data: {
        portfolioId: ids.portfolio,
        stockId: ids.stock,
        quantity: '0.33333333',
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/portfolios/${ids.portfolio}/valuation`)
      .expect(200);

    expect(response.body.cashBalance).toBe('10.00');
    expect(response.body.positionsValue).toBe('3.34');
    expect(response.body.totalValue).toBe('13.34');
    expect(response.body.positions[0].quantity).toBe('0.33333333');
  });

  it('combines and orders recent cash and stock movements', async () => {
    await deposit('100.00', 'movement-deposit-1');
    await request(app.getHttpServer())
      .post(`/portfolios/${ids.portfolio}/orders`)
      .set('Idempotency-Key', 'movement-buy-1')
      .send({
        stockId: ids.stock,
        side: OrderSide.BUY,
        quantity: '1.00000000',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/users/${ids.user}/movements?limit=2`)
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].category).toBe('STOCK_ORDER');
    expect(response.body.data[1].category).toBe('CASH');
    expect(response.body.data[0].amount).toBe('10.00');
  });

  it('validates decimal contracts and rejects financial PATCH fields', async () => {
    await request(app.getHttpServer())
      .post(`/portfolios/${ids.portfolio}/deposits`)
      .set('Idempotency-Key', 'invalid-amount-1')
      .send({
        amount: 10,
        effectiveAt: new Date(Date.now() - 1000).toISOString(),
      })
      .expect(400);

    const response = await request(app.getHttpServer())
      .patch(`/portfolios/${ids.portfolio}`)
      .send({ cashBalance: '999.00' })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects null for required editable fields instead of failing internally', async () => {
    for (const [path, body] of [
      [`/users/${ids.user}`, { fullName: null }],
      [`/users/${ids.user}`, { email: null }],
      [`/portfolios/${ids.portfolio}`, { name: null }],
    ] as const) {
      const response = await request(app.getHttpServer())
        .patch(path)
        .send(body)
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }

    await request(app.getHttpServer())
      .patch(`/portfolios/${ids.portfolio}`)
      .send({ description: null })
      .expect(200);
  });

  it('allows only one of two concurrent withdrawals to consume the balance', async () => {
    await deposit('100.00', 'concurrent-deposit-1');
    const body = movementBody('80.00');
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/portfolios/${ids.portfolio}/withdrawals`)
        .set('Idempotency-Key', 'concurrent-withdrawal-1')
        .send(body),
      request(app.getHttpServer())
        .post(`/portfolios/${ids.portfolio}/withdrawals`)
        .set('Idempotency-Key', 'concurrent-withdrawal-2')
        .send(body),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const portfolio = await prisma.portfolio.findUniqueOrThrow({
      where: { id: ids.portfolio },
    });
    expect(portfolio.cashBalance.toFixed(2)).toBe('20.00');
    expect(
      await prisma.cashMovement.count({ where: { type: 'WITHDRAWAL' } }),
    ).toBe(1);
  });
});
