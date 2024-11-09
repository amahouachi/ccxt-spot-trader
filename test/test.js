"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const config_json_1 = __importDefault(require("./config.json"));
const types_1 = require("../src/types");
const exchange_account_1 = __importDefault(require("../src/exchange_account"));
const market_1 = __importDefault(require("../src/market"));
const util_1 = require("../src/util");
(0, globals_1.describe)("Test balance and order cost operations", () => {
    const accountConfigs = config_json_1.default.accounts;
    const accounts = accountConfigs.map(account => exchange_account_1.default.fromConfig(account));
    const account = accounts[0];
    account.markets.forEach(market => {
        market.price = 1000;
        account.balance[market.base] = 200;
        account.balance[market.quote] = 500;
    });
    (0, globals_1.it)("getAvailableBase should return all base if > 10", () => {
        account.markets.forEach(market => {
            (0, globals_1.expect)(account.getAvailableBase(market)).toEqual(200);
        });
    });
    (0, globals_1.it)("getAvailableBase should return zero if < 10", () => {
        account.markets.forEach(market => {
            market.price = 0.01;
            account.balance[market.base] = 200;
            account.balance[market.quote] = 500;
        });
        account.markets.forEach(market => {
            (0, globals_1.expect)(account.getAvailableBase(market)).toEqual(0);
        });
    });
    (0, globals_1.it)("simple case - all quote is available", () => {
        account.balance["BTC"] = 0;
        account.balance["ETH"] = 0;
        account.balance["SOL"] = 0;
        account.balance["USDT"] = 1000;
        (0, globals_1.expect)(account.getOrderCost(new market_1.default("ETH", "USDT", 0.2, 200000))).toEqual(200);
        (0, globals_1.expect)(account.getQuoteToAllocate(new market_1.default("ETH", "USDT", 0.2, 200000))).toEqual(200);
        account.balance["USDT"] = 10000000;
        (0, globals_1.expect)(account.getOrderCost(new market_1.default("ETH", "USDT", 0.2, 200000))).toEqual(200000);
    });
    (0, globals_1.it)("some assets are already bought", () => {
        account.balance["BTC"] = 35;
        account.balance["ETH"] = 0;
        account.balance["SOL"] = 0;
        account.balance["USDT"] = 600;
        account.markets = [];
        const ethusdtMarket = new market_1.default("ETH", "USDT", 0.4, 200000);
        const btcusdtMarket = new market_1.default("BTC", "USDT", 0.4, 200000);
        const solusdtMarket = new market_1.default("SOL", "USDT", 0.2, 200000);
        ethusdtMarket.price = 1000;
        btcusdtMarket.price = 1000;
        solusdtMarket.price = 1000;
        account.markets.push(ethusdtMarket);
        account.markets.push(btcusdtMarket);
        account.markets.push(solusdtMarket);
        (0, globals_1.expect)(account.getOrderCost(ethusdtMarket)).toEqual(400);
        (0, globals_1.expect)(account.getOrderCost(solusdtMarket)).toEqual(200);
        (0, globals_1.expect)(account.getOrderCost(btcusdtMarket)).toEqual(0);
        account.balance["SOL"] = 33223;
        account.balance["USDT"] = 400;
        (0, globals_1.expect)(account.getOrderCost(ethusdtMarket)).toEqual(400);
    });
});
(0, globals_1.describe)("Test release quote", () => {
    const accountConfigs = config_json_1.default.accounts;
    const accounts = accountConfigs.map(account => exchange_account_1.default.fromConfig(account));
    const account = accounts[0];
    account.balance["BTC"] = 1;
    account.balance["ETH"] = 1;
    account.balance["SOL"] = 1;
    account.balance["USDT"] = 600;
    account.markets = [];
    const ethusdtMarket = new market_1.default("ETH", "USDT", 0.4, 200000);
    const btcusdtMarket = new market_1.default("BTC", "USDT", 0.4, 200000);
    const solusdtMarket = new market_1.default("SOL", "USDT", 0.2, 200000);
    ethusdtMarket.price = 1000;
    btcusdtMarket.price = 1000;
    solusdtMarket.price = 10;
    account.markets.push(ethusdtMarket);
    account.markets.push(btcusdtMarket);
    account.markets.push(solusdtMarket);
    console.log(account.getQuoteToReleaseByMarket("USDT", 200));
});
(0, globals_1.describe)("Test support signal", () => {
    const accountConfigs = config_json_1.default.accounts;
    const accounts = accountConfigs.map(account => exchange_account_1.default.fromConfig(account));
    const account = accounts[0];
    const ethusdtMarket = new market_1.default("ETH", "USDT", 0.4, 200000);
    account.markets = [ethusdtMarket];
    const signal = { asset: "ETH", side: types_1.OrderSide.buy };
    (0, globals_1.it)("test support buy signal if asset is in supported markets", () => {
        (0, globals_1.expect)(account.findMarkets(signal.asset).length).toBeGreaterThan(0);
    });
    (0, globals_1.it)("test not support buy signal if asset is not in supported markets", () => {
        signal.asset = "ETH2";
        (0, globals_1.expect)(account.findMarkets(signal.asset).length).toEqual(0);
    });
});
(0, globals_1.describe)("Test real exchange calls", () => {
    const accountConfigs = config_json_1.default.accounts;
    const accounts = accountConfigs.map(account => exchange_account_1.default.fromConfig(account));
    (0, globals_1.it)("test support buy signal if asset is in supported markets", async () => {
        for (const account of accounts) {
            await account.loadMarkets();
            await util_1.Util.sleep(1000);
            await account.loadMarketPrices();
            (0, globals_1.expect)(account.markets[0].price).toBeGreaterThan(0);
        }
    }, 20000);
});
