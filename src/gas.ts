import { GasConfig } from "./types";

export default class Gas{

  public symbol: string;

  constructor(public base: string, public quote: string, public rate: number, public reserved: number) {
    this.symbol= `${base}/${quote}`;
  }

  static fromConfig(config: GasConfig){
    return new Gas(config.base, config.quote, config.rate, config.reserved);
  }

}
