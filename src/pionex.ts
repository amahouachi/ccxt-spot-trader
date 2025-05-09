import * as ccxt from 'ccxt';
import {sha256} from 'js-sha256';
import { logger } from './logger';
import { Util } from './util';

export class Pionex{
  public id= 'pionex';
  private baseUrl= 'https://api.pionex.com';
  private markets: any= {};
  public apiKey: string;
  private secret: string;
  private decimalToPrecision;

  constructor(config: any= {}){
    this.apiKey= config.apiKey;
    this.secret= config.secret;
    this.decimalToPrecision= new ccxt.pro['binance']().decimalToPrecision;
  }
  sign(method: string, path: string, body: string= '') : string{
    const hash = sha256.hmac.create(this.secret);
    const message= `${method}${path}${body}`;
    hash.update(message);
    return hash.hex();
  }

  async fetchTickers(symbols: string[]): Promise<ccxt.Tickers>{
    const tickers: ccxt.Tickers= {};
    const results= await (await fetch(`${this.baseUrl}/api/v1/market/tickers`)).json();
    const exchangeTickers= results.data.tickers;
    exchangeTickers.forEach((t: any) => {
      const symbol= t.symbol.replace('_', '/');
      if(symbols.includes(symbol)){
        //@ts-ignore
        tickers[symbol] = {
          symbol,
          last: Number(t.close)
        }
      }
    });
    return tickers;
  }
  async fetchTicker(symbol: string){
    const results= await (await fetch(`${this.baseUrl}/api/v1/market/tickers?symbol=${symbol.replace('/','_')}`)).json();
    const exchangeTickers= results.data.tickers;
    if(exchangeTickers.length>0){
      const ticker= exchangeTickers[0];
      return {symbol: ticker.symbol.replace('_','/'), last: Number(ticker.close)};
    }
    return null;
  }
  async loadMarkets(){
    const results= await (await fetch(`${this.baseUrl}/api/v1/common/symbols`)).json();
    results.data.symbols.forEach((s: any) => {
      const symbol= s.symbol.replace('_', '/');
      this.markets[symbol]= {
        symbol,
        basePrecision: s.basePrecision
      }
    });
  }
  amountToPrecision(symbol: string, amount: number): string{
    return this.decimalToPrecision(`${amount}`, 0, this.markets[symbol]['basePrecision']);
  }
  priceToPrecision(symbol: string, price: number): string{
    return `${price}`;
  }
  async fetchBalance(){
    const timestamp= Date.now();
    const path= `/api/v1/account/balances?timestamp=${timestamp}`;
    const signature= this.sign('GET', path);
    const response= await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        'PIONEX-KEY': this.apiKey,
        'PIONEX-SIGNATURE': signature
      }
    });
    if(response.ok){
      const result= await response.json();
      if(result.data && result.data.balances){
        const balance: any= {};
        result.data.balances.forEach((b: any) => {
          balance[b.coin]= {total: Number(b.free)};
        });
        return balance;
      }
      throw Error(`Error occured : ${result.code} - ${result.message}`);
    }else{
      throw Error(`Error occured : Response status = ${response.status}`);
    }
  }
  async createMarketOrder(symbol: string, side: 'BUY'|'SELL', cost: string, qty: string){
    try{
      const timestamp = Date.now();
      const path = `/api/v1/trade/order?timestamp=${timestamp}`;
      const request: any = {
        symbol: symbol.replace('/', '_'),
        side,
        type: 'MARKET',
      };
      if (side === 'BUY') {
        request.amount = cost;
      } else {
        request.size = qty;
      }
      const signature = this.sign('POST', path, JSON.stringify(request));
      const response = await Util.resilientFetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'PIONEX-KEY': this.apiKey,
          'PIONEX-SIGNATURE': signature
        },
        body: JSON.stringify(request)
      }, 3, 1000, 10*1000); 
      if (response.ok) {
        const result = await response.json() as {code: any, message: any, data?: any};
        if (result.data && result.data.orderId) {
          return { id: result.data.orderId };
        }
        throw Error(`Error occured : ${result.code} - ${result.message}`);
      } else {
        throw Error(`Error occured : Response status = ${response.status}`);
      }
    }catch(e: any){
      logger.error(JSON.stringify(e), 'pionex');
      throw e;
    }

  }
  async createMarketBuyOrderWithCost(symbol: string, cost: number): Promise<any>{
    return this.createMarketOrder(symbol, 'BUY', `${cost}`, '');
  }
  async createMarketSellOrder(symbol: string, qty: number): Promise<any>{
    return this.createMarketOrder(symbol, 'SELL', '', this.amountToPrecision(symbol, qty));
  }
}

(async function x(){
  const pionex= new Pionex();
  //console.log(await pionex.fetchTickers(['ETH/USDT','BTC/USDT']));
  //await pionex.loadMarkets();
  //console.log(pionex.amountToPrecision('BTC/USDT', 3.493939499192));
  //console.log(pionex.amountToPrecision('ETH/USDT', 3.493939499192));
})();