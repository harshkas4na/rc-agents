// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2024-2026 Harsh Kasana
pragma solidity >=0.8.0;

import "../../lib/reactive-lib/src/interfaces/IReactive.sol";
import "../../lib/reactive-lib/src/abstract-base/AbstractPausableReactive.sol";
import "../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title DCAStrategyReactive
 * @notice Reactive smart contract for DCA strategy automation on Uniswap V3
 * @dev Paired with DCAStrategyCallback on the destination chain (Base Sepolia)
 */
contract DCAStrategyReactive is IReactive, AbstractPausableReactive {
    event ConfigTracked(uint256 indexed configId);

    event ConfigUntracked(uint256 indexed configId);

    event DCACheckTriggered(uint256 timestamp, uint256 blockNumber);

    event DCACycleCompleted(uint256 timestamp);

    event CronSubscriptionChanged(bool subscribed, uint256 topic);

    // Destination chain ID (Base Sepolia = 84532)
    uint256 public immutable destinationChainId;

    // Event topic_0 hashes — computed via: cast keccak "EventSignature(types)"
    uint256 private constant DCA_CONFIG_CREATED_TOPIC_0 =
        0xb750d953f595f74bf13d867514140881ec445db7a6316c0673945e06bcae4654; // keccak256("DCAConfigCreated(uint256,address,address,uint256,uint24,uint256)")
    uint256 private constant DCA_SWAP_EXECUTED_TOPIC_0 =
        0x04b73db40d5bb8ff22af422cc7bd66ffde9c3719780a7333ecfbc635bc0ace31; // keccak256("DCASwapExecuted(uint256,address,address,uint256,uint256)")
    uint256 private constant DCA_CONFIG_COMPLETED_TOPIC_0 =
        0xd286970157a4591bad40956b862d0c97d3c5bd13b929c882401c9a06b73a9a1b; // keccak256("DCAConfigCompleted(uint256)")
    uint256 private constant DCA_CONFIG_CANCELLED_TOPIC_0 =
        0x5d0867099ed54909d098484227ea8e6b419a1a4f2764da3c11887185d3d71dab; // keccak256("DCAConfigCancelled(uint256)")
    uint256 private constant DCA_CONFIG_PAUSED_TOPIC_0 =
        0xd7445c0f699fff5a5b90825b569bf6cc053fea304f0a1573a74b30450fe52646; // keccak256("DCAConfigPaused(uint256)")
    uint256 private constant DCA_CONFIG_RESUMED_TOPIC_0 =
        0x2f4c1e18d0a0457d701daed0c61d1317181a1253b46bc5c86aed070009bd2d79; // keccak256("DCAConfigResumed(uint256)")
    uint256 private constant DCA_CYCLE_COMPLETED_TOPIC_0 =
        0x088bea9c772ddc5ac414f36b0a110ce5c18e4d0ab5c5e81b6175c0f94e3b2a8a; // keccak256("DCACycleCompleted(uint256,uint256,uint256)")

    uint64 private constant CALLBACK_GAS_LIMIT = 2000000;

    // The callback proxy address on the Reactive Network
    address private constant RN_CALLBACK_PROXY =
        0x0000000000000000000000000000000000fffFfF;

    // Mirrors the callback contract's DCAStatus enum
    enum DCAStatus {
        Active,
        Paused,
        Cancelled,
        Completed
    }

    struct TrackedConfig {
        uint256 id;
        DCAStatus status;
        uint256 lastTriggeredAt;
        uint8 triggerCount;
    }

    address public immutable dcaCallback;
    uint256 public cronTopic;

    bool public cronSubscribed;
    uint256 public activeConfigCount;

    mapping(uint256 => TrackedConfig) public trackedConfigs;
    mapping(uint256 => bool) public isTracked;
    uint256[] public configIds;

    // Restrict to calls from the RN callback proxy (self-callbacks)
    modifier callbackOnly() {
        require(msg.sender == RN_CALLBACK_PROXY, "Callback proxy only");
        _;
    }

    constructor(
        address _owner,
        address _dcaCallback,
        uint256 _cronTopic,
        uint256 _destinationChainId
    ) payable {
        owner = _owner;
        dcaCallback = _dcaCallback;
        cronTopic = _cronTopic;
        destinationChainId = _destinationChainId;
        cronSubscribed = false;
        activeConfigCount = 0;

        if (!vm) {
            // Subscribe to CC lifecycle events
            service.subscribe(
                destinationChainId,
                dcaCallback,
                DCA_CONFIG_CREATED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );

            service.subscribe(
                destinationChainId,
                dcaCallback,
                DCA_SWAP_EXECUTED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );

            service.subscribe(
                destinationChainId,
                dcaCallback,
                DCA_CONFIG_COMPLETED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );

            service.subscribe(
                destinationChainId,
                dcaCallback,
                DCA_CONFIG_CANCELLED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );

            service.subscribe(
                destinationChainId,
                dcaCallback,
                DCA_CONFIG_PAUSED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );

            service.subscribe(
                destinationChainId,
                dcaCallback,
                DCA_CONFIG_RESUMED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );

            service.subscribe(
                destinationChainId,
                dcaCallback,
                DCA_CYCLE_COMPLETED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //                              REACT
    // ═══════════════════════════════════════════════════════════════════════

    function react(LogRecord calldata log) external vmOnly {
        // Handle cron ticks — trigger DCA execution on CC
        if (log.topic_0 == cronTopic) {
            emit DCACheckTriggered(block.timestamp, block.number);

            emit Callback(
                destinationChainId,
                dcaCallback,
                CALLBACK_GAS_LIMIT,
                abi.encodeWithSignature(
                    "executeDCAOrders(address)",
                    address(0)
                )
            );
        } else if (
            log._contract == dcaCallback &&
            log.topic_0 == DCA_CYCLE_COMPLETED_TOPIC_0
        ) {
            emit DCACycleCompleted(block.timestamp);
        } else if (log._contract == dcaCallback) {
            _processDCAEvent(log);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //          CALLBACK-ONLY STATE PERSISTENCE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    function persistConfigCreated(
        address /* sender */,
        uint256 configId
    ) external callbackOnly {
        if (isTracked[configId]) return;

        trackedConfigs[configId] = TrackedConfig({
            id: configId,
            status: DCAStatus.Active,
            lastTriggeredAt: 0,
            triggerCount: 0
        });

        isTracked[configId] = true;
        configIds.push(configId);

        // Lazy cron subscription: subscribe when first active config arrives
        if (activeConfigCount == 0 && !cronSubscribed && !paused) {
            service.subscribe(
                block.chainid,
                address(service),
                cronTopic,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
            cronSubscribed = true;
            emit CronSubscriptionChanged(true, cronTopic);
        }

        activeConfigCount++;
        emit ConfigTracked(configId);
    }

    function persistConfigCancelled(
        address /* sender */,
        uint256 configId
    ) external callbackOnly {
        if (isTracked[configId]) {
            if (trackedConfigs[configId].status == DCAStatus.Active) {
                activeConfigCount--;
                if (activeConfigCount == 0 && cronSubscribed) {
                    service.unsubscribe(
                        block.chainid,
                        address(service),
                        cronTopic,
                        REACTIVE_IGNORE,
                        REACTIVE_IGNORE,
                        REACTIVE_IGNORE
                    );
                    cronSubscribed = false;
                    emit CronSubscriptionChanged(false, cronTopic);
                }
            }
            trackedConfigs[configId].status = DCAStatus.Cancelled;
            emit ConfigUntracked(configId);
        }
    }

    function persistConfigCompleted(
        address /* sender */,
        uint256 configId
    ) external callbackOnly {
        if (isTracked[configId]) {
            if (trackedConfigs[configId].status == DCAStatus.Active) {
                activeConfigCount--;
                if (activeConfigCount == 0 && cronSubscribed) {
                    service.unsubscribe(
                        block.chainid,
                        address(service),
                        cronTopic,
                        REACTIVE_IGNORE,
                        REACTIVE_IGNORE,
                        REACTIVE_IGNORE
                    );
                    cronSubscribed = false;
                    emit CronSubscriptionChanged(false, cronTopic);
                }
            }
            trackedConfigs[configId].status = DCAStatus.Completed;
            emit ConfigUntracked(configId);
        }
    }

    function persistSwapExecuted(
        address /* sender */,
        uint256 configId
    ) external callbackOnly {
        if (isTracked[configId]) {
            trackedConfigs[configId].lastTriggeredAt = 0;
            trackedConfigs[configId].triggerCount = 0;
        }
    }

    function persistConfigPaused(
        address /* sender */,
        uint256 configId
    ) external callbackOnly {
        if (isTracked[configId]) {
            if (trackedConfigs[configId].status == DCAStatus.Active) {
                activeConfigCount--;
                if (activeConfigCount == 0 && cronSubscribed) {
                    service.unsubscribe(
                        block.chainid,
                        address(service),
                        cronTopic,
                        REACTIVE_IGNORE,
                        REACTIVE_IGNORE,
                        REACTIVE_IGNORE
                    );
                    cronSubscribed = false;
                    emit CronSubscriptionChanged(false, cronTopic);
                }
            }
            trackedConfigs[configId].status = DCAStatus.Paused;
        }
    }

    function persistConfigResumed(
        address /* sender */,
        uint256 configId
    ) external callbackOnly {
        if (isTracked[configId]) {
            if (trackedConfigs[configId].status == DCAStatus.Paused) {
                if (activeConfigCount == 0 && !cronSubscribed && !paused) {
                    service.subscribe(
                        block.chainid,
                        address(service),
                        cronTopic,
                        REACTIVE_IGNORE,
                        REACTIVE_IGNORE,
                        REACTIVE_IGNORE
                    );
                    cronSubscribed = true;
                    emit CronSubscriptionChanged(true, cronTopic);
                }
                activeConfigCount++;
            }
            trackedConfigs[configId].status = DCAStatus.Active;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //          REACT HELPERS (emit self-callbacks, no direct state writes)
    // ═══════════════════════════════════════════════════════════════════════

    function _processDCAEvent(LogRecord calldata log) internal {
        if (log.topic_0 == DCA_CONFIG_CREATED_TOPIC_0) {
            _processConfigCreated(log);
        } else if (log.topic_0 == DCA_CONFIG_CANCELLED_TOPIC_0) {
            _processConfigCancelled(log);
        } else if (log.topic_0 == DCA_CONFIG_COMPLETED_TOPIC_0) {
            _processConfigCompleted(log);
        } else if (log.topic_0 == DCA_SWAP_EXECUTED_TOPIC_0) {
            _processSwapExecuted(log);
        } else if (log.topic_0 == DCA_CONFIG_PAUSED_TOPIC_0) {
            _processConfigPaused(log);
        } else if (log.topic_0 == DCA_CONFIG_RESUMED_TOPIC_0) {
            _processConfigResumed(log);
        }
    }

    function _processConfigCreated(LogRecord calldata log) internal {
        uint256 configId = uint256(log.topic_1);

        emit Callback(
            block.chainid,
            address(this),
            CALLBACK_GAS_LIMIT,
            abi.encodeWithSignature(
                "persistConfigCreated(address,uint256)",
                address(0),
                configId
            )
        );
    }

    function _processConfigCancelled(LogRecord calldata log) internal {
        uint256 configId = uint256(log.topic_1);

        emit Callback(
            block.chainid,
            address(this),
            CALLBACK_GAS_LIMIT,
            abi.encodeWithSignature(
                "persistConfigCancelled(address,uint256)",
                address(0),
                configId
            )
        );
    }

    function _processConfigCompleted(LogRecord calldata log) internal {
        uint256 configId = uint256(log.topic_1);

        emit Callback(
            block.chainid,
            address(this),
            CALLBACK_GAS_LIMIT,
            abi.encodeWithSignature(
                "persistConfigCompleted(address,uint256)",
                address(0),
                configId
            )
        );
    }

    function _processSwapExecuted(LogRecord calldata log) internal {
        uint256 configId = uint256(log.topic_1);

        emit Callback(
            block.chainid,
            address(this),
            CALLBACK_GAS_LIMIT,
            abi.encodeWithSignature(
                "persistSwapExecuted(address,uint256)",
                address(0),
                configId
            )
        );
    }

    function _processConfigPaused(LogRecord calldata log) internal {
        uint256 configId = uint256(log.topic_1);

        emit Callback(
            block.chainid,
            address(this),
            CALLBACK_GAS_LIMIT,
            abi.encodeWithSignature(
                "persistConfigPaused(address,uint256)",
                address(0),
                configId
            )
        );
    }

    function _processConfigResumed(LogRecord calldata log) internal {
        uint256 configId = uint256(log.topic_1);

        emit Callback(
            block.chainid,
            address(this),
            CALLBACK_GAS_LIMIT,
            abi.encodeWithSignature(
                "persistConfigResumed(address,uint256)",
                address(0),
                configId
            )
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    //                          VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    function getActiveConfigs() external view returns (uint256[] memory) {
        uint256 activeCount = 0;

        for (uint256 i = 0; i < configIds.length; i++) {
            uint256 configId = configIds[i];
            if (trackedConfigs[configId].status == DCAStatus.Active) {
                activeCount++;
            }
        }

        uint256[] memory activeConfigs = new uint256[](activeCount);
        uint256 index = 0;

        for (uint256 i = 0; i < configIds.length; i++) {
            uint256 configId = configIds[i];
            if (trackedConfigs[configId].status == DCAStatus.Active) {
                activeConfigs[index] = configId;
                index++;
            }
        }

        return activeConfigs;
    }

    function getPausableSubscriptions()
        internal
        view
        override
        returns (Subscription[] memory)
    {
        if (!cronSubscribed) {
            return new Subscription[](0);
        }
        Subscription[] memory result = new Subscription[](1);
        result[0] = Subscription(
            block.chainid,
            address(service),
            cronTopic,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        return result;
    }

    function getDCACallback() external view returns (address) {
        return dcaCallback;
    }

    function getCronTopic() external view returns (uint256) {
        return cronTopic;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //                          RESCUE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    function rescueERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(to != address(0), "Invalid recipient address");
        SafeERC20.safeTransfer(IERC20(token), to, amount);
    }

    function rescueAllERC20(address token, address to) external onlyOwner {
        require(to != address(0), "Invalid recipient address");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No tokens to rescue");
        SafeERC20.safeTransfer(IERC20(token), to, balance);
    }

    function withdrawETH(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient ETH balance");

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    function withdrawAllETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");

        (bool success, ) = payable(msg.sender).call{value: balance}("");
        require(success, "ETH transfer failed");
    }
}
