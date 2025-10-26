'use client';

import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  // @ts-ignore
  window.Buffer = Buffer;
  // @ts-ignore
  window.global = window;
  // @ts-ignore
  window.process = window.process || { env: {} };
  
  // Polyfill for writeUint32BE (newer method name)
  if (Buffer.prototype && !Buffer.prototype.writeUint32BE) {
    // @ts-ignore
    Buffer.prototype.writeUint32BE = function(value: number, offset?: number) {
      offset = offset || 0;
      // Use the older writeUInt32BE method
      this.writeUInt32BE(value, offset);
      return offset + 4;
    };
  }
  
  // Polyfill for readUint32BE
  if (Buffer.prototype && !Buffer.prototype.readUint32BE) {
    // @ts-ignore
    Buffer.prototype.readUint32BE = function(offset?: number) {
      offset = offset || 0;
      return this.readUInt32BE(offset);
    };
  }
}

export {};
