import Exchange from "./exchange";
import {AccountBalance, ExchangeAccountConfig, OrderSide, QuoteToRelease} from "./types";
import Signal from "./signal";
import Market from './market';
import { logger } from "./logger";
import { Order } from "ccxt";
import Gas from "./gas";
import { Util } from "./util";

export default class ExchangeAccount{

  public balance: AccountBalance= {};
  public MIN_ORDER_QUOTE_QTY= 5;

  constructor(public name: string, public active: boolean, public exchange: Exchange, public markets: Market[], public gas: Gas|undefined) {
  }

  static fromConfig(config: ExchangeAccountConfig){
    return new ExchangeAccount(config.name, config.active, Exchange.fromConfig(config.exchange), Market.fromConfig(config.markets), config.gas?Gas.fromConfig(config.gas):undefined);
  }
  
  async refillGas(){
    if(this.gas){
      const availableGas= this.balance[this.gas.base]-this.gas.reserved;
      const availableQuote= this.balance[this.gas.quote];
      const neededGasQuote= availableQuote*this.gas.rate/100;
      const gasTicker= await this.exchange._exchange.fetchTicker(this.gas.symbol);
      //@ts-ignore
      const availableGasQuote= availableGas*gasTicker.last;
      if(neededGasQuote>availableGasQuote){
        const gasQuoteToBuy= neededGasQuote>this.MIN_ORDER_QUOTE_QTY?neededGasQuote:this.MIN_ORDER_QUOTE_QTY;
        logger.debug(`buy gas ${gasQuoteToBuy} ${this.gas.quote} worth of ${this.gas.base}`, this.name);
        await this.exchange.buyMarket(this.gas.symbol, gasQuoteToBuy);
        await Util.sleep(3000);
        await this.loadBalance();
      }
    }
  }
  async processSignalForMarkets(asset: string, side: OrderSide, markets: Market[]){
    markets.forEach(async (market) => {
      const symbol = market.symbol;
      if (side === OrderSide.buy) {
        if (this.hasOpenPosition(market)) {
          logger.info(`${symbol} signal ignored since already in position`, this.name);
          return;
        }
        logger.info(`send buy order for ${symbol}`, this.name);
        try {
          const order = await this.buy(market);
          logger.info(`order ${order.id} sent for ${symbol} : status=${order.status}, filled=${order.filled}, average=${order.average}`, this.name);
        } catch (e: any) {
          logger.error(e.message, this.name);
        }
      } else {
        logger.info(`send sell order for ${symbol}`, this.name);
        try {
          const order = await this.sell(market);
          logger.info(`order ${order.id} sent for ${symbol} : status=${order.status}, filled=${order.filled}, average=${order.average}`, this.name);
        } catch (e: any) {
          logger.error(e.message, this.name);
        }
      }
    });
}
  async loadBalance(){
    logger.debug(`Loading balance`, this.name);
    if(this.exchange._exchange.apiKey===""){
      logger.warn(`api key is empty, nothing to load`, this.name);
      return;
    }
    try{
      const balance= await this.exchange._exchange.fetchBalance();
      this.balance= {};
      for(const market of this.markets){
        const baseBalance= balance[market.base];
        //@ts-ignore
        this.balance[market.base]= baseBalance?baseBalance.total:0;
        const quoteBalance= balance[market.quote];
        //@ts-ignore
        this.balance[market.quote] = quoteBalance ? quoteBalance.total : 0;
      }
      if(this.gas){
        const gasBalance= balance[this.gas.base];
        //@ts-ignore
        this.balance[this.gas.base]= gasBalance?gasBalance.total:0;
      }
      logger.debug(`Loaded balance : ${JSON.stringify(this.balance)}`, this.name);
    }catch(e: any){
      logger.error(e.message, this.name);
    }
  }
  async loadMarketPrices(){
    const symbols= this.markets.map(market => market.symbol);
    logger.debug(`Loading market prices for ${symbols.join(', ')}`, this.name);
    try{
      const tickers= await this.exchange.loadMarketPrices(symbols);
      //@ts-ignore
      this.markets.forEach(market => market.price= tickers[market.symbol].last);
    }catch(e: any){
      logger.error(e.message, this.name);
    }
  }
  async loadMarkets(){
    logger.debug(`Loading markets`, this.name);
    try{
      await this.exchange.loadMarkets();
    }catch(e: any){
      logger.error(e.message, this.name);
    }
  }
  getAvailableAsset(asset: string){
    if(this.balance[asset]){
      return this.balance[asset];
    }
    return 0;
  }
  getAvailableBase(market: Market){
    let availableBase= this.getAvailableAsset(market.base);
    if(availableBase*market.price<this.MIN_ORDER_QUOTE_QTY){
      availableBase= 0;
    }
    return availableBase;
  }
  getQuoteValue(market: Market){
    const qty= this.getAvailableBase(market);
    return qty*market.price;
  }
  hasOpenPosition(market: Market){
    return this.getAvailableBase(market)>0;
  }
  getAvailableQuote(market: Market){
    let availableQuote= this.getAvailableAsset(market.quote);
    if(availableQuote<this.MIN_ORDER_QUOTE_QTY){
      availableQuote= 0;
    }
    return availableQuote;
  }

