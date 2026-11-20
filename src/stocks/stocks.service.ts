import { Injectable } from '@nestjs/common';
import { serializePrice } from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StocksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const stocks = await this.prisma.stock.findMany({
      orderBy: { symbol: 'asc' },
    });
    return stocks.map((stock) => ({
      id: stock.id,
      symbol: stock.symbol,
      companyName: stock.companyName,
      currency: stock.currency,
      currentPrice: serializePrice(stock.currentPrice),
      priceUpdatedAt: stock.priceUpdatedAt,
    }));
  }
}
