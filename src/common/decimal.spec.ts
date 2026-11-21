import {
  calculateOrderAmount,
  decimal,
  MONEY_PATTERN,
  QUANTITY_PATTERN,
  serializeMoney,
  serializePrice,
  serializeQuantity,
} from './decimal';

describe('decimal helpers', () => {
  it('rounds order amounts half up to cents', () => {
    expect(
      calculateOrderAmount(decimal('0.5'), decimal('0.010000')).toFixed(2),
    ).toBe('0.01');
    expect(
      calculateOrderAmount(decimal('1.25'), decimal('228.45')).toFixed(2),
    ).toBe('285.56');
  });

  it('serializes with fixed financial precision', () => {
    expect(serializeMoney(decimal('10'))).toBe('10.00');
    expect(serializePrice(decimal('1.5'))).toBe('1.500000');
    expect(serializeQuantity(decimal('2'))).toBe('2.00000000');
  });

  it('accepts only canonical decimal strings', () => {
    expect(MONEY_PATTERN.test('1000.00')).toBe(true);
    expect(MONEY_PATTERN.test('1000')).toBe(false);
    expect(MONEY_PATTERN.test('01.00')).toBe(false);
    expect(QUANTITY_PATTERN.test('0.12345678')).toBe(true);
    expect(QUANTITY_PATTERN.test('0.123456789')).toBe(false);
  });
});
