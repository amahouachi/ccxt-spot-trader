"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Util = void 0;
const types_1 = require("./types");
exports.Util = {
    async sleep(ms) {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve();
            }, ms);
        });
    },
    executePromises: async (promises) => {
        return await Promise.allSettled(promises);
    },
    isValidSignal: (signal) => {
        for (const field of ['side', 'asset']) {
            if (!signal[field]) {
                return [false, `Missing parameter : ${field}`];
            }
        }
        const { side } = signal;
        if (![types_1.OrderSide.buy, types_1.OrderSide.sell].includes(side)) {
            return [false, `Invalid value for side : ${side}`];
        }
        return [true];
    },
    splitSymbol(symbol) {
        return symbol.split('/');
    }
};
