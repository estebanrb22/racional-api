import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, Matches } from 'class-validator';
import { QUANTITY_PATTERN } from '../common/decimal';
import { OrderSide } from '../generated/prisma/client';

export class CreateOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  stockId!: string;

  @ApiProperty({ enum: OrderSide, example: OrderSide.BUY })
  @IsEnum(OrderSide)
  side!: OrderSide;

  @ApiProperty({
    example: '1.25000000',
    description: 'Positive quantity with at most eight decimal places',
  })
  @IsString()
  @Matches(QUANTITY_PATTERN, {
    message: 'quantity must be a decimal string with up to eight decimals',
  })
  quantity!: string;
}
