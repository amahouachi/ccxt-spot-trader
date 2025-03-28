import cron from "node-cron";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { logger } from "./logger";
import ExchangeAccount from "./exchange_account";

export type TradeJournalOptions = {
  region: string;
  endpoint: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  bucket: string;
  schedule: string;
};

export class TradeJournal {
  s3: S3Client;
  bucket: string;
  schedule: string;

  constructor(options: TradeJournalOptions) {
    this.s3 = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      credentials: options.credentials,
    });
    this.bucket = options.bucket;
    this.schedule = options.schedule;
  }
  start(account: ExchangeAccount) {
    cron.schedule(this.schedule, async () => {
      try {
        await this.takeEquitySnapshot(account);
      } catch (error) {
        logger.error(`Error during trade synchronization: ${error}`, 'journal');
      }
    },{timezone: 'UTC'});
  }
  async takeEquitySnapshot( account: ExchangeAccount) {
    try {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      await account.loadBalance();
      await account.loadMarketPrices();
      const {balance, markets}= account;

      //if quote!=USDT??
      const totalEquity = balance["USDT"].qty + balance["USDT"].value;

      const equityCsvLine = `${today},${totalEquity.toFixed(2)}\n`;
      const equityKey = `equity/${account.name}/equity.csv`;

      await this.appendLineToCsv(equityKey, equityCsvLine);

      const benchmarkKey = `equity/${account.name}/benchmark.csv`;
      for (const m of markets) {
        const row = `${today},${m.symbol.replace("/", "")},${account.exchange.roundPrice(m.symbol,m.price)}\n`;
        await this.appendLineToCsv(benchmarkKey, row);
      }

      logger.info(`Equity and benchmark snapshot saved for ${today}`, "journal");
    } catch (error) {
      logger.error(`Error in snapshotEquityAndBenchmark: ${error}`, "journal");
    }
  }

  async recordTransfer(
    account: ExchangeAccount,
    type: "deposit" | "withdrawal",
    amount: number,
    date?: string
  ) {
    const formattedDate = date
      ? new Date(date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const line = `${formattedDate},${type},${amount}\n`;
    const key = `equity/${account.name}/transfers.csv`;

    try {
      await this.appendLineToCsv(key, line);
      logger.info(`✅ Recorded ${type} of ${amount} on ${formattedDate} for ${account.name}`, "journal");
    } catch (err) {
      logger.error(`❌ Failed to record transfer: ${err}`, "journal");
      throw err;
    }
  }


  async appendLineToCsv(key: string, line: string) {
    try {
      let existing = "";
      try {
        const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
        existing = await res.Body?.transformToString() || "";
      } catch (err: any) {
        if (err.Code !== "NoSuchKey") throw err;
      }

      const content = existing ? existing.trimEnd() + "\n" + line.trimEnd() : line.trimEnd();

      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: "text/csv",
      }));
    } catch (err) {
      throw new Error(`Failed to append line to CSV ${key}: ${err}`);
    }
  }

  /*
async synchronizeTrades(account: ExchangeAccount) {
    const s3TradesFileKey = `trades/${account.name}/live_trades.csv`;
    let existingTrades: string[] = [];
    let lastTradeTimestamps: Record<string, string> = {}; // ✅ Store last trade date per symbol

    logger.info(`Started trade synchronization for ${account.name}`, "journal");

    try {
        // ✅ Step 1: Fetch existing trades from S3 (already being done)
        const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: s3TradesFileKey }));
        const csvContent = await response.Body?.transformToString();

        if (csvContent) {
            existingTrades = csvContent.split("\n").filter(row => row.trim() !== "");

            // ✅ Extract last close date per symbol
            for (const row of existingTrades) {
                const [symbol, , , closedate] = row.split(",");
                lastTradeTimestamps[symbol] = closedate; // The last occurrence per symbol is the latest close date
            }
        }
    } catch (err) {
        if ((err as any).Code === "NoSuchKey") {
            logger.info(`No previous trades for ${account.name}. Starting fresh.`, "journal");
        } else {
            logger.error(`Error fetching trades from S3: ${JSON.stringify(err)}`, "journal");
            return;
        }
    }

    // ✅ Step 2: Fetch new trades using extracted timestamps
    const newTrades = await this.fetchNewTradesFromExchange(account, lastTradeTimestamps);
    if (newTrades.length === 0) {
        logger.info(`No new trades found for ${account.name}. Skipping update.`, "journal");
        return;
    }

    // ✅ Step 3: Convert new trades to CSV format
    const newTradeRows = newTrades.map(trade =>
      `${trade.symbol.replace('/', '')},${trade.opendate},${trade.openprice},${trade.closedate},${trade.closeprice},${trade.quantity}`
    );

    // ✅ Step 4: Append new trades and update S3
    const updatedTrades = [...existingTrades, ...newTradeRows];
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: s3TradesFileKey, Body: updatedTrades.join("\n"), ContentType: "text/csv" }));

    logger.info(`Successfully synchronized ${s3TradesFileKey} with ${newTrades.length} new trades.`, "journal");
}


  private async fetchNewTradesFromExchange(
    account: ExchangeAccount,
    lastTradeTimestamps: Record<string, string>
  ): Promise<Trade[]> {
    try {
      logger.info(`Fetching completed orders from exchange for ${account.name}`, "journal");

      const limit = 1000;
      const groupedTrades: Trade[] = [];

      for (const market of account.markets) {
        const symbol = market.symbol.replace('/','');
        let sinceTimestamp = lastTradeTimestamps[symbol] ? new Date(lastTradeTimestamps[symbol]).getTime()+1 : undefined;
        let allOrders: ccxt.Order[] = [];

        let fetchMore = true;
        while (fetchMore) {
          try {
            //@ts-ignore
            const orders = await account.exchange._exchange.fetchClosedOrders(market.symbol, sinceTimestamp, limit);
            if (orders.length === 0) {
              break;
            }
            allOrders.push(...orders);
            sinceTimestamp = orders[orders.length - 1].timestamp + 1;
          } catch (err: any) {
            logger.warn(`Error fetching orders for ${symbol}: ${err.message}`, "journal");
          }
        }

        allOrders.sort((a, b) => a.timestamp - b.timestamp);

        let openTrade: ccxt.Order | null = null;
        let lastSellOrder: ccxt.Order | null = null;

        for (const order of allOrders) {
          if (order.side === "buy") {
            if (openTrade && lastSellOrder) {
              groupedTrades.push({
                symbol,
                opendate: new Date(openTrade.timestamp).toISOString(),
                openprice: account.exchange.roundPrice(symbol, openTrade.average || openTrade.price),
                closedate: new Date(lastSellOrder.timestamp).toISOString(),
                closeprice: account.exchange.roundPrice(symbol, lastSellOrder.average || lastSellOrder.price),
                quantity: openTrade.filled,
              });
              openTrade = null;
              lastSellOrder = null;
            }
            openTrade = order;
          } else if (order.side === "sell") {
            lastSellOrder = order;
          }
        }

        if (openTrade && lastSellOrder) {
          groupedTrades.push({
            symbol,
            opendate: new Date(openTrade.timestamp).toISOString(),
            openprice: account.exchange.roundPrice(symbol, openTrade.average || openTrade.price),
            closedate: new Date(lastSellOrder.timestamp).toISOString(),
            closeprice: account.exchange.roundPrice(symbol, lastSellOrder.average || lastSellOrder.price),
            quantity: openTrade.filled,
          });
        }

        if (allOrders.length > 0) {
          lastTradeTimestamps[symbol] = new Date(allOrders[allOrders.length - 1].timestamp).toISOString();
        }
      }

      logger.info(`✅ Successfully processed ${groupedTrades.length} trades.`, "journal");
      return groupedTrades;

    } catch (err) {
      logger.error(`CCXT Error fetching closed orders for ${account.name}: ${JSON.stringify(err)}`, "journal");
      return [];
    }
  }*/
}