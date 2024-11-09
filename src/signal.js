"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Signal {
    asset;
    side;
    constructor(params) {
        this.side = params.side;
        this.asset = params.asset;
    }
    static fromJson(params) {
        for (const key of ['side', 'asset']) {
            // @ts-ignore
            if (!params[key] || params[key] === '') {
                throw Error(`${key} is required`);
            }
        }
        return new Signal(params);
    }
}
exports.default = Signal;
