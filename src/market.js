"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Market {
    base;
    quote;
    pct;
    max;
    symbol;
    price;
    constructor(base, quote, pct, max) {
        this.base = base;
        this.quote = quote;
        this.pct = pct;
        this.max = max;
        this.symbol = `${base}/${quote}`;
        this.price = 0;
    }
    static fromConfig(config) {
        const markets = [];
        config.forEach(marketConfig => {
            marketConfig.assets.forEach(assetConfig => {
                markets.push(new Market(assetConfig.name, marketConfig.quote, assetConfig.pct, assetConfig.max));
            });
        });
        return markets;
    }
}
exports.default = Market;
