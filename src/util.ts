import { OrderSide } from "./types";
import crypto from 'crypto';

export const Util= {

  async sleep(ms: number){
    return new Promise<void>(resolve => {
      setTimeout(() => {
        resolve()
      },ms)
    })
  },
  executePromises: async (promises: Promise<any>[]) => {
    return await Promise.allSettled(promises);
  },
  isValidSignal: (signal: any) : [boolean, string?] => {
    for (const field of ['side', 'asset']) {
      if (!signal[field]) {
        return [false, `Missing parameter : ${field}`];
      }
    }
    const {side} = signal;
    if (![OrderSide.buy, OrderSide.sell].includes(side)) {
      return [false, `Invalid value for side : ${side}`];
    }
    return [true];
  },
  splitSymbol(symbol: string){
    return symbol.split('/');
  },
  signPayload(payload: string, privateKey: string) {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(payload);
    sign.end();
    return sign.sign(privateKey, 'base64');
  }

}
