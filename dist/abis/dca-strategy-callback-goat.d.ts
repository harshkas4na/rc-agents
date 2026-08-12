/**
 * DCAStrategyCallbackGoat ABI — GOAT Testnet3, no Reactive Network dependency.
 *
 * Unlike the Base Sepolia version, executeDCAOrders() is genuinely
 * permissionless — no callback-proxy check, callable by anyone, pays a
 * bounty (if funded) to whoever triggers a successful swap. See
 * /goat-research/06-automation-alternatives.md and
 * /goat-research/07-testnet3-deployment.md.
 *
 * createDCAConfig() is still owner-only — the server wallet must be the
 * contract owner (it is; same wallet that deployed it).
 */
export declare const DCA_STRATEGY_CALLBACK_GOAT_ABI: readonly [{
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
    readonly name: "setExecutionBounty";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "_executionBounty";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "executeDCAOrders";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
        readonly name: "swapsExecuted";
    }];
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
    readonly name: "getAllConfigs";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256[]";
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
    readonly name: "executionBounty";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
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
    readonly name: "BountyPaid";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "executor";
        readonly indexed: true;
    }, {
        readonly type: "uint256";
        readonly name: "amount";
    }];
}];
//# sourceMappingURL=dca-strategy-callback-goat.d.ts.map