import * as ccxt from 'ccxt';
import {ExchangeConfig} from "./types";
import {Order} from "ccxt";

export default class Exchange{
  public _exchange: ccxt.Exchange;
  static cachedExchanges: {[name: string]: Exchange}= {};

  constructor(public name: string, config: any) {
    //@ts-ignore
    this._exchange= new ccxt.pro[name]({...config, enableRateLimit: true});
  }
  static fromConfig(config: ExchangeConfig){
    return new Exchange(config.name, config.config);
  }
  async loadMarketPrices(symbols: string[]){
    return await this._exchange.fetchTickers(symbols);
  }
  async loadMarkets(){
    const exchangeName= this._exchange.id;
    if(!Exchange.cachedExchanges[exchangeName]){
      await this._exchange.loadMarkets();
      Exchange.cachedExchanges[exchangeName]= this;
    }else{
      //share loaded data across accounts with same exchange
      //https://github.com/ccxt/ccxt/blob/master/examples/js/shared-load-markets.js
      const cachedExchange= Exchange.cachedExchanges[exchangeName];
      [ 'ids', 'markets', 'markets_by_id', 'currencies', 'currencies_by_id', 'baseCurrencies', 'quoteCurrencies', 'symbols',].forEach ((key) => {
        // @ts-ignore
        this._exchange[key] = cachedExchange._exchange[key]
      });
    }
  }
  async buyMarket(symbol: string, cost: number): Promise<Order>{
    return await this._exchange.createMarketBuyOrderWithCost(symbol, cost);
  }
  async sellMarket(symbol: string, qty: number): Promise<Order>{
    return await this._exchange.createMarketSellOrder(symbol, Number(this.roundAmount(symbol, qty)));
  }
  roundAmount(symbol: string, amount: number){
    return this._exchange.amountToPrecision(symbol,amount)
  }
}
