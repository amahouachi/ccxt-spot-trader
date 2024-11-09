import {OrderSide, SignalParams} from "./types";

export default class Signal{

  public asset: string;
  public side: OrderSide;

  constructor(params: SignalParams) {
    this.side= params.side;
    this.asset= params.asset;
  }

  static fromJson(params: SignalParams){
    for(const key of ['side','asset']){
      // @ts-ignore
      if(!params[key] || params[key]===''){
        throw Error(`${key} is required`);
      }
    }
    return new Signal(params);
  }
}
