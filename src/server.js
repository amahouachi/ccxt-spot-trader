"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = void 0;
const express_1 = __importDefault(require("express"));
//
class Server {
    app;
    constructor() {
        this.app = (0, express_1.default)();
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.urlencoded({ extended: false }));
    }
    addEndpoint(endpoint, method, callback) {
        this.app[method](endpoint, callback);
    }
    addGetEndpoint(endpoint, callback) {
        this.addEndpoint(endpoint, 'get', callback);
    }
    addPostEndpoint(endpoint, callback) {
        this.addEndpoint(endpoint, 'post', callback);
    }
    async start(port) {
        return new Promise((resolve, reject) => {
            try {
                this.app.listen(port, () => {
                    resolve();
                });
            }
            catch (e) {
                reject(e.message);
            }
        });
    }
}
exports.server = new Server();
