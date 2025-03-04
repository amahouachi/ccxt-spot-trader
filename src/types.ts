export type BotConfig= {
  endpoints: {
    signal: string;
    releaseQuote: string;
    balances: string;
  }
  port: number;
  telegram?:{
    token: string;
    chatId: string;
  }
  journal?: {
    region: string;
    endpoint: string;
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
    },
    bucket: string;
    schedule: string;
  },
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