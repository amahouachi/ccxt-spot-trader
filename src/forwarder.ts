import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { ForwarderOptions, Signal } from "./types";
import cron from "node-cron";
import { logger } from "./logger";
import { fetch, Agent } from 'undici';
import path from "path";
import fs from "fs";
import { Util } from "./util";
import { Readable } from "stream";

export class Forwarder {
  s3: S3Client;
  bucket: string;
  webhooksKey: string;
  signalsKey: string;
  privateKey: string= '';
  webhooksPollSchedule: string;
  signalsUploadSchedule: string;
  webhooks: {url: string, expiresAt: string, trialExpiresAt: string}[]= [];
  signals: { asset: string; side: string; createdAt: string }[] = [];
  signalsFile!: string;
  private webhooksEtag: string | null = null;

  constructor(s3: S3Client, options: ForwarderOptions) {
    this.s3 = s3;
    this.bucket = options.bucket;
    this.webhooksKey= options.webhooksKey;
    this.signalsKey= options.signalsKey;
    this.webhooksPollSchedule = options.webhooksPollSchedule;
    this.signalsUploadSchedule = options.signalsUploadSchedule;
  }
  async start(){
    this.signalsFile= path.resolve(__dirname, "../signals.csv");
    try{
      this.privateKey = fs.readFileSync(path.resolve(__dirname, '../signal-signature-private-key.pem'), 'utf-8');
    }catch(e){
      logger.warn(`Signal signature private key not found`);
    }
    await this.loadWebhooks();
    await this.loadSignals();
    this.scheduleWebhooksPoll();
    this.scheduleSignalsUpload();
  }
  async loadSignals() {
    try {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.signalsKey }));
      const content = await Util.streamToString(res.Body as Readable);
      fs.writeFileSync(this.signalsFile, content, "utf-8");
      logger.debug("Downloaded signals.csv from S3.");
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        fs.writeFileSync(this.signalsFile, "", "utf-8");
        logger.debug("No signals.csv found, created new local file.");
      } else {
        logger.error(err.message);
      }
    }
  }
  scheduleSignalsUpload() {
    cron.schedule(this.signalsUploadSchedule, async () => {
      if (this.signals.length === 0) {
        return;
      }
      logger.debug(`Flushing ${this.signals.length} signals...`, 'forwarder');
      // Format signals as CSV lines without header
      const csvLines = this.signals
        .map((s: { asset: string; side: string; createdAt: string; }) =>
          `${s.asset},${s.side},${s.createdAt}`
        )
        .join("\n");

      // Append to local file
      fs.appendFileSync(this.signalsFile, `${csvLines}\n`, "utf-8");

      // Upload updated file to S3
      const body = fs.readFileSync(this.signalsFile);
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.signalsKey,
          Body: body,
          ContentType: "text/csv",
        })
      );
      logger.debug("Uploaded updated signals.csv to S3.", 'forwarder');
      this.signals = [];
    });
  }
  scheduleWebhooksPoll() {
    cron.schedule(this.webhooksPollSchedule, async () => {
      try {
        await this.loadWebhooks();
      } catch (error) {
        logger.error(`Error during trade synchronization: ${JSON.stringify(error)}`, 'forwarder');
      }
    }, { timezone: 'UTC' });
  }

  async loadWebhooks(): Promise<void> {
    logger.info(`Loading webhooks from S3`, 'forwarder');

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.webhooksKey,
        ...(this.webhooksEtag && { IfNoneMatch: this.webhooksEtag }),
      });

      const response = await this.s3.send(command);

      if (!response.Body) throw new Error("No file content received");

      const body = await response.Body.transformToString();
      const parsedWebhooks = JSON.parse(body);

      if (!Array.isArray(parsedWebhooks)) {
        throw new Error("Invalid JSON format: expected array");
      }

      logger.debug(`Parsed ${parsedWebhooks.length} webhook entries`);

      const now = new Date();

      this.webhooks = parsedWebhooks.filter(({ url, expiresAt, trialExpiresAt }) => {
        if (typeof url !== "string" || !url.startsWith("http")) return false;
        const subscribed = new Date(expiresAt) > now;
        const isTrial = !subscribed && new Date(trialExpiresAt || now.toISOString()) > now;
        if (!subscribed && !isTrial){
          return false;
        }else{
          return true;
        }
      });

      this.webhooksEtag = response.ETag?.replace(/"/g, "") || null;

      logger.info(`${this.webhooks.length} valid webhook(s) loaded`);
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 304) {
        logger.info("Webhooks not modified — using cached version", 'forwarder');
        return;
      }

      logger.error(`Failed to load webhooks from S3: ${JSON.stringify(err)}`, 'forwarder');
    }
  }

  sendSignal(signal: Signal): void {
    const now = new Date();
    const agent = new Agent({ connect: { rejectUnauthorized: false } });
    const body= JSON.stringify(signal);
    const signature = this.privateKey!==''?Util.signPayload(body, this.privateKey):'';
    for (const webhook of this.webhooks) {
      const { url, expiresAt, trialExpiresAt } = webhook;
      const subscribed= new Date(expiresAt) > now;
      const isTrial= !subscribed && new Date(trialExpiresAt||now.toISOString()) > now;
      if (!subscribed && !isTrial) continue;
      const delay = isTrial ? 15 * 60 * 1000 : 0;
      setTimeout(() => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        fetch(url, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json" ,
            "X-Signal-Signature": signature 
          },
          body,
          dispatcher: agent,
          signal: controller.signal
        })
          .then(() => {
            logger.debug(`Signal successfully sent to ${url}`);
          })
          .catch((error: any) => {
            logger.error(`Failed to send signal to ${url}: ${error.message}`, 'forwarder');
          })
          .finally(() => clearTimeout(timeout));
      }, delay);
    }
    this.signals.push({asset: signal.asset, side: signal.side, createdAt: now.toISOString()});
  }
}
