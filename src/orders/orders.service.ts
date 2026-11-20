import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import {
  calculateOrderAmount,
  decimal,
  serializeMoney,
  serializePrice,
  serializeQuantity,
} from '../common/decimal';
import { requestHash } from '../common/hash';
import {
  OrderSide,
  OrderStatus,
  Prisma,
  StockOrder,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './create-order.dto';

type OrderWithStock = StockOrder & { stock: { id: string; symbol: string } };

type OrderResponse = {
  order: {
    id: string;
    portfolioId: string;
    stock: { id: string; symbol: string };
    side: OrderSide;
    quantity: string;
    executedPrice: string;
    amount: string;
    status: OrderStatus;
    createdAt: Date;
    executedAt: Date;
  };
  idempotencyReplayed: boolean;
};

const MAX_MONEY = new Prisma.Decimal('999999999999999999.99');

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    portfolioId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<OrderResponse> {
    const quantity = decimal(dto.quantity);
    if (!quantity.isPositive()) {
      throw new ApiException(
        400,
        'INVALID_QUANTITY',
        'Quantity must be greater than zero',
      );
    }

    const hash = requestHash({
      operation: dto.side,
      portfolioId,
      stockId: dto.stockId,
      quantity: quantity.toFixed(8),
    });

    try {
      return await this.prisma.serializable(async (transaction) => {
        const replay = await this.findReplay(
          transaction,
          portfolioId,
          idempotencyKey,
          hash,
        );
        if (replay) {
          return replay;
        }

        const [portfolio, stock] = await Promise.all([
          transaction.portfolio.findUnique({
            where: { id: portfolioId },
            select: { id: true },
          }),
          transaction.stock.findUnique({ where: { id: dto.stockId } }),
        ]);
        if (!portfolio) {
          throw new ApiException(
            404,
            'PORTFOLIO_NOT_FOUND',
            'Portfolio not found',
          );
        }
        if (!stock) {
          throw new ApiException(404, 'STOCK_NOT_FOUND', 'Stock not found');
        }
        if (!stock.currentPrice.isPositive()) {
          throw new ApiException(
            409,
            'STOCK_NOT_TRADABLE',
            'Stock must have a positive reference price',
          );
        }

        const amount = calculateOrderAmount(quantity, stock.currentPrice);
        if (amount.lessThan('0.01')) {
          throw new ApiException(
            400,
            'ORDER_VALUE_TOO_SMALL',
            'Order value must round to at least 0.01 USD',
          );
        }
        if (amount.greaterThan(MAX_MONEY)) {
          throw new ApiException(
            400,
            'ORDER_VALUE_TOO_LARGE',
            'Order value exceeds the supported monetary range',
          );
        }

        if (dto.side === OrderSide.BUY) {
          const debited = await transaction.portfolio.updateMany({
            where: { id: portfolioId, cashBalance: { gte: amount } },
            data: { cashBalance: { decrement: amount } },
          });
          if (debited.count === 0) {
            throw new ApiException(
              409,
              'INSUFFICIENT_FUNDS',
              'The portfolio has insufficient cash',
            );
          }
          await transaction.holding.upsert({
            where: {
              portfolioId_stockId: { portfolioId, stockId: stock.id },
            },
            create: { portfolioId, stockId: stock.id, quantity },
            update: { quantity: { increment: quantity } },
          });
        } else {
          const reduced = await transaction.holding.updateMany({
            where: {
              portfolioId,
              stockId: stock.id,
              quantity: { gte: quantity },
            },
            data: { quantity: { decrement: quantity } },
          });
          if (reduced.count === 0) {
            throw new ApiException(
              409,
              'INSUFFICIENT_SHARES',
              'The portfolio has insufficient shares',
            );
          }
          await transaction.portfolio.update({
            where: { id: portfolioId },
            data: { cashBalance: { increment: amount } },
          });
        }

        const executedAt = new Date();
        const order = await transaction.stockOrder.create({
          data: {
            portfolioId,
            stockId: stock.id,
            side: dto.side,
            quantity,
            executedPrice: stock.currentPrice,
            status: OrderStatus.EXECUTED,
            executedAt,
          },
          include: { stock: { select: { id: true, symbol: true } } },
        });
        await transaction.idempotencyRecord.create({
          data: {
            portfolioId,
            key: idempotencyKey,
            requestHash: hash,
            stockOrderId: order.id,
          },
        });

        return this.toResponse(order, false);
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.findReplay(
          this.prisma,
          portfolioId,
          idempotencyKey,
          hash,
        );
        if (replay) {
          return replay;
        }
      }
      throw error;
    }
  }

  private async findReplay(
    client: Prisma.TransactionClient | PrismaService,
    portfolioId: string,
    key: string,
    hash: string,
  ): Promise<OrderResponse | null> {
    const record = await client.idempotencyRecord.findUnique({
      where: { portfolioId_key: { portfolioId, key } },
      include: {
        stockOrder: {
          include: { stock: { select: { id: true, symbol: true } } },
        },
      },
    });
    if (!record) {
      return null;
    }
    if (record.requestHash !== hash) {
      throw new ApiException(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency-Key was already used with different request content',
      );
    }
    if (!record.stockOrder) {
      throw new ApiException(
        409,
        'IDEMPOTENCY_RESOURCE_MISMATCH',
        'Idempotency-Key belongs to a different operation type',
      );
    }
    return this.toResponse(record.stockOrder, true);
  }

  private toResponse(
    order: OrderWithStock,
    idempotencyReplayed: boolean,
  ): OrderResponse {
    if (!order.executedPrice || !order.executedAt) {
      throw new Error('Executed order is missing execution data');
    }
    return {
      order: {
        id: order.id,
        portfolioId: order.portfolioId,
        stock: order.stock,
        side: order.side,
        quantity: serializeQuantity(order.quantity),
        executedPrice: serializePrice(order.executedPrice),
        amount: serializeMoney(
          calculateOrderAmount(order.quantity, order.executedPrice),
        ),
        status: order.status,
        createdAt: order.createdAt,
        executedAt: order.executedAt,
      },
      idempotencyReplayed,
    };
  }
}
