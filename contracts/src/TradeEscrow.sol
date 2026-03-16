// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title TradeEscrow - One-time-use escrow for a single OTC swap
/// @notice Deployed per trade via CREATE2. Holds tokens for both parties.
///         Amounts are managed off-chain; operator passes them at settlement.
///         Users can cancel or withdraw any token at any time before settlement.
contract TradeEscrow {
    using SafeERC20 for IERC20;

    address public immutable seller;
    address public immutable buyer;
    address public immutable sellToken;
    address public immutable buyToken;
    uint256 public immutable feeBps;
    address public immutable feeRecipient;
    address public immutable operator;
    uint256 public immutable deadline;

    bool public settled;
    bool public refunded;
    bool public cancelled;

    event Settled(
        address indexed seller,
        address indexed buyer,
        uint256 sellAmount,
        uint256 buyAmount,
        uint256 sellFee,
        uint256 buyFee
    );
    event Refunded(address indexed seller, address indexed buyer);
    event Cancelled(address indexed initiator);
    event TokenRescued(address indexed rescuer, address indexed token, uint256 amount);

    error OnlyOperator();
    error OnlyParty();
    error AlreadySettled();
    error AlreadyRefunded();
    error AlreadyCancelled();
    error DeadlineNotReached();
    error DeadlinePassed();
    error InsufficientSellDeposit();
    error InsufficientBuyDeposit();
    error ZeroAmount();

    constructor(
        address _seller,
        address _buyer,
        address _sellToken,
        address _buyToken,
        uint256 _feeBps,
        address _feeRecipient,
        address _operator,
        uint256 _deadline
    ) {
        seller = _seller;
        buyer = _buyer;
        sellToken = _sellToken;
        buyToken = _buyToken;
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
        operator = _operator;
        deadline = _deadline;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    modifier onlyParty() {
        if (msg.sender != seller && msg.sender != buyer) revert OnlyParty();
        _;
    }

    /// @notice Settle the swap — operator specifies amounts, capped by actual balance
    /// @param sellAmt Amount of sellToken to transfer to buyer (before fee)
    /// @param buyAmt Amount of buyToken to transfer to seller (before fee)
    function settle(uint256 sellAmt, uint256 buyAmt) external onlyOperator {
        if (settled) revert AlreadySettled();
        if (refunded) revert AlreadyRefunded();
        if (cancelled) revert AlreadyCancelled();
        if (block.timestamp > deadline) revert DeadlinePassed();
        if (sellAmt == 0 || buyAmt == 0) revert ZeroAmount();

        uint256 sellBalance = IERC20(sellToken).balanceOf(address(this));
        uint256 buyBalance = IERC20(buyToken).balanceOf(address(this));

        if (sellBalance < sellAmt) revert InsufficientSellDeposit();
        if (buyBalance < buyAmt) revert InsufficientBuyDeposit();

        settled = true;

        uint256 sellFee = (sellAmt * feeBps) / 10_000;
        uint256 buyFee = (buyAmt * feeBps) / 10_000;

        // Buyer receives sellToken minus fee
        IERC20(sellToken).safeTransfer(buyer, sellAmt - sellFee);
        // Seller receives buyToken minus fee
        IERC20(buyToken).safeTransfer(seller, buyAmt - buyFee);

        // Fees to recipient
        if (sellFee > 0) {
            IERC20(sellToken).safeTransfer(feeRecipient, sellFee);
        }
        if (buyFee > 0) {
            IERC20(buyToken).safeTransfer(feeRecipient, buyFee);
        }

        // Return any excess tokens
        uint256 sellExcess = sellBalance - sellAmt;
        uint256 buyExcess = buyBalance - buyAmt;
        if (sellExcess > 0) {
            IERC20(sellToken).safeTransfer(seller, sellExcess);
        }
        if (buyExcess > 0) {
            IERC20(buyToken).safeTransfer(buyer, buyExcess);
        }

        emit Settled(seller, buyer, sellAmt, buyAmt, sellFee, buyFee);
    }

    /// @notice Refund all tokens to original depositors after deadline
    function refund() external onlyOperator {
        if (settled) revert AlreadySettled();
        if (refunded) revert AlreadyRefunded();
        if (cancelled) revert AlreadyCancelled();
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

    /// @notice Cancel the trade — either party can cancel before settlement
    function cancel() external onlyParty {
        if (settled) revert AlreadySettled();
        if (refunded) revert AlreadyRefunded();
        if (cancelled) revert AlreadyCancelled();

        cancelled = true;

        uint256 sellBalance = IERC20(sellToken).balanceOf(address(this));
        uint256 buyBalance = IERC20(buyToken).balanceOf(address(this));

        if (sellBalance > 0) {
            IERC20(sellToken).safeTransfer(seller, sellBalance);
        }
        if (buyBalance > 0) {
            IERC20(buyToken).safeTransfer(buyer, buyBalance);
        }

        emit Cancelled(msg.sender);
    }

    /// @notice Rescue any token — seller/buyer can withdraw their tokens at any time
    /// @dev sellToken goes to seller, buyToken goes to buyer, other tokens go to caller
    /// @param token The ERC20 token to rescue
    function rescueToken(address token) external onlyParty {
        if (settled) revert AlreadySettled();
        if (refunded) revert AlreadyRefunded();
        if (cancelled) revert AlreadyCancelled();

        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) return;

        address recipient;
        if (token == sellToken) {
            recipient = seller;
        } else if (token == buyToken) {
            recipient = buyer;
        } else {
            recipient = msg.sender;
        }

        IERC20(token).safeTransfer(recipient, balance);
        emit TokenRescued(recipient, token, balance);
    }
}
