/**
 * DCAStrategyCallback ABI — Callback Contract on Base Sepolia
 *
 * Inherits: AbstractCallback (from reactive-lib) + RescuableBase
 *
 * CRITICAL pattern: every function called via RC callback has `address` as
 * its FIRST parameter (the RVM ID sender slot). The RC passes address(0)
 * and the Reactive Network replaces it with the RVM ID at delivery time.
 *
 * The server (owner) manages configs on behalf of users (agent wallets).
 * createDCAConfig() is owner-only — the server wallet must be the CC owner.
 */
export declare const DCA_STRATEGY_CALLBACK_ABI: readonly [{
    readonly name: "createDCAConfig";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "user";
    }, {
        readonly type: "address";
        readonly name: "tokenIn";
    }, {
        readonly type: "address";
        readonly name: "tokenOut";
    }, {
        readonly type: "uint256";
        readonly name: "amountPerSwap";
    }, {
        readonly type: "uint24";
        readonly name: "poolFee";
    }, {
        readonly type: "uint256";
        readonly name: "totalSwaps";
    }, {
        readonly type: "uint256";
        readonly name: "swapInterval";
    }, {
        readonly type: "uint256";
        readonly name: "minAmountOut";
    }, {
        readonly type: "uint256";
        readonly name: "duration";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "executeDCAOrders";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "sender";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "pauseDCAConfig";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "resumeDCAConfig";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "cancelDCAConfig";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "dcaConfigs";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
        readonly name: "id";
    }, {
        readonly type: "address";
        readonly name: "user";
    }, {
        readonly type: "address";
        readonly name: "tokenIn";
    }, {
        readonly type: "address";
        readonly name: "tokenOut";
    }, {
        readonly type: "uint256";
        readonly name: "amountPerSwap";
    }, {
        readonly type: "uint24";
        readonly name: "poolFee";
    }, {
        readonly type: "uint256";
        readonly name: "totalSwaps";
    }, {
        readonly type: "uint256";
        readonly name: "swapsExecuted";
    }, {
        readonly type: "uint256";
        readonly name: "totalAmountOut";
    }, {
        readonly type: "uint256";
        readonly name: "swapInterval";
    }, {
        readonly type: "uint256";
        readonly name: "minAmountOut";
    }, {
        readonly type: "uint8";
        readonly name: "status";
    }, {
        readonly type: "uint256";
        readonly name: "createdAt";
    }, {
        readonly type: "uint256";
        readonly name: "expiresAt";
    }, {
        readonly type: "uint256";
        readonly name: "lastSwapAt";
    }, {
        readonly type: "uint8";
        readonly name: "consecutiveFailures";
    }, {
        readonly type: "uint256";
        readonly name: "lastAttemptAt";
    }];
}, {
    readonly name: "getActiveConfigs";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256[]";
    }];
}, {
    readonly name: "getAllConfigs";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256[]";
    }];
}, {
    readonly name: "getUserConfigs";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "user";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256[]";
    }];
}, {
    readonly name: "owner";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "swapRouter";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "address";
    }];
}, {
    readonly name: "nextConfigId";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "DCAConfigCreated";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "tokenIn";
    }, {
        readonly type: "address";
        readonly name: "tokenOut";
    }, {
        readonly type: "uint256";
        readonly name: "amountPerSwap";
    }, {
        readonly type: "uint24";
        readonly name: "poolFee";
    }, {
        readonly type: "uint256";
        readonly name: "totalSwaps";
    }];
}, {
    readonly name: "DCASwapExecuted";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
        readonly indexed: true;
    }, {
        readonly type: "address";
        readonly name: "tokenIn";
    }, {
        readonly type: "address";
        readonly name: "tokenOut";
    }, {
        readonly type: "uint256";
        readonly name: "amountIn";
    }, {
        readonly type: "uint256";
        readonly name: "amountOut";
    }];
}, {
    readonly name: "DCAConfigCompleted";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
        readonly indexed: true;
    }];
}, {
    readonly name: "DCAConfigCancelled";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
        readonly indexed: true;
    }];
}, {
    readonly name: "DCAConfigPaused";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
        readonly indexed: true;
    }];
}, {
    readonly name: "DCAConfigResumed";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
        readonly indexed: true;
    }];
}, {
    readonly name: "DCACycleCompleted";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "timestamp";
    }, {
        readonly type: "uint256";
        readonly name: "totalConfigsChecked";
    }, {
        readonly type: "uint256";
        readonly name: "swapsExecuted";
    }];
}, {
    readonly name: "DCASwapFailed";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
        readonly indexed: true;
    }, {
        readonly type: "string";
        readonly name: "reason";
    }];
}];
//# sourceMappingURL=dca-strategy-callback.d.ts.map