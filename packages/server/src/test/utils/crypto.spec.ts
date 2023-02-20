import { randomHexString } from '../../lib/utils/crypto';

describe('Crypto Utils', () => {
  it('generate a random hex string', () => {
    expect(randomHexString(2).length).toEqual(2);
    expect(randomHexString(4).length).toEqual(4);
    expect(randomHexString(6).length).toEqual(6);
    expect(randomHexString(8).length).toEqual(8);
  });
});
