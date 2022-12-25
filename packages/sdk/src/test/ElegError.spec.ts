/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { EleganteError } from '../lib/Error';

describe('EleganteError', () => {
  it('have sensible string representation', () => {
    const error = new EleganteError(1337, 'some error message');

    expect(error.toString()).toMatch('EleganteError');
    expect(error.toString()).toMatch('1337');
    expect(error.toString()).toMatch('some error message');
  });

  it('has a proper json representation', () => {
    const error = new EleganteError(1337, 'some error message');
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      message: 'some error message',
      code: 1337,
    });
  });

  it('message can be a string', () => {
    const someRandomError = 'oh no';

    const error = new EleganteError(1337, someRandomError);

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

    const error = new EleganteError(1337, someRandomError);

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      message: '420 time to chill 💨',
      code: 1337,
    });
  });

  it('message can be an Error instance *receiving a string* passed trough some external dependency', () => {
    const someRandomError = new Error('good point');

    const error = new EleganteError(1337, someRandomError);

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

    const error = new EleganteError(1337, someRandomErrorWrong);

    expect(JSON.parse(JSON.stringify(error))).toEqual({
      message: '', // <-- Yeah because we can't parse errors used like that. This is unlikely to happen but here I just want to be cautious as object is still a valid syntax for the Error api (even though docs say it's not)
      code: 1337,
    });
  });
});
