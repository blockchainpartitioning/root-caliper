"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const util = require("./util");
const e2eUtils = require("./e2eUtils");
const createChannel = require("./create-channel");
const joinChannel = require("./join-channel");
const installChaincode = require("./install-chaincode");
const instantiateChaincode = require("./instantiate-chaincode");
const blockchain_interface_1 = require("../comm/blockchain-interface");
const util_1 = require("../comm/util");
/**
 * Implements {BlockchainInterface} for a Fabric backend.
 */
class Fabric extends blockchain_interface_1.default {
    /**
     * Create a new instance of the {Fabric} class.
     * @param {string} config_path The path of the Fabric network configuration file.
     */
    constructor(config_path) {
        super(config_path);
    }
    /**
     * Initialize the {Fabric} object.
     * @return {Promise} The return promise.
     */
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            util.init(this.configPath);
            e2eUtils.init(this.configPath);
            try {
                yield createChannel.run(this.configPath);
                return joinChannel.run(this.configPath);
            }
            catch (err) {
                util_1.default.log('fabric.init() failed, ' + (err.stack ? err.stack : err));
                return Promise.reject(err);
            }
        });
    }
    /**
     * Deploy the chaincode specified in the network configuration file to all peers.
     * @return {Promise} The return promise.
     */
    installSmartContract() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield installChaincode.run(this.configPath);
                return instantiateChaincode.run(this.configPath);
            }
            catch (err) {
                util_1.default.log('fabric.installSmartContract() failed, ' + (err.stack ? err.stack : err));
                return Promise.reject(err);
            }
        });
    }
    /**
     * Return the Fabric context associated with the given callback module name.
     * @param {string} name The name of the callback module as defined in the configuration files.
     * @param {object} args Unused.
     * @return {object} The assembled Fabric context.
     */
    getContext(name) {
        util.init(this.configPath);
        e2eUtils.init(this.configPath);
        let config = require(this.configPath);
        let context = config.fabric.context;
        let channel;
        if (typeof context === 'undefined') {
            channel = util.getDefaultChannel();
        }
        else {
            channel = util.getChannel(context[name]);
        }
        if (!channel) {
            return Promise.reject(new Error('could not find context\'s information in config file'));
        }
        return e2eUtils.getcontext(channel);
    }
    /**
     * Release the given Fabric context.
     * @param {object} context The Fabric context to release.
     * @return {Promise} The return promise.
     */
    releaseContext(context) {
        return e2eUtils.releasecontext(context).then(() => {
            return util_1.default.sleep(1000);
        });
    }
    /**
     * Invoke the given chaincode according to the specified options. Multiple transactions will be generated according to the length of args.
     * @param {string} contractID The name of the chaincode.
     * @param {string} contractVer The version of the chaincode.
     * @param {Array} args Array of JSON formatted arguments for transaction(s). Each element containts arguments (including the function name) passing to the chaincode. JSON attribute named transaction_type is used by default to specify the function name. If the attribute does not exist, the first attribute will be used as the function name.
     * @param {number} timeout The timeout to set for the execution in seconds.
     * @return {Promise<object>} The promise for the result of the execution.
     */
    invokeSmartContract(context, contractID, contractVer, args, timeout) {
        let promises = [];
        args.forEach((item, index) => {
            try {
                let simpleArgs = [];
                let func;
                for (let key in item) {
                    if (key === 'transaction_type') {
                        func = item[key].toString();
                    }
                    else {
                        simpleArgs.push(item[key].toString());
                    }
                }
                if (func) {
                    simpleArgs.splice(0, 0, func);
                }
                promises.push(e2eUtils.invokebycontext(context, contractID, contractVer, simpleArgs, timeout));
            }
            catch (err) {
                util_1.default.log(err);
                let badResult = {
                    id: 'unknown',
                    status: 'failed',
                    time_create: Date.now(),
                    time_final: Date.now(),
                    time_endorse: 0,
                    time_order: 0,
                    result: null,
                };
                promises.push(Promise.resolve(badResult));
            }
        });
        return Promise.all(promises);
    }
    /**
     * Query the given chaincode according to the specified options.
     * @param {object} context The Fabric context returned by {getContext}.
     * @param {string} contractID The name of the chaincode.
     * @param {string} contractVer The version of the chaincode.
     * @param {string} key The argument to pass to the chaincode query.
     * @return {Promise<object>} The promise for the result of the execution.
     */
    queryState(context, contractID, contractVer, key) {
        // TODO: change string key to general object
        return e2eUtils.querybycontext(context, contractID, contractVer, key.toString());
    }
    /**
     * Calculate basic statistics of the execution results.
     * @param {object} stats The object that contains the different statistics.
     * @param {object[]} results The collection of previous results.
     */
    getDefaultTxStats(results, detail) {
        let succ = 0, fail = 0, delay = 0;
        let minFinal, maxFinal, minCreate, maxCreate;
        let minDelay = 100000, maxDelay = 0;
        let delays = [];
        for (let i = 0; i < results.length; i++) {
            let stat = results[i];
            let create = stat.time_create;
            if (typeof minCreate === 'undefined') {
                minCreate = create;
                maxCreate = create;
            }
            else {
                if (create < minCreate) {
                    minCreate = create;
                }
                if (create > maxCreate) {
                    maxCreate = create;
                }
            }
            if (stat.status === 'success') {
                succ++;
                let final = stat.time_final;
                let d = (final - create) / 1000;
                if (typeof minFinal === 'undefined') {
                    minFinal = final;
                    maxFinal = final;
                }
                else {
                    if (final < minFinal) {
                        minFinal = final;
                    }
                    if (final > maxFinal) {
                        maxFinal = final;
                    }
                }
                delay += d;
                if (d < minDelay) {
                    minDelay = d;
                }
                if (d > maxDelay) {
                    maxDelay = d;
                }
                if (detail) {
                    delays.push(d);
                }
            }
            else {
                fail++;
            }
        }
        let stats = {
            'succ': succ,
            'fail': fail,
            'create': { 'min': minCreate / 1000, 'max': maxCreate / 1000 },
            'final': { 'min': minFinal / 1000, 'max': maxFinal / 1000 },
            'delay': { 'min': minDelay, 'max': maxDelay, 'sum': delay, 'detail': (detail ? delays : []) },
            'out': []
        };
        return stats;
    }
}
exports.default = Fabric;
//# sourceMappingURL=fabric.js.map