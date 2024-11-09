"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const path_1 = __importDefault(require("path"));
const winston_1 = __importDefault(require("winston"));
const config_1 = require("winston/lib/winston/config");
const DEFAULT_OPTIONS = {
    level: 'debug',
    disableFile: true,
    disableConsole: false,
    rootPath: '.',
    fileName: 'application.log'
};
class Logger {
    _logger;
    level;
    disableFile;
    disableConsole;
    rootPath;
    fileName;
    constructor(options) {
        this.level = options.level || DEFAULT_OPTIONS.level,
            this.disableFile = ('disableFile' in options) ? options.disableFile : DEFAULT_OPTIONS.disableFile;
        this.disableConsole = ('disableConsole' in options) ? options.disableConsole : DEFAULT_OPTIONS.disableConsole;
        this.rootPath = options.rootPath || DEFAULT_OPTIONS.rootPath;
        this.fileName = options.fileName || DEFAULT_OPTIONS.fileName;
        const transports = [];
        if (!this.disableFile) {
            transports.push(new winston_1.default.transports.File({ filename: path_1.default.join(this.rootPath, this.fileName) }));
        }
        if (!this.disableConsole) {
            transports.push(new winston_1.default.transports.Console());
        }
        this._logger = winston_1.default.createLogger({
            level: this.level,
            levels: config_1.syslog.levels,
            format: winston_1.default.format.combine(winston_1.default.format.align(), winston_1.default.format.timestamp(), winston_1.default.format.printf(({ level, message, timestamp, label }) => {
                return `${timestamp} [${level.toUpperCase()}] ${message}`;
            })),
            transports
        });
    }
    configure(options) {
        const logger = new Logger(options);
        //@ts-ignore
        Object.keys(this).forEach(key => this[key] = logger[key]);
    }
    info(message, tag = '') {
        this._logger.log('info', tag === '' ? message : `[${tag}] ${message}`);
    }
    debug(message, tag = '') {
        this._logger.log('debug', tag === '' ? message : `[${tag}] ${message}`);
    }
    error(message, tag = '') {
        this._logger.log('error', tag === '' ? message : `[${tag}] ${message}`);
    }
    warn(message, tag = '') {
        this._logger.log('warning', tag === '' ? message : `[${tag}] ${message}`);
    }
}
exports.logger = new Logger(DEFAULT_OPTIONS);
