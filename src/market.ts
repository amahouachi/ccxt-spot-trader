import {MarketConfig} from "./types";

export default class Market{

  public symbol: string;
  public price: number;

  constructor(public base: string, public quote: string, public pct: number, public max: number) {
    this.symbol= `${base}/${quote}`;
    this.price= 0;
  }

  static fromConfig(config: MarketConfig[]){
    const markets: Market[]= [];
    config.forEach(marketConfig => {
      marketConfig.assets.forEach(assetConfig => {
        markets.push(new Market(assetConfig.name, marketConfig.quote, assetConfig.pct, assetConfig.max));
      })
    })
    return markets;
  }

}
