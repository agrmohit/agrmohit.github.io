/** Orders strings by UTF-16 code unit, the same on every machine; localeCompare would depend on the locale. */
export const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
