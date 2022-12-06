/* eslint-disable @typescript-eslint/no-explicit-any */

export class LocalStorage {
  public static get(key: string): any {
    let result: any = window.localStorage.getItem(key);
    try {
      result = JSON.parse(result);
    } catch (err) {
      console.error(err);
      throw new Error('Error parsing JSON');
    }
    return result;
  }

  public static set(key: string, value: any): void {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  public static unset(key: string): void {
    window.localStorage.removeItem(key);
  }
}
