export function createId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export interface IdSource {
  next(): string;
}

export function sequentialIds(prefix = 'id'): IdSource {
  let n = 1;
  return {
    next() {
      const id = `${prefix}-${n}`;
      n += 1;
      return id;
    },
  };
}
