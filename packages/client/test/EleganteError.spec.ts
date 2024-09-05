/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

import { BordaError, ErrorCode } from '../src/lib/Error';

describe('BordaError', () => {
  it('has sensible string representation', () => {
    const error = new BordaError(1337 as ErrorCode, 'some error message');

    expect(error.toString()).toMatch('Error 1337: some error message');
  });

  it('has a proper json representation', () => {
    const error = new BordaError(1337 as ErrorCode, 'some error message');
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      message: 'some error message',
      code: 1337,
    });
  });

  it('message can be a string', () => {
    const someRandomError = 'oh no';

    const error = new BordaError(1337 as ErrorCode, someRandomError);

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      message: someRandomError,
      code: 1337,
    });
  });

  it('message can be an object passed trough some external dependency', () => {
    const someRandomError = {
      code: '420',
      message: 'time to chill',
      status: '💨',
    };

    const error = new BordaError(1337 as ErrorCode, someRandomError);

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      message: '420 time to chill 💨',
      code: 1337,
    });
  });

  it('message can be an Error instance *receiving a string* passed trough some external dependency', () => {
    const someRandomError = new Error('good point');

    const error = new BordaError(1337 as ErrorCode, someRandomError);

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      message: 'Error: good point',
      code: 1337,
    });
  });

  it('message can be an Error instance *receiving an object* passed trough some external dependency', () => {
    const someRandomErrorWrong = new Error({
      code: 'WRONG',
      message: 'this is not how errors should be handled',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const error = new BordaError(1337 as ErrorCode, someRandomErrorWrong);

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      message: '',
      code: 1337,
    });
  });
});
