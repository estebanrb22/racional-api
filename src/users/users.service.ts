import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import {
  calculateOrderAmount,
  serializeMoney,
  serializePrice,
  serializeQuantity,
} from '../common/decimal';
import { OrderStatus, Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './update-user.dto';

type UserResponse = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MovementResponse = {
  id: string;
  portfolioId: string;
  category: 'CASH' | 'STOCK_ORDER';
  type: string;
  amount: string;
  occurredAt: Date;
  recordedAt: Date;
  stock?: { id: string; symbol: string };
  quantity?: string;
  executedPrice?: string;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(userId: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiException(404, 'USER_NOT_FOUND', 'User not found');
    }
    return this.toResponse(user);
  }

  async update(userId: string, dto: UpdateUserDto): Promise<UserResponse> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new ApiException(
        400,
        'EMPTY_UPDATE',
        'At least one editable field is required',
      );
    }

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
        },
      });
      return this.toResponse(user);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new ApiException(404, 'USER_NOT_FOUND', 'User not found');
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ApiException(
          409,
          'EMAIL_ALREADY_EXISTS',
          'Email is already in use',
        );
      }
      throw error;
    }
  }

  async movements(
    userId: string,
    limit: number,
  ): Promise<{ data: MovementResponse[]; limit: number }> {
    return this.prisma.$transaction(
      async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (!user) {
          throw new ApiException(404, 'USER_NOT_FOUND', 'User not found');
        }

        const portfolios = await transaction.portfolio.findMany({
          where: { userId },
          select: { id: true },
        });
        const portfolioIds = portfolios.map((portfolio) => portfolio.id);
        if (portfolioIds.length === 0) {
          return { data: [], limit };
        }

        const [cashMovements, orders] = await Promise.all([
          transaction.cashMovement.findMany({
            where: { portfolioId: { in: portfolioIds } },
            orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
            take: limit,
          }),
          transaction.stockOrder.findMany({
            where: {
              portfolioId: { in: portfolioIds },
              status: OrderStatus.EXECUTED,
            },
            include: { stock: { select: { id: true, symbol: true } } },
            orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
            take: limit,
          }),
        ]);

        const cash: MovementResponse[] = cashMovements.map((movement) => ({
          id: movement.id,
          portfolioId: movement.portfolioId,
          category: 'CASH',
          type: movement.type,
          amount: serializeMoney(movement.amount),
          occurredAt: movement.effectiveAt,
          recordedAt: movement.createdAt,
        }));

        const stock: MovementResponse[] = orders.flatMap((order) => {
          if (!order.executedAt || !order.executedPrice) {
            return [];
          }
          return [
            {
              id: order.id,
              portfolioId: order.portfolioId,
              category: 'STOCK_ORDER' as const,
              type: order.side,
              amount: serializeMoney(
                calculateOrderAmount(order.quantity, order.executedPrice),
              ),
              occurredAt: order.executedAt,
              recordedAt: order.createdAt,
              stock: order.stock,
              quantity: serializeQuantity(order.quantity),
              executedPrice: serializePrice(order.executedPrice),
            },
          ];
        });

        const data = [...cash, ...stock]
          .sort((first, second) => {
            const byDate =
              second.occurredAt.getTime() - first.occurredAt.getTime();
            return byDate !== 0 ? byDate : second.id.localeCompare(first.id);
          })
          .slice(0, limit);

        return { data, limit };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private toResponse(user: User): UserResponse {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
