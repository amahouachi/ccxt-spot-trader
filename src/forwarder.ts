import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { ForwarderOptions, Signal } from "./types";
import cron from "node-cron";
import { logger } from "./logger";

export class Forwarder {
  s3: S3Client;
  bucket: string;
  webhooksKey: string;
  refreshSchedule: string;
  webhooks: {url: string, expiresAt: string}[];

  constructor(s3: S3Client, options: ForwarderOptions) {
    this.s3 = s3;
    this.bucket = options.bucket;
    this.webhooksKey= options.webhooksKey;
    this.refreshSchedule = options.refreshSchedule;
    this.webhooks= [];
  }
  scheduleWebhooksPoll() {
    cron.schedule(this.refreshSchedule, async () => {
      try {
        await this.loadWebhooks();
      } catch (error) {
        logger.error(`Error during trade synchronization: ${JSON.stringify(error)}`, 'forwarder');
      }
    },{timezone: 'UTC'});
  }
  async loadWebhooks(): Promise<void> {
    logger.info(`Loading webhooks from S3`, 'forwarder');
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: this.webhooksKey });
      const response = await this.s3.send(command);

      if (!response.Body) throw new Error("No file content received");

      const body = await response.Body.transformToString();
      const parsedWebhooks = JSON.parse(body);

      if (!Array.isArray(parsedWebhooks)) throw new Error("Invalid JSON format: expected array");

      logger.debug(`Parsed ${parsedWebhooks.length} webhook entries`);

      const now = new Date();

      this.webhooks = parsedWebhooks.filter(({url,expiresAt}) => {
        // Check webhook is a valid URL string
        if (typeof url !== "string" || !url.startsWith("http")) {
          return false;
        }
        // Check expiresAt is a valid date and not in the past
        const exp = new Date(expiresAt);
        if (isNaN(exp.getTime()) || exp < now) {
          return false;
        }
        return true;
      });

      logger.info(`${this.webhooks.length} valid webhook(s) loaded`);
    } catch (error) {
      logger.error(`Failed to load webhooks from S3: ${JSON.stringify(error)}`, 'forwarder');
    }
  }
  sendSignal(signal: Signal): void {
    const now = new Date();
    let sentCount = 0;

    for (const webhook of this.webhooks) {
      const url = webhook.url;
      const expiresAt = new Date(webhook.expiresAt);
      if (expiresAt <= now) {
        continue;
      }
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signal),
      }).catch((error: any) => {
        logger.error(`Failed to send signal to ${url} : ${JSON.stringify(error)}`, 'forwarder');
      });
      sentCount++;
    }
    logger.debug(`Signal dispatched to ${sentCount} webhook(s)`);
  }

}
