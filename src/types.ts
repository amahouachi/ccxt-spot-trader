import { S3Client } from "@aws-sdk/client-s3";

export type BotConfig= {
  endpoints: {
    signal: string;
    releaseQuote: string;
    recordTransfer: string;
    balances: string;
    refreshWebhooks: string;
  }
  port: number;
  telegram?:{
    token: string;
    chatId: string;
  },
  s3?: S3Options,
  journal?: TradeJournalOptions,
  forwarder?: ForwarderOptions,
  accounts: ExchangeAccountConfig[];
}
export type ExchangeAccountConfig= {
  name: string
  active: boolean
  useJournal?: boolean;
  exchange: ExchangeConfig
  markets: MarketConfig[]
  gas?: GasConfig
}
export type GasConfig= {
  base: string
  quote: string
  rate: number
  reserved: number
}

export type ExchangeConfig= {
  name: string
  config: {
    apiKey: string,
    secret: string,
    [key: string]: string|number|boolean
  }
}
export type QuoteToRelease= {
  [symbol: string]: {
    qty: number
    value: number
  }
}
export type MarketConfig= {
  quote: string
  assets: AssetConfig[]
}
export type AssetConfig= {
  name: string
  pct: number
  max: number
}

export enum OrderSide{
  buy='buy',
  sell='sell',
}

export type SignalParams= {
  asset: string
  side: OrderSide
}

export type AccountBalance= {
  [asset: string]: {
    qty: number
    value: number
  }
}

export type ReleaseQuoteRequest= {
  account: string
  quote: string
  qty: number
}

export type BuyRequest= {
  account: string
  symbol: string
  qty?: number
  cost?: number
}

export type SellRequest= {
  account: string
  symbol: string
  qty?: number
  cost?: number
}

export type Trade= {
  symbol: string;
  opendate: string;
  openprice: number;
  closedate: string;
  closeprice: number;
  quantity: number;
}
export type Signal ={
  asset: string;
  side: OrderSide;
  tp?: number;
  sl?: number;
  price?: number;
}
export type S3Options= {
  region: string;
  endpoint: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};
export type TradeJournalOptions = {
  bucket: string;
  schedule: string;
};
export type ForwarderOptions = {
  bucket: string;
  webhooksKey: string;
  refreshSchedule: string;
};