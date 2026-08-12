// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Harsh Kasana
pragma solidity ^0.8.20;

import "../../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../../../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "../RescuableBase.sol";

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
 * @title DCAStrategyCallbackGoat
 * @notice DCA (Dollar Cost Averaging) strategy for GOAT Network, adapted from
 *         DCAStrategyCallback.sol (the Base Sepolia + Reactive Network
 *         version) to run without Reactive Network — GOAT is not a
 *         supported Reactive Network destination chain (verified against
 *         dev.reactive.network/origins-and-destinations, see
 *         /goat-research/03-agentkit-and-technical-fit.md).
 *
 * @dev The Base Sepolia version gates `executeDCAOrders` to a single
 *      trusted caller (the Reactive Network callback proxy). Without
 *      Reactive Network there is no equivalent trusted relay on GOAT, so
 *      this version follows the pattern GOAT's own BIMA protocol already
 *      uses for permissionless liquidations (see
 *      /goat-research/06-automation-alternatives.md): `executeDCAOrders`
 *      is callable by ANYONE, and pays a small bounty (funded by the
 *      server from the x402 payment, same money that funded RC gas in the
 *      old design) to whoever calls it and triggers a swap. Trustlessness
 *      comes from the function being open + audited + incentivized, not
 *      from trusting a single relay — the same trust model Reactive
 *      Network, Chainlink Automation, and Gelato all rest on anyway.
 */
