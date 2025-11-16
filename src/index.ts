import { server } from "./server";
import configJson from '../config.json';
import { logger } from "./logger";
import { BotConfig, ExchangeAccountConfig, ReleaseQuoteRequest } from "./types";
import ExchangeAccount from "./exchange_account";
import { Util } from "./util";
import {Signal} from "./types";
import TelegramBot from 'node-telegram-bot-api';
import { TradeJournal } from "./journal";
import { S3Client } from "@aws-sdk/client-s3";
import { Forwarder } from "./forwarder";

//@ts-ignore
const config: BotConfig = configJson;

logger.configure({disableConsole: false, disableFile: false, level: 'debug', fileName: 'app.log', rootPath: '.'});

const accountConfigs: ExchangeAccountConfig[] = config.accounts;
const accounts = accountConfigs.map(account => ExchangeAccount.fromConfig(account));
const activeAccounts= accounts.filter(account => account.active);
const s3= config.s3?new S3Client(config.s3):undefined;
const journal= (config.journal && s3)?new TradeJournal(s3, config.journal):undefined;
const forwarder= (config.forwarder && s3)?new Forwarder(s3, config.forwarder):undefined;

async function start(){
  
  const telegramBot = config.telegram?new TelegramBot(config.telegram.token):undefined;

  for(const account of activeAccounts){
    await account.loadMarkets();
    await Util.sleep(500);
    await account.loadMarketPrices();
    await Util.sleep(500);
    await account.loadBalance();
    await Util.sleep(500);
    if(account.useJournal && journal){
      journal.start(account);
    }
  }
  if (forwarder) {
    await forwarder.start();
  }
  
  const endpoints= config.endpoints;

  server.addPostEndpoint(endpoints.signal, async (req: any, res: any) => {
    const signal= req.body as Signal;
    res.json({status: 'ok'});
    logger.info(`Received signal : ${JSON.stringify(signal)}`);
    const [isValidSignal, signalError] = Util.isValidSignal(signal);
    if (!isValidSignal) {
      logger.error(`Invalid signal. ${signalError}`);
      return;
    }
    const {strategy, account : signalAccount, asset,side, tp, sl, price, riskBasedSize: riskBasedSize, reason}= signal;
    activeAccounts.forEach(async account => {
      if(account.strategy!==strategy){
        logger.debug(`signal for a different strategy ${strategy}`, account.name);
        return;
      }
      if(signalAccount && account.name!==signalAccount){
        logger.debug(`signal for a different account ${signalAccount}`, account.name);
        return;
      }
      const markets = account.findMarkets(asset);
      if(markets.length===0){
        logger.debug(`no market for ${asset}`, account.name);
        return;
      }
      if(account.shouldIgnoreSignal(reason)){
        logger.info(`[${account.name}] Signal ignored since reason is ${reason}`);
        return;
      }
      await account.processSignalForMarkets(side, markets, riskBasedSize);
      await Util.sleep(5000);
      await account.loadBalance();
      if (side === "sell") {
        await account.refillGas();
      }
    });
    let assetUsdtMarket= undefined;
    for(const account of activeAccounts){
      assetUsdtMarket = account.findMarkets(asset).find(market => market.quote==='USDT');
      if(assetUsdtMarket){
        break;
      }
    }
    let slPrice= 20;
    if(assetUsdtMarket){
      slPrice= Number((assetUsdtMarket.price*0.9).toFixed(2));
    }
    if(sl){
      slPrice= sl;
    }
    if(telegramBot){
      let telegramMessage= `${asset}/USDT\n${side} at current price\nSL ${slPrice}`;
      if(side==='sell'){
        telegramMessage= `/close ${asset}/USDT`;
      }
      telegramBot.sendMessage(config.telegram!.chatId, telegramMessage);
    }
    if(forwarder){
      forwarder.sendSignal(signal);
    }
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
  server.addPostEndpoint(endpoints.liquidateAccount, async (req: any, res: any) => {
    const request= req.body as {account: string};
    logger.info(`Received request to liquidate all positions for account : ${request.account}`);
    const account= activeAccounts.find(a => a.name===request.account);
    if(account){
      await account.loadBalance();
      await Util.sleep(2000);
      for(const market of account.markets){
        try{
          await account.sell(market); 
        }catch(e: any){
          logger.error(e.message);
        }
      }
      await Util.sleep(2000);
      await account.loadBalance();
      res.json({balance: account.balance});
    }
    res.end();
  });
  server.addPostEndpoint(endpoints.recordTransfer, async (req: any, res: any) => {
    if(!journal){
      res.status(400).json({ error: "Journal not configured" });
      return;
    }
    const request = req.body as {
      account: string;
      type: "deposit" | "withdrawal";
      amount: number;
      date?: string;
    };

    logger.info(`Received transfer record request: ${JSON.stringify(request)}`);

    const account = activeAccounts.find((a) => a.name === request.account);
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    if(!account.useJournal){
      res.status(400).json({ error: "Journal not active for this account" });
      return;
    }

    try {
      await journal.recordTransfer(account, request.type, request.amount, request.date);
      res.json({ status: "ok", recorded: { ...request } });
    } catch (err) {
      res.status(500).json({ error: "Failed to record transfer" });
    }
  });
  server.addGetEndpoint(endpoints.balances, async (req: any, res: any) => {
    const balances= [];
    for(const account of activeAccounts){
      await account.loadMarketPrices();
      await Util.sleep(500);
      await account.loadBalance();
      balances.push({account: account.name, balance: account.balance});
    }
    res.json(balances);
    res.end();
  });

  await server.start(config.port);
}

start();
