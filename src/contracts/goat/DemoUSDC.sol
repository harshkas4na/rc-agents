// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Harsh Kasana
pragma solidity ^0.8.20;

import "../../../lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

/**
 * @title DemoUSDC
 * @notice Testnet-only mintable stand-in for USDC, used to seed the demo
 *         GoatSwap-shaped pool on GOAT Testnet3 (no real USDC circulates
 *         there — GoatSwap and BIMA are mainnet-only, see /goat-research).
 *         6 decimals to match real USDC. Anyone can mint, since it is
 *         explicitly play money for demoing the DCA product's swap venue.
 */
contract DemoUSDC is ERC20 {
    constructor() ERC20("Demo USDC (GOAT Testnet3)", "dUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
