import { server } from "./server";
import config from '../config.json';
import { logger } from "./logger";
import { BuyRequest, ExchangeAccountConfig, OrderSide, ReleaseQuoteRequest } from "./types";
import ExchangeAccount from "./exchange_account";
import { Util } from "./util";
import Signal from "./signal";

logger.configure({disableConsole: false, disableFile: false, level: 'debug', fileName: 'app.log', rootPath: '.'});

const accountConfigs: ExchangeAccountConfig[] = config.accounts;
const accounts = accountConfigs.map(account => ExchangeAccount.fromConfig(account));
const activeAccounts= accounts.filter(account => account.active);

async function start(){

  for(const account of activeAccounts){
    await account.loadMarkets();
    await Util.sleep(500);
    await account.loadBalance();
    await Util.sleep(500);
    await account.loadMarketPrices();
    await Util.sleep(500);
  }
  
  const endpoints= config.endpoints;

  server.addPostEndpoint(endpoints.signal, async (req: any, res: any) => {
    const signal= req.body as Signal;
    res.send('');
    res.end();
    logger.info(`Received signal : ${JSON.stringify(signal)}`);
    const [isValidSignal, signalError] = Util.isValidSignal(signal);
    if (!isValidSignal) {
      logger.error(`Invalid signal. ${signalError}`);
      return;
    }
    const {asset,side}= signal;
    activeAccounts.forEach(async account => {
      const markets = account.findMarkets(asset);
      if(markets.length===0){
        logger.debug(`no market for ${asset}`, account.name);
        return;
      }
      await account.processSignalForMarkets(asset, side, markets);
      await Util.sleep(5000);
      await account.loadBalance();
      if (side === "sell") {
        await account.refillGas();
      }
    })
  });
  server.addPostEndpoint(endpoints.releaseQuote, async (req: any, res: any) => {
    const request= req.body as ReleaseQuoteRequest;
    logger.info(`Received request to release quote : ${JSON.stringify(request)}`);
    const account= activeAccounts.find(a => a.name===request.account);
    if(account){
      await account.loadBalance();
      await Util.sleep(2000);
      await account.loadMarketPrices();
      await Util.sleep(2000);
      const quoteToRelease= account.getQuoteToReleaseByMarket(request.quote, request.qty);
      logger.debug(JSON.stringify(quoteToRelease));
      const markets= account.markets.filter(market => quoteToRelease[market.symbol].qty > 0);
      for(const market of markets){
        logger.info(`Selling ${quoteToRelease[market.symbol].qty} ${market.base} to release ${quoteToRelease[market.symbol].value} ${market.quote}`);
        await account.sell(market, quoteToRelease[market.symbol].qty);
      }
      await Util.sleep(2000);
      await account.loadBalance();
      res.json({quoteToRelease, balance: account.balance});
    }
    res.end();
  });
  server.addGetEndpoint(endpoints.balances, async (req: any, res: any) => {
    for(const account of activeAccounts){
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

  await server.start(config.port);
}

start();
