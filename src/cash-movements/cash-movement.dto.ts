import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsString, Matches } from 'class-validator';
import { MONEY_PATTERN } from '../common/decimal';

export class CashMovementDto {
  @ApiProperty({
    example: '1000.00',
    description: 'Positive USD amount with exactly two decimal places',
  })
  @IsString()
  @Matches(MONEY_PATTERN, {
    message: 'amount must be a decimal string with exactly two decimals',
  })
  amount!: string;

  @ApiProperty({ example: '2025-01-15T15:00:00.000Z' })
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'effectiveAt must include a timezone',
  })
  effectiveAt!: string;
}
