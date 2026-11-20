import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IdempotencyKeyPipe } from '../common/idempotency-key.pipe';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { CreateOrderDto } from './create-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@Controller('portfolios/:portfolioId/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Execute a buy or sell order at current price' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ description: 'Order executed' })
  @ApiConflictResponse({
    description: 'Insufficient cash, shares or idempotency conflict',
  })
  create(
    @Param('portfolioId', new ParseUUIDPipe()) portfolioId: string,
    @IdempotencyKey(IdempotencyKeyPipe) idempotencyKey: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orders.create(portfolioId, dto, idempotencyKey);
  }
}
