import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import {
  roundMoney,
  serializeMoney,
  serializePrice,
  serializeQuantity,
} from '../common/decimal';
import { Portfolio, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePortfolioDto } from './update-portfolio.dto';

@Injectable()
export class PortfoliosService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(portfolioId: string) {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
    });
    if (!portfolio) {
      throw new ApiException(404, 'PORTFOLIO_NOT_FOUND', 'Portfolio not found');
    }
    return this.toResponse(portfolio);
  }

  async update(portfolioId: string, dto: UpdatePortfolioDto) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new ApiException(
        400,
        'EMPTY_UPDATE',
        'At least one editable field is required',
      );
    }

    try {
      const portfolio = await this.prisma.portfolio.update({
        where: { id: portfolioId },
        data: { name: dto.name, description: dto.description },
      });
      return this.toResponse(portfolio);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new ApiException(
          404,
          'PORTFOLIO_NOT_FOUND',
          'Portfolio not found',
        );
      }
      throw error;
    }
  }

  async valuation(portfolioId: string) {
    return this.prisma.$transaction(
      async (transaction) => {
        const portfolio = await transaction.portfolio.findUnique({
          where: { id: portfolioId },
          include: {
            holdings: {
              where: { quantity: { gt: 0 } },
              include: { stock: true },
              orderBy: { stock: { symbol: 'asc' } },
            },
          },
        });
        if (!portfolio) {
          throw new ApiException(
            404,
            'PORTFOLIO_NOT_FOUND',
            'Portfolio not found',
          );
        }

        let positionsValue = new Prisma.Decimal(0);
        const positions = portfolio.holdings.map((holding) => {
          const marketValue = roundMoney(
            holding.quantity.mul(holding.stock.currentPrice),
          );
          positionsValue = positionsValue.add(marketValue);
          return {
            stockId: holding.stockId,
            symbol: holding.stock.symbol,
            quantity: serializeQuantity(holding.quantity),
            currentPrice: serializePrice(holding.stock.currentPrice),
            marketValue: serializeMoney(marketValue),
            priceUpdatedAt: holding.stock.priceUpdatedAt,
          };
        });
        const totalValue = portfolio.cashBalance.add(positionsValue);

        return {
          portfolioId: portfolio.id,
          baseCurrency: portfolio.baseCurrency,
          asOf: new Date(),
          cashBalance: serializeMoney(portfolio.cashBalance),
          positionsValue: serializeMoney(positionsValue),
          totalValue: serializeMoney(totalValue),
          positions,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private toResponse(portfolio: Portfolio) {
    return {
      id: portfolio.id,
      userId: portfolio.userId,
      name: portfolio.name,
      description: portfolio.description,
      baseCurrency: portfolio.baseCurrency,
      cashBalance: serializeMoney(portfolio.cashBalance),
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt,
    };
  }
}
