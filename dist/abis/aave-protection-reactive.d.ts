/**
 * AaveProtectionReactive ABI — Reactive Contract on Reactive Network
 *
 * Inherits: AbstractPausableReactive (from reactive-lib)
 *
 * The RC is deployed on the Reactive Network. Its react(LogRecord) runs
 * in the ReactVM. State persistence happens via self-callbacks to
 * callbackOnly functions.
 *
 * This ABI is only needed if the server queries RC state directly.
 * Most interactions go through the CC.
 */
export declare const AAVE_PROTECTION_REACTIVE_ABI: readonly [{
    readonly name: "owner";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "paused";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly name: "protectionCallback";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "cronTopic";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "activeConfigCount";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "cronSubscribed";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly name: "getActiveConfigs";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256[]";
    }];
}];
//# sourceMappingURL=aave-protection-reactive.d.ts.map