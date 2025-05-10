import express, {Express, NextFunction, Request, Response} from 'express';
import { logger } from './logger';
import { Util } from './util';

export type HTTP_METHOD= 'get'|'post';

function accessLog(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const clientIp = Util.getIpv4(req.headers['x-forwarded-for'] || req.socket.remoteAddress);
    const userAgent = req.headers['user-agent'];
    const method = req.method;
    const url = req.originalUrl || req.url;
    const status = res.statusCode;
    logger.info(`${clientIp} ${method} ${url} ${status} ${durationMs.toFixed(1)}`, "access");
  });

  next();
}
class Server{
  private app: Express;
  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: false }));
    this.app.use(accessLog);
  }
  addEndpoint(endpoint: string, method: HTTP_METHOD, callback: any){
    this.app[method](endpoint, callback);
  }
  addGetEndpoint(endpoint: string, callback: any){
    this.addEndpoint(endpoint, 'get', callback);
  }
  addPostEndpoint(endpoint: string, callback: any){
    this.addEndpoint(endpoint, 'post', callback);
  }
  async start(port: number){
    return new Promise<void>((resolve, reject) => {
      try{
        this.app.listen(port, () => {
          resolve();
        });
      }catch (e: any) {
        reject(e.message);
      }
    });
  }
}

export const server= new Server();