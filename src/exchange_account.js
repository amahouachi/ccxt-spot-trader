"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const exchange_1 = __importDefault(require("./exchange"));
const types_1 = require("./types");
const market_1 = __importDefault(require("./market"));
const logger_1 = require("./logger");
const gas_1 = __importDefault(require("./gas"));
const util_1 = require("./util");
class ExchangeAccount {
    name;
    active;
    exchange;
    markets;
    gas;
    balance = {};
    MIN_ORDER_QUOTE_QTY = 5;
    constructor(name, active, exchange, markets, gas) {
        this.name = name;
        this.active = active;
        this.exchange = exchange;
        this.markets = markets;
        this.gas = gas;
    }
    static fromConfig(config) {
        return new ExchangeAccount(config.name, config.active, exchange_1.default.fromConfig(config.exchange), market_1.default.fromConfig(config.markets), config.gas ? gas_1.default.fromConfig(config.gas) : undefined);
    }
    async refillGas() {
        if (this.gas) {
            const availableGas = this.balance[this.gas.base] - this.gas.reserved;
            const availableQuote = this.balance[this.gas.quote];
            const neededGasQuote = availableQuote * this.gas.rate / 100;
            const gasTicker = await this.exchange._exchange.fetchTicker(this.gas.symbol);
            //@ts-ignore
            const availableGasQuote = availableGas * gasTicker.last;
            if (neededGasQuote > availableGasQuote) {
                const gasQuoteToBuy = neededGasQuote > this.MIN_ORDER_QUOTE_QTY ? neededGasQuote : this.MIN_ORDER_QUOTE_QTY;
                logger_1.logger.debug(`buy gas ${gasQuoteToBuy} ${this.gas.quote} worth of ${this.gas.base}`, this.name);
                await this.exchange.buyMarket(this.gas.symbol, gasQuoteToBuy);
                await util_1.Util.sleep(3000);
                await this.loadBalance();
            }
        }
    }
    async processSignalForMarkets(asset, side, markets) {
        markets.forEach(async (market) => {
            const symbol = market.symbol;
            if (side === types_1.OrderSide.buy) {
                if (this.hasOpenPosition(market)) {
                    logger_1.logger.info(`${symbol} signal ignored since already in position`, this.name);
                    return;
                }
                logger_1.logger.info(`send buy order for ${symbol}`, this.name);
                try {
                    const order = await this.buy(market);
                    logger_1.logger.info(`order ${order.id} sent for ${symbol} : status=${order.status}, filled=${order.filled}, average=${order.average}`, this.name);
                }
                catch (e) {
                    logger_1.logger.error(e.message, this.name);
                }
            }
            else {
                logger_1.logger.info(`send sell order for ${symbol}`, this.name);
                try {
                    const order = await this.sell(market);
                    logger_1.logger.info(`order ${order.id} sent for ${symbol} : status=${order.status}, filled=${order.filled}, average=${order.average}`, this.name);
                }
                catch (e) {
                    logger_1.logger.error(e.message, this.name);
                }
            }
        });
    }
    async loadBalance() {
        logger_1.logger.debug(`Loading balance`, this.name);
        if (this.exchange._exchange.apiKey === "") {
            logger_1.logger.warn(`api key is empty, nothing to load`, this.name);
            return;
        }
        try {
            const balance = await this.exchange._exchange.fetchBalance();
            this.balance = {};
            for (const market of this.markets) {
                //@ts-ignore
                this.balance[market.base] = balance[market.base].total;
                //@ts-ignore
                this.balance[market.quote] = balance[market.quote].total;
            }
            if (this.gas) {
                //@ts-ignore
                this.balance[this.gas.base] = balance[this.gas.base].total;
            }
            logger_1.logger.debug(`Loaded balance : ${JSON.stringify(this.balance)}`, this.name);
        }
        catch (e) {
            logger_1.logger.error(e.message, this.name);
        }
    }
    async loadMarketPrices() {
        const symbols = this.markets.map(market => market.symbol);
        logger_1.logger.debug(`Loading market prices for ${symbols.join(', ')}`, this.name);
        try {
            const tickers = await this.exchange.loadMarketPrices(symbols);
            //@ts-ignore
            this.markets.forEach(market => market.price = tickers[market.symbol].last);
        }
        catch (e) {
            logger_1.logger.error(e.message, this.name);
        }
    }
    async loadMarkets() {
        logger_1.logger.debug(`Loading markets`, this.name);
        try {
            await this.exchange.loadMarkets();
        }
        catch (e) {
            logger_1.logger.error(e.message, this.name);
        }
    }
    getAvailableAsset(asset) {
        if (this.balance[asset]) {
            return this.balance[asset];
        }
        return 0;
    }
    getAvailableBase(market) {
        let availableBase = this.getAvailableAsset(market.base);
        if (availableBase * market.price < this.MIN_ORDER_QUOTE_QTY) {
            availableBase = 0;
        }
        return availableBase;
    }
    getQuoteValue(market) {
        const qty = this.getAvailableBase(market);
        return qty * market.price;
    }
    hasOpenPosition(market) {
        return this.getAvailableBase(market) > 0;
    }
    getAvailableQuote(market) {
        let availableQuote = this.getAvailableAsset(market.quote);
        if (availableQuote < this.MIN_ORDER_QUOTE_QTY) {
            availableQuote = 0;
        }
        return availableQuote;
    }
    findMarkets(asset) {
        const markets = [];
        for (const market of this.markets) {
            if (asset === market.base) {
                markets.push(market);
            }
        }
        return markets;
    }
    getQuoteToReleaseByMarket(quote, totalQuoteToRelease) {
        const quoteToRelease = {};
        for (const market of this.markets.filter(m => m.quote === quote)) {
            if (!this.hasOpenPosition(market)) {
                quoteToRelease[market.symbol] = { qty: 0, value: 0 };
            }
            else {
                const expectedQuoteToRlease = totalQuoteToRelease * market.pct;
                let qty = this.balance[market.base];
                let value = qty * market.price;
                if (value > expectedQuoteToRlease) {
                    value = expectedQuoteToRlease;
                    qty = expectedQuoteToRlease / market.price;
                }
                quoteToRelease[market.symbol] = { qty, value };
            }
        }
        return quoteToRelease;
    }
    calculateQty(market, quote) {
        return quote / market.price;
    }
    getQuoteToAllocate(market) {
        if (this.hasOpenPosition(market)) {
            logger_1.logger.debug(`quote to allocate to ${market.symbol} is 0 since already in position`, this.name);
            return 0;
        }
        const availableQuote = this.getAvailableQuote(market);
        logger_1.logger.debug(`calculate quote to allocate to ${market.symbol} - total quote = ${availableQuote}`, this.name);
        let unavailableMarketsPct = 0;
        this.markets
            .filter(m => m.base !== market.base && m.quote === market.quote)
            .filter(m => this.getAvailableBase(m) > 0)
            .forEach(m => unavailableMarketsPct += m.pct);
        let allocated = market.pct * availableQuote / (1 - unavailableMarketsPct);
        if (allocated > availableQuote) {
            allocated = availableQuote;
        }
        allocated = Number(allocated.toFixed(2));
        logger_1.logger.debug(`quote to allocate to ${market.symbol} = ${allocated}`, this.name);
        return allocated;
    }
    getOrderCost(market) {
        logger_1.logger.debug(`calculate order cost for ${market.symbol}`, this.name);
        let cost = this.getQuoteToAllocate(market);
        if (cost > market.max) {
            logger_1.logger.warn(`cost (${cost}) exceeds market max (${market.max})`, this.name);
            cost = market.max;
        }
        else if (cost < this.MIN_ORDER_QUOTE_QTY) {
            logger_1.logger.warn(`cost (${cost}) is lower than minimum (${this.MIN_ORDER_QUOTE_QTY})`, this.name);
            cost = 0;
        }
        logger_1.logger.debug(`order cost for ${market.symbol} = ${cost}`, this.name);
        return cost;
    }
    async buy(market) {
        const cost = this.getOrderCost(market);
        if (cost === 0) {
            throw Error(`order cost is 0 for ${market.symbol}`);
        }
        logger_1.logger.debug(`send buy order for ${market.symbol}, cost = ${cost}`, this.name);
        return await this.exchange.buyMarket(market.symbol, cost);
    }
    async sell(market, qty = 0) {
        if (qty === 0) {
            qty = this.getAvailableBase(market);
        }
        if (qty === 0) {
            throw Error(`order qty is 0 for ${market.symbol}`);
        }
        logger_1.logger.debug(`send sell order for ${market.symbol}, qty = ${qty}`, this.name);
        return await this.exchange.sellMarket(market.symbol, qty);
    }
}
exports.default = ExchangeAccount;
