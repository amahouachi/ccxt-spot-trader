import { Readable } from "stream";
import { OrderSide } from "./types";
import crypto from 'crypto';
import { logger } from "./logger";
import { fetch, RequestInit, Response } from 'undici';

export const Util = {

  async sleep(ms: number) {
    return new Promise<void>(resolve => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  },
  async resilientFetch(
    input: string | URL,
    init?: RequestInit & { dispatcher?: any },
    maxRetries = 3,
    delayMs = 1000,
    timeoutMs?: number
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method || 'GET';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = timeoutMs
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

      try {
        const response = await fetch(input, {
          ...init,
          signal: controller.signal,
        });

        if (timeout) clearTimeout(timeout);
        return response;
      } catch (error: any) {
        if (timeout) clearTimeout(timeout);

        const isTimeout = error.name === 'AbortError';

        logger.error(
          `${method} ${url} failed (attempt ${attempt}/${maxRetries})` +
          `: ${error.message || error}${isTimeout ? ' [timeout]' : ''}`
        );

        if (isTimeout) {
          // ❌ Timeout: don't retry
          throw error;
        }

        if (attempt < maxRetries) {
          await Util.sleep(delayMs);
        } else {
          throw error;
        }
      }
    }

    throw new Error('Unexpected resilientFetch failure');
  },
  getIpv4(ip: string | string[] | undefined): string {
    if (!ip) return 'unknown';
    if (Array.isArray(ip)) {
      ip = ip[0];
    }
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  },
  executePromises: async (promises: Promise<any>[]) => {
    return await Promise.allSettled(promises);
  },
  isValidSignal: (signal: any): [boolean, string?] => {
    if (!signal) {
      return [false, 'Signal is undefined'];
    }
    for (const field of ['side', 'asset']) {
      if (!signal[field]) {
        return [false, `Missing parameter : ${field}`];
      }
    }
    const { side } = signal;
    if (![OrderSide.buy, OrderSide.sell].includes(side)) {
      return [false, `Invalid value for side : ${side}`];
    }
    return [true];
  },
  splitSymbol(symbol: string) {
    return symbol.split('/');
  },
  signPayload(payload: string, privateKey: string) {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(payload);
    sign.end();
    return sign.sign(privateKey, 'base64');
  },
  async streamToString(stream: Readable): Promise<string> {
    const chunks: any[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf-8");
  }

};
