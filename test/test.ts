import {describe, it, expect} from '@jest/globals';

import config from "./config.json";
import { ExchangeAccountConfig, OrderSide, Signal } from '../src/types';
import ExchangeAccount from '../src/exchange_account';
import Market from '../src/market';
import { logger } from '../src/logger';
import { Util } from '../src/util';
import { TradeJournal } from '../src/journal';
/*

describe("Test balance and order cost operations", () => {
  const accountConfigs: ExchangeAccountConfig[] = config.accounts;
  const accounts = accountConfigs.map(account => ExchangeAccount.fromConfig(account));
  const account= accounts[0];
  account.markets.forEach(market => {
    market.price= 1000;
    account.balance[market.base]= {qty: 200, value: 0};
    account.balance[market.quote]= {qty: 200, value: 0};
  });
  it("getAvailableBase should return all base if > 10", () => {
    account.markets.forEach(market => {
      expect(account.getAvailableBase(market)).toEqual(200);
    });
  });
  it("getAvailableBase should return zero if < 10", () => {
    account.markets.forEach(market => {
      market.price= 0.01;
      account.balance[market.base].qty= 200;
      account.balance[market.quote].qty= 500;
    });
    account.markets.forEach(market => {
      expect(account.getAvailableBase(market)).toEqual(0);
    });
  });
  it("simple case - all quote is available", () => {
    account.balance["BTC"]= {qty: 0, value: 0};
    account.balance["ETH"]= {qty: 0, value: 0};
    account.balance["SOL"]= {qty: 0, value: 0};
    account.balance["USDT"]= {qty: 1000, value: 0};
    expect(account.getOrderCost(new Market("ETH", "USDT", 0.2, 200000))).toEqual(200);
    expect(account.getQuoteToAllocate(new Market("ETH", "USDT", 0.2, 200000))).toEqual(200);
    account.balance["USDT"].qty= 10000000;
    expect(account.getOrderCost(new Market("ETH", "USDT", 0.2, 200000))).toEqual(200000);
  });
  it("some assets are already bought", () => {
    account.balance["BTC"].qty= 35;
    account.balance["ETH"].qty= 0;
    account.balance["SOL"].qty= 0;
    account.balance["USDT"].qty= 600;
    account.markets= [];
    const ethusdtMarket= new Market("ETH", "USDT", 0.4, 200000);
    const btcusdtMarket= new Market("BTC", "USDT", 0.4, 200000);
    const solusdtMarket= new Market("SOL", "USDT", 0.2, 200000);
    ethusdtMarket.price= 1000;
    btcusdtMarket.price= 1000;
    solusdtMarket.price= 1000;
    account.markets.push(ethusdtMarket);
    account.markets.push(btcusdtMarket);
    account.markets.push(solusdtMarket);
    expect(account.getOrderCost(ethusdtMarket)).toEqual(400);
    expect(account.getOrderCost(solusdtMarket)).toEqual(200);
    expect(account.getOrderCost(btcusdtMarket)).toEqual(0);
    account.balance["SOL"].qty= 33223;
    account.balance["USDT"].qty= 400;
    expect(account.getOrderCost(ethusdtMarket)).toEqual(400);
  });
});


describe("Test release quote", () => {
  const accountConfigs: ExchangeAccountConfig[] = config.accounts;
  const accounts = accountConfigs.map(account => ExchangeAccount.fromConfig(account));
  const account= accounts[0];
  account.balance["BTC"].qty= 1;
  account.balance["ETH"].qty= 1;
  account.balance["SOL"].qty= 1;
  account.balance["USDT"].qty= 600;
  account.markets= [];
  const ethusdtMarket= new Market("ETH", "USDT", 0.4, 200000);
  const btcusdtMarket= new Market("BTC", "USDT", 0.4, 200000);
  const solusdtMarket= new Market("SOL", "USDT", 0.2, 200000);
  ethusdtMarket.price= 1000;
  btcusdtMarket.price= 1000;
  solusdtMarket.price= 10;
  account.markets.push(ethusdtMarket);
  account.markets.push(btcusdtMarket);
  account.markets.push(solusdtMarket);
  console.log(account.getQuoteToReleaseByMarket("USDT", 200));
});

describe("Test support signal", () => {
  const accountConfigs: ExchangeAccountConfig[] = config.accounts;
  const accounts = accountConfigs.map(account => ExchangeAccount.fromConfig(account));
  const account= accounts[0];
  const ethusdtMarket= new Market("ETH", "USDT", 0.4, 200000);
  account.markets= [ethusdtMarket];
  const signal: Signal= {asset: "ETH", side: OrderSide.buy};
  it("test support buy signal if asset is in supported markets", () => {
    expect(account.findMarkets(signal.asset).length).toBeGreaterThan(0);
  });
  it("test not support buy signal if asset is not in supported markets", () => {
    signal.asset= "ETH2";
    expect(account.findMarkets(signal.asset).length).toEqual(0);
  });
});


describe("Test real exchange calls", () => {
  const accountConfigs: ExchangeAccountConfig[] = config.accounts;
  const accounts = accountConfigs.map(account => ExchangeAccount.fromConfig(account));
  it("test support buy signal if asset is in supported markets", async () => {
    for(const account of accounts){
      await account.loadMarkets();
      await Util.sleep(1000);
      await account.loadMarketPrices();
      expect(account.markets[0].price).toBeGreaterThan(0);
    }
  }, 20000);
});
*/