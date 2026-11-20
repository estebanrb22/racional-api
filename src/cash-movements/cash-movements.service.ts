import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import { decimal, serializeMoney } from '../common/decimal';
import { requestHash } from '../common/hash';
import {
  CashMovement,
  CashMovementType,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CashMovementDto } from './cash-movement.dto';

type CashMovementResponse = {
  movement: {
    id: string;
    portfolioId: string;
    type: CashMovementType;
    amount: string;
    effectiveAt: Date;
    createdAt: Date;
  };
  idempotencyReplayed: boolean;
};

@Injectable()
export class CashMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  deposit(
    portfolioId: string,
    dto: CashMovementDto,
    idempotencyKey: string,
  ): Promise<CashMovementResponse> {
    return this.execute(
      portfolioId,
      CashMovementType.DEPOSIT,
      dto,
      idempotencyKey,
    );
  }

  withdrawal(
    portfolioId: string,
    dto: CashMovementDto,
    idempotencyKey: string,
  ): Promise<CashMovementResponse> {
    return this.execute(
      portfolioId,
      CashMovementType.WITHDRAWAL,
      dto,
      idempotencyKey,
    );
  }

  private async execute(
    portfolioId: string,
    type: CashMovementType,
    dto: CashMovementDto,
    idempotencyKey: string,
  ): Promise<CashMovementResponse> {
    const amount = decimal(dto.amount);
    if (!amount.isPositive()) {
      throw new ApiException(
        400,
        'INVALID_AMOUNT',
        'Amount must be greater than zero',
      );
    }

    const effectiveAt = new Date(dto.effectiveAt);
    if (effectiveAt.getTime() > Date.now()) {
      throw new ApiException(
        400,
        'FUTURE_EFFECTIVE_DATE',
        'effectiveAt cannot be in the future',
      );
    }

    const hash = requestHash({
      operation: type,
      portfolioId,
      amount: amount.toFixed(2),
      effectiveAt: effectiveAt.toISOString(),
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

        const portfolio = await transaction.portfolio.findUnique({
          where: { id: portfolioId },
          select: { id: true },
        });
        if (!portfolio) {
          throw new ApiException(
            404,
            'PORTFOLIO_NOT_FOUND',
            'Portfolio not found',
          );
        }

        if (type === CashMovementType.DEPOSIT) {
          await transaction.portfolio.update({
            where: { id: portfolioId },
            data: { cashBalance: { increment: amount } },
          });
        } else {
          const updated = await transaction.portfolio.updateMany({
            where: { id: portfolioId, cashBalance: { gte: amount } },
            data: { cashBalance: { decrement: amount } },
          });
          if (updated.count === 0) {
            throw new ApiException(
              409,
              'INSUFFICIENT_FUNDS',
              'The portfolio has insufficient cash',
            );
          }
        }

        const movement = await transaction.cashMovement.create({
          data: { portfolioId, type, amount, effectiveAt },
        });
        await transaction.idempotencyRecord.create({
          data: {
            portfolioId,
            key: idempotencyKey,
            requestHash: hash,
            cashMovementId: movement.id,
          },
        });

        return this.toResponse(movement, false);
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
  ): Promise<CashMovementResponse | null> {
    const record = await client.idempotencyRecord.findUnique({
      where: { portfolioId_key: { portfolioId, key } },
      include: { cashMovement: true },
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
    if (!record.cashMovement) {
      throw new ApiException(
        409,
        'IDEMPOTENCY_RESOURCE_MISMATCH',
        'Idempotency-Key belongs to a different operation type',
      );
    }
    return this.toResponse(record.cashMovement, true);
  }

  private toResponse(
    movement: CashMovement,
    idempotencyReplayed: boolean,
  ): CashMovementResponse {
    return {
      movement: {
        id: movement.id,
        portfolioId: movement.portfolioId,
        type: movement.type,
        amount: serializeMoney(movement.amount),
        effectiveAt: movement.effectiveAt,
        createdAt: movement.createdAt,
      },
      idempotencyReplayed,
    };
  }
}
