/**
 * AaveProtectionCallback ABI — Callback Contract on Base Sepolia
 *
 * Inherits: AbstractCallback (from reactive-lib) + RescuableBase
 *
 * CRITICAL pattern: every function called via RC callback has `address` as
 * its FIRST parameter (the RVM ID sender slot). The RC passes address(0)
 * and the Reactive Network replaces it with the RVM ID at delivery time.
 *
 * The server (owner) manages configs on behalf of protectedUsers.
 */
export declare const AAVE_PROTECTION_CALLBACK_ABI: readonly [{
    readonly name: "createProtectionConfig";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "protectedUser";
    }, {
        readonly type: "uint8";
        readonly name: "protectionType";
    }, {
        readonly type: "uint256";
        readonly name: "healthFactorThreshold";
    }, {
        readonly type: "uint256";
        readonly name: "targetHealthFactor";
    }, {
        readonly type: "address";
        readonly name: "collateralAsset";
    }, {
        readonly type: "address";
        readonly name: "debtAsset";
    }, {
        readonly type: "bool";
        readonly name: "preferDebtRepayment";
    }, {
        readonly type: "uint256";
        readonly name: "duration";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "checkAndProtectPositions";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "sender";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "pauseProtectionConfig";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "resumeProtectionConfig";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "cancelProtectionConfig";
    readonly type: "function";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
    }];
    readonly outputs: readonly [];
}, {
    readonly name: "getCurrentHealthFactor";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "user";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "protectionConfigs";
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
        readonly name: "protectedUser";
    }, {
        readonly type: "uint8";
        readonly name: "protectionType";
    }, {
        readonly type: "uint256";
        readonly name: "healthFactorThreshold";
    }, {
        readonly type: "uint256";
        readonly name: "targetHealthFactor";
    }, {
        readonly type: "address";
        readonly name: "collateralAsset";
    }, {
        readonly type: "address";
        readonly name: "debtAsset";
    }, {
        readonly type: "bool";
        readonly name: "preferDebtRepayment";
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
        readonly name: "lastExecutedAt";
    }, {
        readonly type: "uint8";
        readonly name: "executionCount";
    }, {
        readonly type: "uint8";
        readonly name: "consecutiveFailures";
    }, {
        readonly type: "uint256";
        readonly name: "lastExecutionAttempt";
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
    readonly name: "getAssetPrice";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "asset";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "getUserProtection";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly type: "address";
        readonly name: "user";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
        readonly name: "isActive";
    }, {
        readonly type: "uint8";
        readonly name: "protectionType";
    }, {
        readonly type: "uint256";
        readonly name: "healthFactorThreshold";
    }, {
        readonly type: "uint256";
        readonly name: "targetHealthFactor";
    }, {
        readonly type: "address";
        readonly name: "collateralAsset";
    }, {
        readonly type: "address";
        readonly name: "debtAsset";
    }, {
        readonly type: "bool";
        readonly name: "preferDebtRepayment";
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
    readonly name: "nextConfigId";
    readonly type: "function";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly name: "ProtectionConfigured";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
        readonly indexed: true;
    }, {
        readonly type: "uint8";
        readonly name: "protectionType";
    }, {
        readonly type: "uint256";
        readonly name: "healthFactorThreshold";
    }, {
        readonly type: "uint256";
        readonly name: "targetHealthFactor";
    }, {
        readonly type: "address";
        readonly name: "collateralAsset";
    }, {
        readonly type: "address";
        readonly name: "debtAsset";
    }];
}, {
    readonly name: "ProtectionExecuted";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
        readonly indexed: true;
    }, {
        readonly type: "string";
        readonly name: "protectionMethod";
    }, {
        readonly type: "address";
        readonly name: "asset";
    }, {
        readonly type: "uint256";
        readonly name: "amount";
    }, {
        readonly type: "uint256";
        readonly name: "previousHealthFactor";
    }, {
        readonly type: "uint256";
        readonly name: "newHealthFactor";
    }];
}, {
    readonly name: "ProtectionCheckFailed";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
        readonly indexed: true;
    }, {
        readonly type: "string";
        readonly name: "reason";
    }];
}, {
    readonly name: "ProtectionPaused";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
        readonly indexed: true;
    }];
}, {
    readonly name: "ProtectionResumed";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
        readonly indexed: true;
    }];
}, {
    readonly name: "ProtectionCancelled";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "configId";
        readonly indexed: true;
    }];
}, {
    readonly name: "ProtectionCycleCompleted";
    readonly type: "event";
    readonly inputs: readonly [{
        readonly type: "uint256";
        readonly name: "timestamp";
    }, {
        readonly type: "uint256";
        readonly name: "totalConfigsChecked";
    }, {
        readonly type: "uint256";
        readonly name: "protectionsExecuted";
    }];
}];
//# sourceMappingURL=aave-protection-callback.d.ts.map