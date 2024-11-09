"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Gas {
    base;
    quote;
    rate;
    reserved;
    symbol;
    constructor(base, quote, rate, reserved) {
        this.base = base;
        this.quote = quote;
        this.rate = rate;
        this.reserved = reserved;
        this.symbol = `${base}/${quote}`;
    }
    static fromConfig(config) {
        return new Gas(config.base, config.quote, config.rate, config.reserved);
    }
}
exports.default = Gas;
