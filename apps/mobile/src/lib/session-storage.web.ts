export const sessionStorage =
  typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage;
