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
import { CashMovementDto } from './cash-movement.dto';
import { CashMovementsService } from './cash-movements.service';

@ApiTags('Cash movements')
@Controller('portfolios/:portfolioId')
export class CashMovementsController {
  constructor(private readonly cashMovements: CashMovementsService) {}

  @Post('deposits')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Deposit cash atomically' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ description: 'Deposit executed' })
  deposit(
    @Param('portfolioId', new ParseUUIDPipe()) portfolioId: string,
    @IdempotencyKey(IdempotencyKeyPipe) idempotencyKey: string,
    @Body() dto: CashMovementDto,
  ) {
    return this.cashMovements.deposit(portfolioId, dto, idempotencyKey);
  }

  @Post('withdrawals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Withdraw cash atomically' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ description: 'Withdrawal executed' })
  @ApiConflictResponse({ description: 'Insufficient funds' })
  withdrawal(
    @Param('portfolioId', new ParseUUIDPipe()) portfolioId: string,
    @IdempotencyKey(IdempotencyKeyPipe) idempotencyKey: string,
    @Body() dto: CashMovementDto,
  ) {
    return this.cashMovements.withdrawal(portfolioId, dto, idempotencyKey);
  }
}
