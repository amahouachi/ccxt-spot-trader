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

      let allOrders: ccxt.Order[] = [];
      let limit = 1000;

      // ✅ Loop through each symbol in account.markets
      for (const market of account.markets) {
        const symbol = market.symbol;
        let sinceTimestamp = lastTradeDate ? new Date(lastTradeDate).getTime() : undefined;

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

            // ✅ Update timestamp for pagination
            sinceTimestamp = orders[orders.length - 1].timestamp + 1;
          } catch (err: any) {
            logger.warn(`Error fetching orders for ${symbol}: ${err.message}`, "journal");
            continue; // Skip to the next symbol if an error occurs
          }
        }
      }

      if (allOrders.length === 0) {
        logger.info(`No new orders found for ${account.name}`, "journal");
        return [];
      }

      // ✅ Step 1: Sort orders by symbol & timestamp
      allOrders.sort((a, b) => (a.symbol > b.symbol ? 1 : a.symbol < b.symbol ? -1 : a.timestamp - b.timestamp));

      // ✅ Step 2: Group orders into trades
      const groupedTrades: Trade[] = [];
      const orderQueue: { [symbol: string]: ccxt.Order[]; } = {};

      for (const order of allOrders) {
        if (!orderQueue[order.symbol]) orderQueue[order.symbol] = [];

        if (order.side === "buy") {
          orderQueue[order.symbol].push(order);
        } else if (order.side === "sell" && orderQueue[order.symbol].length > 0) {
          const buyOrder = orderQueue[order.symbol].shift(); // Take the oldest buy order
          if (buyOrder) {
            groupedTrades.push({
              symbol: buyOrder.symbol,
              opendate: new Date(buyOrder.timestamp).toISOString(),
              openprice: account.exchange.roundPrice(buyOrder.symbol, buyOrder.average || buyOrder.price),
              closedate: new Date(order.timestamp).toISOString(), // Use the last sell order timestamp
              closeprice: account.exchange.roundPrice(buyOrder.symbol, order.average || order.price),
              quantity: buyOrder.filled, // Use buy quantity
            });
          }

          // ✅ Keep only the last sell order, ignore previous sells
          orderQueue[order.symbol] = [order];
        }
      }

      logger.info(`Grouped ${groupedTrades.length} trades for ${account.name}`, "journal");
      return groupedTrades;
    } catch (err) {
      logger.error(`CCXT Error fetching closed orders for ${account.name}: ${JSON.stringify(err)}`, "journal");
      return [];
    }
  }
}