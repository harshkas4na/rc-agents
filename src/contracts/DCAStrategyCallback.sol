// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2024-2026 Harsh Kasana
pragma solidity ^0.8.20;

import "../../lib/reactive-lib/src/abstract-base/AbstractCallback.sol";
import "../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "./RescuableBase.sol";

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external returns (uint256 amountOut);
}

/**
 * @title DCAStrategyCallback
 * @notice Agent-facing DCA (Dollar Cost Averaging) strategy on Uniswap V3
 * @dev Any agent (wallet) can create and manage their own DCA configs.
 *      msg.sender = the agent's wallet = the config user.
 *      Each config specifies periodic swaps tokenIn → tokenOut via Uniswap V3.
 *      The RC triggers executeDCAOrders() on each CRON tick.
 *      Agents must approve this contract to spend their tokenIn.
 *      Owner retains admin-only rescue functions.
 */
contract DCAStrategyCallback is AbstractCallback, RescuableBase {
    using SafeERC20 for IERC20;

    // DCA config status
    enum DCAStatus {
        Active,
        Paused,
        Cancelled,
        Completed
    }

    // DCA configuration struct
    struct DCAConfig {
        uint256 id;
        address user;               // address whose tokens are swapped
        address tokenIn;            // token to sell
        address tokenOut;           // token to buy
        uint256 amountPerSwap;      // amount of tokenIn per swap
        uint24 poolFee;             // Uniswap V3 pool fee tier (500, 3000, 10000)
        uint256 totalSwaps;         // total number of swaps to execute
        uint256 swapsExecuted;      // number of swaps completed so far
        uint256 totalAmountOut;     // cumulative tokenOut received
        uint256 swapInterval;       // minimum seconds between swaps
        uint256 minAmountOut;       // minimum tokenOut per swap (slippage protection)
        DCAStatus status;
        uint256 createdAt;
        uint256 expiresAt;          // unix timestamp when config expires (0 = never)
        uint256 lastSwapAt;         // timestamp of last successful swap
        uint8 consecutiveFailures;
        uint256 lastAttemptAt;
    }

    // Events — RC subscribes to these
    event DCAConfigCreated(
        uint256 indexed configId,
        address tokenIn,
        address tokenOut,
        uint256 amountPerSwap,
        uint24 poolFee,
        uint256 totalSwaps
    );

    event DCASwapExecuted(
        uint256 indexed configId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    event DCAConfigCompleted(uint256 indexed configId);
    event DCAConfigCancelled(uint256 indexed configId);
    event DCAConfigPaused(uint256 indexed configId);
    event DCAConfigResumed(uint256 indexed configId);

    event DCACycleCompleted(
        uint256 timestamp,
        uint256 totalConfigsChecked,
        uint256 swapsExecuted
    );

    event DCASwapFailed(uint256 indexed configId, string reason);

    // State variables
    address public immutable owner;
    address public immutable swapRouter;

    DCAConfig[] public dcaConfigs;
    uint256 public nextConfigId;

    // Configuration
    uint8 private constant MAX_CONSECUTIVE_FAILURES = 5;
    uint256 private constant RETRY_COOLDOWN = 30; // 30 seconds

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    modifier validConfig(uint256 configId) {
        require(configId < dcaConfigs.length, "Config does not exist");
        _;
    }

    /// @dev Allow the config's user (agent) or the contract owner (admin)
    modifier configOwnerOrAdmin(uint256 configId) {
        require(configId < dcaConfigs.length, "Config does not exist");
        require(
            msg.sender == dcaConfigs[configId].user || msg.sender == owner,
            "Not config owner or admin"
        );
        _;
    }

    constructor(
        address _owner,
        address _callbackSender,
        address _swapRouter
    ) payable AbstractCallback(_callbackSender) {
        owner = _owner;
        swapRouter = _swapRouter;
    }

    /**
     * @notice Creates a new DCA configuration
     * @dev Any agent can call this. msg.sender becomes the config user.
     *      The agent must approve this contract to spend tokenIn BEFORE
     *      the first swap executes.
     * @param _tokenIn Token to sell on each swap
     * @param _tokenOut Token to buy on each swap
     * @param _amountPerSwap Amount of tokenIn per swap (in token decimals)
     * @param _poolFee Uniswap V3 pool fee tier (500=0.05%, 3000=0.3%, 10000=1%)
     * @param _totalSwaps Total number of swaps to execute (0 = unlimited until expiry)
     * @param _swapInterval Minimum seconds between swaps
     * @param _minAmountOut Minimum tokenOut per swap for slippage protection (0 = no limit)
     * @param _duration Seconds the config should remain active (0 = no expiry)
     */
    function createDCAConfig(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountPerSwap,
        uint24 _poolFee,
        uint256 _totalSwaps,
        uint256 _swapInterval,
        uint256 _minAmountOut,
        uint256 _duration
    ) external returns (uint256) {
        require(_tokenIn != address(0), "Invalid tokenIn");
        require(_tokenOut != address(0), "Invalid tokenOut");
        require(_tokenIn != _tokenOut, "Tokens must differ");
        require(_amountPerSwap > 0, "Amount must be > 0");
        require(
            _poolFee == 500 || _poolFee == 3000 || _poolFee == 10000,
            "Invalid pool fee"
        );
        require(_totalSwaps > 0 || _duration > 0, "Need totalSwaps or duration");
        require(_swapInterval >= 60, "Interval too short");

        uint256 configId = nextConfigId;
        dcaConfigs.push(
            DCAConfig({
                id: configId,
                user: msg.sender,
                tokenIn: _tokenIn,
                tokenOut: _tokenOut,
                amountPerSwap: _amountPerSwap,
                poolFee: _poolFee,
                totalSwaps: _totalSwaps,
                swapsExecuted: 0,
                totalAmountOut: 0,
                swapInterval: _swapInterval,
                minAmountOut: _minAmountOut,
                status: DCAStatus.Active,
                createdAt: block.timestamp,
                expiresAt: _duration > 0 ? block.timestamp + _duration : 0,
                lastSwapAt: 0,
                consecutiveFailures: 0,
                lastAttemptAt: 0
            })
        );

        nextConfigId++;

        emit DCAConfigCreated(
            configId,
            _tokenIn,
            _tokenOut,
            _amountPerSwap,
            _poolFee,
            _totalSwaps
        );

        return configId;
    }

    /**
     * @notice Execute pending DCA orders (called by RC via CRON)
     * @dev Main entry point from the reactive contract
     */
    function executeDCAOrders(
        address /*sender*/
    ) external authorizedSenderOnly {
        uint256 totalConfigsChecked = 0;
        uint256 swapsExecuted = 0;

        for (uint256 i = 0; i < dcaConfigs.length; i++) {
            DCAConfig storage config = dcaConfigs[i];

            if (config.status != DCAStatus.Active) {
                continue;
            }

            // Auto-expire: cancel if past expiry
            if (config.expiresAt > 0 && block.timestamp > config.expiresAt) {
                config.status = DCAStatus.Cancelled;
                emit DCAConfigCancelled(i);
                continue;
            }

            // Auto-complete: all swaps done
            if (config.totalSwaps > 0 && config.swapsExecuted >= config.totalSwaps) {
                config.status = DCAStatus.Completed;
                emit DCAConfigCompleted(i);
                continue;
            }

            totalConfigsChecked++;

            try this._executeDCASwap(i) returns (bool wasSwapped) {
                if (wasSwapped) {
                    swapsExecuted++;
                }
            } catch {
                emit DCASwapFailed(
                    i,
                    "Unexpected error during DCA swap"
                );
            }
        }

        emit DCACycleCompleted(
            block.timestamp,
            totalConfigsChecked,
            swapsExecuted
        );
    }

    /**
     * @notice Internal function to execute a single DCA swap
     */
    function _executeDCASwap(uint256 configId) external returns (bool) {
        require(msg.sender == address(this), "Internal function");

        DCAConfig storage config = dcaConfigs[configId];

        // Check swap interval
        if (
            config.lastSwapAt > 0 &&
            block.timestamp < config.lastSwapAt + config.swapInterval
        ) {
            return false;
        }

        // Check retry cooldown
        if (
            config.lastAttemptAt > 0 &&
            block.timestamp < config.lastAttemptAt + RETRY_COOLDOWN
        ) {
            return false;
        }

        config.lastAttemptAt = block.timestamp;

        // Check user balance and allowance
        uint256 userBalance = IERC20(config.tokenIn).balanceOf(config.user);
        if (userBalance < config.amountPerSwap) {
            _handleSwapFailure(configId, "Insufficient user balance");
            return false;
        }

        uint256 allowance = IERC20(config.tokenIn).allowance(
            config.user,
            address(this)
        );
        if (allowance < config.amountPerSwap) {
            _handleSwapFailure(configId, "Insufficient allowance");
            return false;
        }

        // Transfer tokenIn from user to this contract
        IERC20(config.tokenIn).safeTransferFrom(
            config.user,
            address(this),
            config.amountPerSwap
        );

        // Approve swap router
        IERC20(config.tokenIn).forceApprove(
            swapRouter,
            config.amountPerSwap
        );

        // Execute swap via Uniswap V3
        uint256 amountOut = ISwapRouter(swapRouter).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: config.tokenIn,
                tokenOut: config.tokenOut,
                fee: config.poolFee,
                recipient: config.user,
                amountIn: config.amountPerSwap,
                amountOutMinimum: config.minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );

        // Update config state
        config.swapsExecuted++;
        config.totalAmountOut += amountOut;
        config.lastSwapAt = block.timestamp;
        config.consecutiveFailures = 0;

        emit DCASwapExecuted(
            configId,
            config.tokenIn,
            config.tokenOut,
            config.amountPerSwap,
            amountOut
        );

        // Auto-complete if all swaps done
        if (config.totalSwaps > 0 && config.swapsExecuted >= config.totalSwaps) {
            config.status = DCAStatus.Completed;
            emit DCAConfigCompleted(configId);
        }

        return true;
    }

    /**
     * @notice Handle swap failure with consecutive failure tracking
     */
    function _handleSwapFailure(uint256 configId, string memory reason) internal {
        DCAConfig storage config = dcaConfigs[configId];
        config.consecutiveFailures++;

        if (config.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            config.status = DCAStatus.Cancelled;
            emit DCAConfigCancelled(configId);
            emit DCASwapFailed(
                configId,
                "Auto-cancelled: max consecutive failures reached"
            );
        } else {
            emit DCASwapFailed(configId, reason);
        }
    }

    // ── Config management ──────────────────────────────────────────────────

    function cancelDCAConfig(
        uint256 configId
    ) external configOwnerOrAdmin(configId) {
        DCAConfig storage config = dcaConfigs[configId];
        require(
            config.status == DCAStatus.Active ||
                config.status == DCAStatus.Paused,
            "Cannot cancel config"
        );

        config.status = DCAStatus.Cancelled;
        emit DCAConfigCancelled(configId);
    }

    function pauseDCAConfig(
        uint256 configId
    ) external configOwnerOrAdmin(configId) {
        DCAConfig storage config = dcaConfigs[configId];
        require(
            config.status == DCAStatus.Active,
            "Config is not active"
        );

        config.status = DCAStatus.Paused;
        emit DCAConfigPaused(configId);
    }

    function resumeDCAConfig(
        uint256 configId
    ) external configOwnerOrAdmin(configId) {
        DCAConfig storage config = dcaConfigs[configId];
        require(
            config.status == DCAStatus.Paused,
            "Config is not paused"
        );

        config.status = DCAStatus.Active;
        emit DCAConfigResumed(configId);
    }

    // ── View functions ──────────────────────────────────────────────────────

    function getAllConfigs() external view returns (uint256[] memory) {
        uint256[] memory allConfigIds = new uint256[](dcaConfigs.length);
        for (uint256 i = 0; i < dcaConfigs.length; i++) {
            allConfigIds[i] = i;
        }
        return allConfigIds;
    }

    function getActiveConfigs() external view returns (uint256[] memory) {
        uint256 activeCount = 0;

        for (uint256 i = 0; i < dcaConfigs.length; i++) {
            if (dcaConfigs[i].status == DCAStatus.Active) {
                activeCount++;
            }
        }

        uint256[] memory activeConfigs = new uint256[](activeCount);
        uint256 index = 0;

        for (uint256 i = 0; i < dcaConfigs.length; i++) {
            if (dcaConfigs[i].status == DCAStatus.Active) {
                activeConfigs[index] = i;
                index++;
            }
        }

        return activeConfigs;
    }

    function getUserConfigs(address user) external view returns (uint256[] memory) {
        uint256 count = 0;

        for (uint256 i = 0; i < dcaConfigs.length; i++) {
            if (dcaConfigs[i].user == user) {
                count++;
            }
        }

        uint256[] memory userConfigs = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = 0; i < dcaConfigs.length; i++) {
            if (dcaConfigs[i].user == user) {
                userConfigs[index] = i;
                index++;
            }
        }

        return userConfigs;
    }

    // ── Rescue functions ──────────────────────────────────────────────────

    function _rescueRecipient() internal view override returns (address) {
        return owner;
    }

    function rescueETH(uint256 amount) external override onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        _rescueETH(amount);
    }

    function rescueAllETH() external override onlyOwner {
        _rescueETH(0);
    }

    function rescueERC20(
        address token,
        uint256 amount
    ) external override onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        _rescueERC20(token, amount);
    }

    function rescueAllERC20(address token) external override onlyOwner {
        _rescueERC20(token, 0);
    }
}
