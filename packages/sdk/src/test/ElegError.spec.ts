import { ElegError } from '../lib/ElegError';

describe('ElegError', () => {
  it('have sensible string representation', () => {
    const error = new ElegError(3135, 'some error message');

    expect(error.toString()).toMatch('EleganteError');
    expect(error.toString()).toMatch('3135');
    expect(error.toString()).toMatch('some error message');
  });

  it('has a proper json representation', () => {
    const error = new ElegError(3135, 'some error message');
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      message: 'some error message',
      code: 3135,
    });
  });

  it('message can be a string', () => {
    const someRandomError = 'oh no';

    const error = new ElegError(3135, someRandomError);

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      message: someRandomError,
      code: 3135,
    });
  });

  it('message can be an object passed trough some external dependency', () => {
    const someRandomError = {
      code: '420',
      message: 'time to chill',
      status: '💨',
    };

    const error = new ElegError(3135, someRandomError);

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      message: '420 time to chill 💨',
      code: 3135,
    });
  });

  it('message can be an Error instance *receiving a string* passed trough some external dependency', () => {
    const someRandomError = new Error('good point');

    const error = new ElegError(3135, someRandomError);

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      message: 'Error: good point',
      code: 3135,
    });
  });

  it('message can be an Error instance *receiving an object* passed trough some external dependency', () => {
    const someRandomErrorWrong = new Error({
      code: 'WRONG',
      message: 'this is not how errors should be handled',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const error = new ElegError(3135, someRandomErrorWrong);

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      message: '', // <-- Yeah because we can't parse errors used like that. This is unlikely to happen but here I just want to be cautious as object is still a valid syntax for the Error api (even though docs say it's not)
      code: 3135,
    });
  });
});
