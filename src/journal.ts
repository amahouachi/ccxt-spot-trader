import cron from "node-cron";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Trade } from "./types";
import { logger } from "./logger";
import ExchangeAccount from "./exchange_account";
import * as ccxt from 'ccxt';

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
        await this.synchronizeTrades(account);
      } catch (error) {
        logger.error(`Error during trade synchronization: ${error}`, 'journal');
      }
    });
  }

  async synchronizeTrades(account: ExchangeAccount) {
    const s3TradesFileKey = `trades/${account.name}/live_trades.csv`;
    let lastTradeDate: string | null = null;
    let existingTrades: string[] = [];
    logger.info(`Started trade synchronization for ${account.name}`, "journal");

    try {
      // ✅ Step 1: Fetch the existing trades CSV from S3
      logger.info(`Fetching existing trades for ${account.name} from S3`, "journal");

      const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: s3TradesFileKey }));
      const csvContent = await response.Body?.transformToString();

      if (csvContent) {
        existingTrades = csvContent.split("\n");
        const lastRow = existingTrades[existingTrades.length - 1];
        const lastTrade = lastRow.split(",");
        lastTradeDate = lastTrade[3]; // Assuming closeDate is at index 5
        logger.info(`📅 Last recorded trade for ${account.name}: ${lastTradeDate}`, "journal");
      }
    } catch (err) {
      if ((err as any).Code === "NoSuchKey") {
        logger.info(`No previous trades for ${account.name}. Starting fresh.`, "journal");
      } else {
        logger.error(`Error fetching trades from S3: ${JSON.stringify(err)}`, "journal");
        return;
      }
    }

    // ✅ Step 2: Fetch new trades using CCXT
    const newTrades = await this.fetchNewTradesFromExchange(account, lastTradeDate);

    if (newTrades.length === 0) {
      logger.info(`No new trades found for ${account.name}. Skipping update.`, "journal");
      return;
    }

    // ✅ Step 3: Convert new trades to CSV format
    const newTradeRows = newTrades.map(trade =>
      `${trade.symbol.replace('/', '')},${trade.opendate},${trade.openprice},${trade.closedate},${trade.closeprice},${trade.quantity}`
    );

    // ✅ Step 4: Append new trades to `live_trades.csv`
    const updatedTrades = [...existingTrades, ...newTradeRows];

    // ✅ Step 5: Upload updated CSV back to S3
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3TradesFileKey,
        Body: updatedTrades.join("\n"),
        ContentType: "text/csv",
      })
    );

    logger.info(`Successfully synchronized ${s3TradesFileKey} with ${newTrades.length} new trades.`, "journal");
  }

  /**
   * Fetches new completed buy/sell orders for an account using CCXT.
   * Loops through all symbols in `account.markets` and aggregates trades.
   */
  private async fetchNewTradesFromExchange(
  account: ExchangeAccount,
  lastTradeDate: string | null
): Promise<Trade[]> {
  try {
      logger.info(`Fetching completed orders from exchange for ${account.name} after ${lastTradeDate}`, "journal");

      let limit = 1000;

      const groupedTrades: Trade[] = []; // ✅ Store all trades across symbols

      for (const market of account.markets) {
        const symbol = market.symbol;
        let sinceTimestamp = lastTradeDate ? new Date(lastTradeDate).getTime() : undefined;
        let allOrders: ccxt.Order[] = []; // ✅ Store all orders for this symbol

        let fetchMore = true;
        while (fetchMore) {
          try {
            // @ts-ignore
            const orders = await account.exchange._exchange.fetchClosedOrders(symbol, sinceTimestamp, limit);

            if (orders.length === 0) {
              fetchMore = false;
              break;
            }

            allOrders.push(...orders);
            sinceTimestamp = orders[orders.length - 1].timestamp + 1; // ✅ Update pagination timestamp
          } catch (err: any) {
            logger.warn(`Error fetching orders for ${symbol}: ${err.message}`, "journal");
            continue; // Skip to the next symbol if an error occurs
          }
        }

        // ✅ Now that we have all orders, process them in a single pass
        let openTrade: ccxt.Order | null = null;
        let lastSellOrder: ccxt.Order | null = null;

        for (const order of allOrders) {
          if (order.side === "buy") {
            // ✅ If we have an open buy and a sell, create a trade before storing new buy
            if (openTrade && lastSellOrder) {
              groupedTrades.push({
                symbol: symbol,
                opendate: new Date(openTrade.timestamp).toISOString(),
                openprice: account.exchange.roundPrice(symbol, openTrade.average || openTrade.price),
                closedate: new Date(lastSellOrder.timestamp).toISOString(),
                closeprice: account.exchange.roundPrice(symbol, lastSellOrder.average || lastSellOrder.price),
                quantity: openTrade.filled,
              });

              // ✅ Reset lastSellOrder because we just used it
              lastSellOrder = null;
            }

            // ✅ Store new buy order
            openTrade = order;
          } else if (order.side === "sell") {
            // ✅ Always update lastSellOrder to ensure we only keep the latest one
            lastSellOrder = order;
          }
        }

        // ✅ Edge case: If a buy exists but no corresponding sell, ignore it
      }

      logger.info(`✅ Successfully processed ${groupedTrades.length} trades.`, "journal");
      return groupedTrades;

    } catch (err) {
      logger.error(`CCXT Error fetching closed orders for ${account.name}: ${JSON.stringify(err)}`, "journal");
      return [];
    }
  }

}