  findMarkets(asset: string) : Market[]{
    const markets= [];
    for(const market of this.markets){
      if(asset===market.base){
        markets.push(market);
      }
    }
    return markets;
  }
  getQuoteToReleaseByMarket(quote: string, totalQuoteToRelease: number){
    const quoteToRelease: QuoteToRelease= {};
    for(const market of this.markets.filter(m => m.quote===quote)){
      if(!this.hasOpenPosition(market)){
        quoteToRelease[market.symbol]= {qty: 0, value: 0};
      }else{
        const expectedQuoteToRlease= totalQuoteToRelease*market.pct;
        let qty= this.balance[market.base];
        let value= qty*market.price;
        if(value>expectedQuoteToRlease){
          value= expectedQuoteToRlease;
          qty= expectedQuoteToRlease/market.price;
        }
        quoteToRelease[market.symbol]= {qty, value};
      }
    }
    return quoteToRelease;
  }
  calculateQty(market: Market, quote: number){
    return quote/market.price;
  }
  getQuoteToAllocate(market: Market){
    if(this.hasOpenPosition(market)){
      logger.debug(`quote to allocate to ${market.symbol} is 0 since already in position`, this.name);
      return 0;
    }
    const availableQuote= this.getAvailableQuote(market);
    logger.debug(`calculate quote to allocate to ${market.symbol} - total quote = ${availableQuote}`, this.name);
    let unavailableMarketsPct= 0;
    this.markets
      .filter(m => m.base!==market.base && m.quote===market.quote)
      .filter(m => this.getAvailableBase(m)>0)
      .forEach(m => unavailableMarketsPct+=m.pct);
    let allocated= market.pct*availableQuote/(1-unavailableMarketsPct);
    if(allocated>availableQuote){
      allocated= availableQuote;
    }
    allocated= Number(allocated.toFixed(2));
    logger.debug(`quote to allocate to ${market.symbol} = ${allocated}`, this.name);
    return allocated;
  }
  getOrderCost(market: Market){
    logger.debug(`calculate order cost for ${market.symbol}`, this.name);
    let cost= this.getQuoteToAllocate(market);
    if (cost > market.max) {
      logger.warn(`cost (${cost}) exceeds market max (${market.max})`, this.name);
      cost = market.max;
    }else if(cost < this.MIN_ORDER_QUOTE_QTY){
      logger.warn(`cost (${cost}) is lower than minimum (${this.MIN_ORDER_QUOTE_QTY})`, this.name);
      cost= 0;

    }
    logger.debug(`order cost for ${market.symbol} = ${cost}`, this.name);
    return cost;
  }
  async buy(market: Market){
    const cost= this.getOrderCost(market);
    if(cost===0){
      throw Error(`order cost is 0 for ${market.symbol}`);
    }
    logger.debug(`send buy order for ${market.symbol}, cost = ${cost}`, this.name);
    return await this.exchange.buyMarket(market.symbol, cost);
  }
  async sell(market: Market, qty= 0){
    if(qty===0){
      qty= this.getAvailableBase(market);
    }
    if(qty===0){
      throw Error(`order qty is 0 for ${market.symbol}`);
    }
    logger.debug(`send sell order for ${market.symbol}, qty = ${qty}`, this.name);
    return await this.exchange.sellMarket(market.symbol, qty);
  }
}
