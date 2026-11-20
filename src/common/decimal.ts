import { Prisma } from '../generated/prisma/client';

export type Decimal = Prisma.Decimal;

export const MONEY_PATTERN = /^(?:0|[1-9]\d{0,17})\.\d{2}$/;
export const QUANTITY_PATTERN = /^(?:0|[1-9]\d{0,11})\.\d{1,8}$/;

export function decimal(value: string): Decimal {
  return new Prisma.Decimal(value);
}

export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function calculateOrderAmount(
  quantity: Decimal,
  price: Decimal,
): Decimal {
  return roundMoney(quantity.mul(price));
}

export function serializeMoney(value: Decimal): string {
  return value.toFixed(2);
}

export function serializePrice(value: Decimal): string {
  return value.toFixed(6);
}

export function serializeQuantity(value: Decimal): string {
  return value.toFixed(8);
}
