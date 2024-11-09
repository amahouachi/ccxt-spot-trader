"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
const config_json_1 = __importDefault(require("../config.json"));
const logger_1 = require("./logger");
const exchange_account_1 = __importDefault(require("./exchange_account"));
const util_1 = require("./util");
logger_1.logger.configure({ disableConsole: false, disableFile: false, level: 'debug', fileName: 'app.log', rootPath: '.' });
const accountConfigs = config_json_1.default.accounts;
const accounts = accountConfigs.map(account => exchange_account_1.default.fromConfig(account));
const activeAccounts = accounts.filter(account => account.active);
async function start() {
    for (const account of activeAccounts) {
        await account.loadMarkets();
        await util_1.Util.sleep(500);
        await account.loadBalance();
        await util_1.Util.sleep(500);
        await account.loadMarketPrices();
        await util_1.Util.sleep(500);
    }
    const endpoints = config_json_1.default.endpoints;
    server_1.server.addPostEndpoint(endpoints.signal, async (req, res) => {
        const signal = req.body;
        res.send('');
        res.end();
        logger_1.logger.info(`Received signal : ${JSON.stringify(signal)}`);
        const [isValidSignal, signalError] = util_1.Util.isValidSignal(signal);
        if (!isValidSignal) {
            logger_1.logger.error(`Invalid signal. ${signalError}`);
            return;
        }
        const { asset, side } = signal;
        activeAccounts.forEach(async (account) => {
            const markets = account.findMarkets(asset);
            if (markets.length === 0) {
                logger_1.logger.debug(`no market for ${asset}`, account.name);
                return;
            }
            await account.processSignalForMarkets(asset, side, markets);
            await util_1.Util.sleep(5000);
            await account.loadBalance();
            if (side === "sell") {
                await account.refillGas();
            }
        });
    });
    server_1.server.addPostEndpoint(endpoints.releaseQuote, async (req, res) => {
        const request = req.body;
        logger_1.logger.info(`Received request to release quote : ${JSON.stringify(request)}`);
        const account = activeAccounts.find(a => a.name === request.account);
        if (account) {
            await account.loadBalance();
            await util_1.Util.sleep(2000);
            await account.loadMarketPrices();
            await util_1.Util.sleep(2000);
            const quoteToRelease = account.getQuoteToReleaseByMarket(request.quote, request.qty);
            logger_1.logger.debug(JSON.stringify(quoteToRelease));
            const markets = account.markets.filter(market => quoteToRelease[market.symbol].qty > 0);
            for (const market of markets) {
                logger_1.logger.info(`Selling ${quoteToRelease[market.symbol].qty} ${market.base} to release ${quoteToRelease[market.symbol].value} ${market.quote}`);
                await account.sell(market, quoteToRelease[market.symbol].qty);
            }
            await util_1.Util.sleep(2000);
            await account.loadBalance();
            res.json({ quoteToRelease, balance: account.balance });
        }
        res.end();
    });
    server_1.server.addGetEndpoint(endpoints.balances, async (req, res) => {
        for (const account of activeAccounts) {
            await account.loadBalance();
        }
        res.json(activeAccounts.map(account => {
            return {
                account: account.name,
                balance: account.balance
            };
        }));
        res.end();
    });
    await server_1.server.start(config_json_1.default.port);
}
start();
