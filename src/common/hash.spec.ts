import { requestHash } from './hash';

describe('requestHash', () => {
  it('does not depend on key order', () => {
    expect(requestHash({ a: '1', b: '2' })).toBe(
      requestHash({ b: '2', a: '1' }),
    );
  });

  it('changes when content changes', () => {
    expect(requestHash({ amount: '10.00' })).not.toBe(
      requestHash({ amount: '20.00' }),
    );
  });

  it('returns a 64 character hex digest', () => {
    expect(requestHash({ a: '1' })).toMatch(/^[0-9a-f]{64}$/);
  });
});
