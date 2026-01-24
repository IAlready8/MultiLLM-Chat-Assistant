// lib/runtime.ts
export const isServer = typeof window === "undefined";

export function b64encode(u8: Uint8Array): string {
  if (isServer) return Buffer.from(u8).toString("base64");
  let str = "";
  for (const b of u8) str += String.fromCharCode(b);
  // @ts-ignore atob/btoa exist in browser
  return btoa(str);
}

export function b64decode(b64: string): Uint8Array {
  if (isServer) return new Uint8Array(Buffer.from(b64, "base64"));
  // @ts-ignore
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8encode(s: string): Uint8Array {
  if (isServer) return new TextEncoder().encode(s);
  return new TextEncoder().encode(s);
}

export function utf8decode(u8: Uint8Array): string {
  return new TextDecoder().decode(u8);
}