contract DCAStrategyCallbackGoat is RescuableBase {
    using SafeERC20 for IERC20;

    enum DCAStatus {
        Active,
        Paused,
        Cancelled,
        Completed
    }

    struct DCAConfig {
        uint256 id;
        address user;
        address tokenIn;
        address tokenOut;
        uint256 amountPerSwap;
        uint24 poolFee;
        uint256 totalSwaps;
        uint256 swapsExecuted;
        uint256 totalAmountOut;
        uint256 swapInterval;
        uint256 minAmountOut;
        DCAStatus status;
        uint256 createdAt;
        uint256 expiresAt;
        uint256 lastSwapAt;
        uint8 consecutiveFailures;
        uint256 lastAttemptAt;
    }

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
    event DCACycleCompleted(uint256 timestamp, uint256 totalConfigsChecked, uint256 swapsExecuted);
    event DCASwapFailed(uint256 indexed configId, string reason);
    event BountyPaid(address indexed executor, uint256 amount);
    event BountyPoolFunded(address indexed funder, uint256 amount);

    address public immutable owner;
    address public immutable swapRouter;

    /// @notice Native-token bounty paid to whoever successfully calls executeDCAOrders()
    ///         and triggers at least one swap. Capped to the bounty pool's balance —
    ///         never reverts the swap itself if the pool is empty.
    uint256 public executionBounty;

    DCAConfig[] public dcaConfigs;
    uint256 public nextConfigId;

    uint8 private constant MAX_CONSECUTIVE_FAILURES = 5;
    uint256 private constant RETRY_COOLDOWN = 30;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    modifier validConfig(uint256 configId) {
        require(configId < dcaConfigs.length, "Config does not exist");
        _;
    }

    constructor(address _owner, address _swapRouter, uint256 _executionBounty) payable {
        owner = _owner;
        swapRouter = _swapRouter;
        executionBounty = _executionBounty;
    }

    receive() external payable {
        emit BountyPoolFunded(msg.sender, msg.value);
    }

    function setExecutionBounty(uint256 _executionBounty) external onlyOwner {
        executionBounty = _executionBounty;
    }

    function createDCAConfig(
        address _user,
        address _tokenIn,
        address _tokenOut,
        uint256 _amountPerSwap,
        uint24 _poolFee,
        uint256 _totalSwaps,
        uint256 _swapInterval,
        uint256 _minAmountOut,
        uint256 _duration
    ) external onlyOwner returns (uint256) {
        require(_user != address(0), "Invalid user");
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
                user: _user,
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

        emit DCAConfigCreated(configId, _tokenIn, _tokenOut, _amountPerSwap, _poolFee, _totalSwaps);

        return configId;
    }

    /**
     * @notice Execute pending DCA orders. Callable by ANYONE — see contract
     *         natspec for why. Pays `executionBounty` to msg.sender if at
     *         least one swap executed.
     */
    function executeDCAOrders() external returns (uint256 swapsExecuted) {
        uint256 totalConfigsChecked = 0;

        for (uint256 i = 0; i < dcaConfigs.length; i++) {
            DCAConfig storage config = dcaConfigs[i];

            if (config.status != DCAStatus.Active) {
                continue;
            }

            if (config.expiresAt > 0 && block.timestamp > config.expiresAt) {
                config.status = DCAStatus.Cancelled;
                emit DCAConfigCancelled(i);
                continue;
            }

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
                emit DCASwapFailed(i, "Unexpected error during DCA swap");
            }
        }

        emit DCACycleCompleted(block.timestamp, totalConfigsChecked, swapsExecuted);

        if (swapsExecuted > 0 && executionBounty > 0) {
            uint256 payout = executionBounty > address(this).balance ? address(this).balance : executionBounty;
            if (payout > 0) {
                (bool success, ) = payable(msg.sender).call{value: payout}("");
                if (success) emit BountyPaid(msg.sender, payout);
            }
        }
    }

    function _executeDCASwap(uint256 configId) external returns (bool) {
        require(msg.sender == address(this), "Internal function");

        DCAConfig storage config = dcaConfigs[configId];

        if (
            config.lastSwapAt > 0 &&
            block.timestamp < config.lastSwapAt + config.swapInterval
        ) {
            return false;
        }

        if (
            config.lastAttemptAt > 0 &&
            block.timestamp < config.lastAttemptAt + RETRY_COOLDOWN
        ) {
            return false;
        }

        config.lastAttemptAt = block.timestamp;

        uint256 userBalance = IERC20(config.tokenIn).balanceOf(config.user);
        if (userBalance < config.amountPerSwap) {
            _handleSwapFailure(configId, "Insufficient user balance");
            return false;
        }

        uint256 allowance = IERC20(config.tokenIn).allowance(config.user, address(this));
        if (allowance < config.amountPerSwap) {
            _handleSwapFailure(configId, "Insufficient allowance");
            return false;
        }

        IERC20(config.tokenIn).safeTransferFrom(config.user, address(this), config.amountPerSwap);
        IERC20(config.tokenIn).forceApprove(swapRouter, config.amountPerSwap);

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

        config.swapsExecuted++;
        config.totalAmountOut += amountOut;
        config.lastSwapAt = block.timestamp;
        config.consecutiveFailures = 0;

        emit DCASwapExecuted(configId, config.tokenIn, config.tokenOut, config.amountPerSwap, amountOut);

        if (config.totalSwaps > 0 && config.swapsExecuted >= config.totalSwaps) {
            config.status = DCAStatus.Completed;
            emit DCAConfigCompleted(configId);
        }

        return true;
    }

    function _handleSwapFailure(uint256 configId, string memory reason) internal {
        DCAConfig storage config = dcaConfigs[configId];
        config.consecutiveFailures++;

        if (config.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            config.status = DCAStatus.Cancelled;
            emit DCAConfigCancelled(configId);
            emit DCASwapFailed(configId, "Auto-cancelled: max consecutive failures reached");
        } else {
            emit DCASwapFailed(configId, reason);
        }
    }

    // ── Config management ──────────────────────────────────────────────────

    function cancelDCAConfig(uint256 configId) external onlyOwner validConfig(configId) {
        DCAConfig storage config = dcaConfigs[configId];
        require(
            config.status == DCAStatus.Active || config.status == DCAStatus.Paused,
            "Cannot cancel config"
        );
        config.status = DCAStatus.Cancelled;
        emit DCAConfigCancelled(configId);
    }

    function pauseDCAConfig(uint256 configId) external onlyOwner validConfig(configId) {
        DCAConfig storage config = dcaConfigs[configId];
        require(config.status == DCAStatus.Active, "Config is not active");
        config.status = DCAStatus.Paused;
        emit DCAConfigPaused(configId);
    }

    function resumeDCAConfig(uint256 configId) external onlyOwner validConfig(configId) {
        DCAConfig storage config = dcaConfigs[configId];
        require(config.status == DCAStatus.Paused, "Config is not paused");
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
            if (dcaConfigs[i].status == DCAStatus.Active) activeCount++;
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
            if (dcaConfigs[i].user == user) count++;
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

    function rescueERC20(address token, uint256 amount) external override onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        _rescueERC20(token, amount);
    }

    function rescueAllERC20(address token) external override onlyOwner {
        _rescueERC20(token, 0);
    }
}
