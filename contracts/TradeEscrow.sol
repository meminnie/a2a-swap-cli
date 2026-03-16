// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title TradeEscrow - One-time-use escrow for a single OTC swap
/// @notice Deployed per trade via CREATE2. Seller sends tokens before deployment.
///         Buyer sends tokens after deployment. Operator calls settle/refund.
contract TradeEscrow {
    using SafeERC20 for IERC20;

    address public immutable seller;
    address public immutable buyer;
    address public immutable sellToken;
    address public immutable buyToken;
    uint256 public immutable sellAmount;
    uint256 public immutable buyAmount;
    uint256 public immutable feeBps;
    address public immutable feeRecipient;
    address public immutable operator;
    uint256 public immutable deadline;

    bool public settled;
    bool public refunded;

    event Settled(
        address indexed seller,
        address indexed buyer,
        uint256 sellAmount,
        uint256 buyAmount,
        uint256 sellFee,
        uint256 buyFee
    );
    event Refunded(address indexed seller, address indexed buyer);

    error OnlyOperator();
    error AlreadySettled();
    error AlreadyRefunded();
    error DeadlineNotReached();
    error DeadlinePassed();
    error InsufficientSellDeposit();
    error InsufficientBuyDeposit();
    error NotRescuable();

    constructor(
        address _seller,
        address _buyer,
        address _sellToken,
        address _buyToken,
        uint256 _sellAmount,
        uint256 _buyAmount,
        uint256 _feeBps,
        address _feeRecipient,
        address _operator,
        uint256 _deadline
    ) {
        seller = _seller;
        buyer = _buyer;
        sellToken = _sellToken;
        buyToken = _buyToken;
        sellAmount = _sellAmount;
        buyAmount = _buyAmount;
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
        operator = _operator;
        deadline = _deadline;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    /// @notice Settle the swap — requires both tokens deposited via direct transfer
    /// @dev Seller sends sellToken before deployment (CREATE2), buyer sends buyToken after
    function settle() external onlyOperator {
        if (settled) revert AlreadySettled();
        if (refunded) revert AlreadyRefunded();
        if (block.timestamp > deadline) revert DeadlinePassed();

        uint256 sellBalance = IERC20(sellToken).balanceOf(address(this));
        uint256 buyBalance = IERC20(buyToken).balanceOf(address(this));

        if (sellBalance < sellAmount) revert InsufficientSellDeposit();
        if (buyBalance < buyAmount) revert InsufficientBuyDeposit();

        settled = true;

        uint256 sellFee = (sellAmount * feeBps) / 10_000;
        uint256 buyFee = (buyAmount * feeBps) / 10_000;

        // Buyer receives sellToken minus fee
        IERC20(sellToken).safeTransfer(buyer, sellAmount - sellFee);
        // Seller receives buyToken minus fee
        IERC20(buyToken).safeTransfer(seller, buyAmount - buyFee);

        // Fees to recipient
        if (sellFee > 0) {
            IERC20(sellToken).safeTransfer(feeRecipient, sellFee);
        }
        if (buyFee > 0) {
            IERC20(buyToken).safeTransfer(feeRecipient, buyFee);
        }

        // Return any excess tokens (overpayment protection)
        uint256 sellExcess = sellBalance - sellAmount;
        uint256 buyExcess = buyBalance - buyAmount;
        if (sellExcess > 0) {
            IERC20(sellToken).safeTransfer(seller, sellExcess);
        }
        if (buyExcess > 0) {
            IERC20(buyToken).safeTransfer(buyer, buyExcess);
        }

        emit Settled(seller, buyer, sellAmount, buyAmount, sellFee, buyFee);
    }

    /// @notice Refund tokens to original depositors after deadline
    function refund() external onlyOperator {
        if (settled) revert AlreadySettled();
        if (refunded) revert AlreadyRefunded();
        if (block.timestamp <= deadline) revert DeadlineNotReached();

        refunded = true;

        uint256 sellBalance = IERC20(sellToken).balanceOf(address(this));
        uint256 buyBalance = IERC20(buyToken).balanceOf(address(this));

        if (sellBalance > 0) {
            IERC20(sellToken).safeTransfer(seller, sellBalance);
        }
        if (buyBalance > 0) {
            IERC20(buyToken).safeTransfer(buyer, buyBalance);
        }

        emit Refunded(seller, buyer);
    }

    /// @notice Rescue tokens mistakenly sent to this address (not sellToken or buyToken)
    /// @param token The ERC20 token to rescue
    /// @param to Where to send the rescued tokens
    function rescueToken(address token, address to) external onlyOperator {
        if (token == sellToken || token == buyToken) revert NotRescuable();
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(to, balance);
        }
    }
}
