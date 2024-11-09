"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const ccxt = __importStar(require("ccxt"));
class Exchange {
    name;
    _exchange;
    static cachedExchanges = {};
    constructor(name, config) {
        this.name = name;
        //@ts-ignore
        this._exchange = new ccxt.pro[name]({ ...config, enableRateLimit: true });
    }
    static fromConfig(config) {
        return new Exchange(config.name, config.config);
    }
    async loadMarketPrices(symbols) {
        return await this._exchange.fetchTickers(symbols);
    }
    async loadMarkets() {
        const exchangeName = this._exchange.id;
        if (!Exchange.cachedExchanges[exchangeName]) {
            await this._exchange.loadMarkets();
            Exchange.cachedExchanges[exchangeName] = this;
        }
        else {
            //share loaded data across accounts with same exchange
            //https://github.com/ccxt/ccxt/blob/master/examples/js/shared-load-markets.js
            const cachedExchange = Exchange.cachedExchanges[exchangeName];
            ['ids', 'markets', 'markets_by_id', 'currencies', 'currencies_by_id', 'baseCurrencies', 'quoteCurrencies', 'symbols',].forEach((key) => {
                // @ts-ignore
                this._exchange[key] = cachedExchange._exchange[key];
            });
        }
    }
    async buyMarket(symbol, cost) {
        return await this._exchange.createMarketBuyOrderWithCost(symbol, cost);
    }
    async sellMarket(symbol, qty) {
        return await this._exchange.createMarketSellOrder(symbol, Number(this.roundAmount(symbol, qty)));
    }
    roundAmount(symbol, amount) {
        return this._exchange.amountToPrecision(symbol, amount);
    }
}
exports.default = Exchange;
