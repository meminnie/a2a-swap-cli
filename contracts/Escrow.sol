// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Escrow - P2P OTC swap escrow for AI agents
/// @notice Two-party token escrow: both deposit, then swap executes atomically
contract Escrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum OfferStatus {
        Open,
        Accepted,
        Settled,
        Cancelled,
        Expired
    }

    /// @dev Struct packed for gas optimization (6 storage slots)
    /// Slot 1: proposer(20) + status(1) + proposerDeposited(1) + acceptorDeposited(1) = 23 bytes
    /// Slot 2: acceptor(20) + deadline(6) + depositDeadline(6) = 32 bytes
    /// Slot 3: sellToken(20)
    /// Slot 4: sellAmount(32)
    /// Slot 5: buyToken(20)
    /// Slot 6: buyAmount(32)
    struct Offer {
        address proposer;
        OfferStatus status;
        bool proposerDeposited;
        bool acceptorDeposited;
        address acceptor;
        uint48 deadline;
        uint48 depositDeadline;
        address sellToken;
        uint256 sellAmount;
        address buyToken;
        uint256 buyAmount;
    }

    uint48 public constant DEPOSIT_WINDOW = 5 minutes;
    uint256 public constant MAX_FEE_BPS = 100; // 1% max fee cap

    address public owner;
    address public feeRecipient;
    uint256 public feeBps; // basis points (10 = 0.1%)
    uint256 public totalFeesCollected;

    uint256 public nextOfferId;
    mapping(uint256 => Offer) public offers;

    constructor(address _feeRecipient, uint256 _feeBps) {
        if (_feeRecipient == address(0)) revert InvalidFeeRecipient();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        owner = msg.sender;
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
    }

    event OfferCreated(
        uint256 indexed offerId,
        address indexed proposer,
        address sellToken,
        uint256 sellAmount,
        address buyToken,
        uint256 buyAmount,
        uint256 deadline
    );
    event OfferAccepted(uint256 indexed offerId, address indexed acceptor);
    event DepositMade(uint256 indexed offerId, address indexed depositor);
    event SwapSettled(uint256 indexed offerId);
    event OfferCancelled(uint256 indexed offerId);
    event OfferExpired(uint256 indexed offerId);
    event DepositTimeout(uint256 indexed offerId);
    event FeeCollected(uint256 indexed offerId, address token, uint256 amount);
    event FeeBpsUpdated(uint256 oldBps, uint256 newBps);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);
    event OwnershipTransferred(address oldOwner, address newOwner);

    error OfferNotOpen();
    error OfferNotAccepted();
    error NotParticipant();
    error AlreadyDeposited();
    error OfferExpiredErr();
    error OfferNotExpired();
    error OnlyProposer();
    error OnlyOwner();
    error InvalidAmount();
    error InvalidDuration();
    error SameToken();
    error DepositWindowExpired();
    error DepositWindowNotExpired();
    error BothDeposited();
    error FeeTooHigh();
    error InvalidFeeRecipient();

    /// @notice Create a new OTC swap offer
    function createOffer(
        address sellToken,
        uint256 sellAmount,
        address buyToken,
        uint256 buyAmount,
        uint256 duration
    ) external returns (uint256 offerId) {
        if (sellAmount == 0 || buyAmount == 0) revert InvalidAmount();
        if (duration == 0 || duration > 30 days) revert InvalidDuration();
        if (sellToken == buyToken) revert SameToken();

        offerId = nextOfferId++;
        uint48 dl = uint48(block.timestamp + duration);

        offers[offerId] = Offer({
            proposer: msg.sender,
            status: OfferStatus.Open,
            proposerDeposited: false,
            acceptorDeposited: false,
            acceptor: address(0),
            deadline: dl,
            depositDeadline: 0,
            sellToken: sellToken,
            sellAmount: sellAmount,
            buyToken: buyToken,
            buyAmount: buyAmount
        });

        emit OfferCreated(
            offerId,
            msg.sender,
            sellToken,
            sellAmount,
            buyToken,
            buyAmount,
            dl
        );
    }

    /// @notice Accept an open offer — starts the deposit window
    function acceptOffer(uint256 offerId) external {
        Offer storage offer = offers[offerId];
        if (offer.status != OfferStatus.Open) revert OfferNotOpen();
        if (block.timestamp >= offer.deadline) revert OfferExpiredErr();

        offer.acceptor = msg.sender;
        offer.status = OfferStatus.Accepted;

        // Deposit deadline = min(now + DEPOSIT_WINDOW, offer deadline)
        uint48 depDl = uint48(block.timestamp) + DEPOSIT_WINDOW;
        if (depDl > offer.deadline) {
            depDl = offer.deadline;
        }
        offer.depositDeadline = depDl;

        emit OfferAccepted(offerId, msg.sender);
    }

    /// @notice Deposit tokens into escrow (both parties must deposit)
    /// @dev Proposer can deposit when Open or Accepted; acceptor only when Accepted
    function deposit(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (block.timestamp >= offer.deadline) revert OfferExpiredErr();

        if (msg.sender == offer.proposer) {
            if (offer.status != OfferStatus.Open && offer.status != OfferStatus.Accepted)
                revert OfferNotOpen();
            // After acceptance, enforce deposit window
            if (offer.depositDeadline != 0 && block.timestamp >= offer.depositDeadline)
                revert DepositWindowExpired();
            if (offer.proposerDeposited) revert AlreadyDeposited();
            offer.proposerDeposited = true;
            IERC20(offer.sellToken).safeTransferFrom(
                msg.sender,
                address(this),
                offer.sellAmount
            );
        } else if (msg.sender == offer.acceptor) {
            if (offer.status != OfferStatus.Accepted) revert OfferNotAccepted();
            if (block.timestamp >= offer.depositDeadline) revert DepositWindowExpired();
            if (offer.acceptorDeposited) revert AlreadyDeposited();
            offer.acceptorDeposited = true;
            IERC20(offer.buyToken).safeTransferFrom(
                msg.sender,
                address(this),
                offer.buyAmount
            );
        } else {
            revert NotParticipant();
        }

        emit DepositMade(offerId, msg.sender);

        // If both deposited, settle automatically
        if (offer.proposerDeposited && offer.acceptorDeposited) {
            _settle(offerId);
        }
    }

    /// @notice Claim deposit timeout — refund depositors when counterparty didn't deposit in time
    function claimDepositTimeout(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (offer.status != OfferStatus.Accepted) revert OfferNotAccepted();
        if (block.timestamp < offer.depositDeadline) revert DepositWindowNotExpired();
        if (offer.proposerDeposited && offer.acceptorDeposited) revert BothDeposited();

        offer.status = OfferStatus.Expired;

        if (offer.proposerDeposited) {
            IERC20(offer.sellToken).safeTransfer(
                offer.proposer,
                offer.sellAmount
            );
        }
        if (offer.acceptorDeposited) {
            IERC20(offer.buyToken).safeTransfer(
                offer.acceptor,
                offer.buyAmount
            );
        }

        emit DepositTimeout(offerId);
    }

    /// @notice Cancel an open offer (only proposer), refunds deposit if any
    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (msg.sender != offer.proposer) revert OnlyProposer();
        if (offer.status != OfferStatus.Open) revert OfferNotOpen();

        offer.status = OfferStatus.Cancelled;

        if (offer.proposerDeposited) {
            IERC20(offer.sellToken).safeTransfer(
                offer.proposer,
                offer.sellAmount
            );
        }

        emit OfferCancelled(offerId);
    }

    /// @notice Refund deposits if offer expired without settlement
    /// @dev Works for both Open (proposer-only deposit) and Accepted (either/both deposits)
    function refund(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (block.timestamp < offer.deadline) revert OfferNotExpired();
        if (offer.status != OfferStatus.Open && offer.status != OfferStatus.Accepted)
            revert OfferNotOpen();

        offer.status = OfferStatus.Expired;

        if (offer.proposerDeposited) {
            IERC20(offer.sellToken).safeTransfer(
                offer.proposer,
                offer.sellAmount
            );
        }
        if (offer.acceptorDeposited) {
            IERC20(offer.buyToken).safeTransfer(
                offer.acceptor,
                offer.buyAmount
            );
        }

        emit OfferExpired(offerId);
    }

    /// @dev Execute the swap — send tokens to counterparties, deduct protocol fee
    function _settle(uint256 offerId) internal {
        Offer storage offer = offers[offerId];
        offer.status = OfferStatus.Settled;

        uint256 sellFee = (offer.sellAmount * feeBps) / 10_000;
        uint256 buyFee = (offer.buyAmount * feeBps) / 10_000;

        // Proposer's sellToken goes to acceptor (minus fee)
        IERC20(offer.sellToken).safeTransfer(
            offer.acceptor,
            offer.sellAmount - sellFee
        );

        // Acceptor's buyToken goes to proposer (minus fee)
        IERC20(offer.buyToken).safeTransfer(
            offer.proposer,
            offer.buyAmount - buyFee
        );

        // Send fees to feeRecipient
        if (sellFee > 0) {
            IERC20(offer.sellToken).safeTransfer(feeRecipient, sellFee);
            emit FeeCollected(offerId, offer.sellToken, sellFee);
        }
        if (buyFee > 0) {
            IERC20(offer.buyToken).safeTransfer(feeRecipient, buyFee);
            emit FeeCollected(offerId, offer.buyToken, buyFee);
        }

        totalFeesCollected += sellFee + buyFee;
        emit SwapSettled(offerId);
    }

    /// @notice Update protocol fee (owner only)
    function setFeeBps(uint256 _feeBps) external {
        if (msg.sender != owner) revert OnlyOwner();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit FeeBpsUpdated(feeBps, _feeBps);
        feeBps = _feeBps;
    }

    /// @notice Update fee recipient (owner only)
    function setFeeRecipient(address _feeRecipient) external {
        if (msg.sender != owner) revert OnlyOwner();
        if (_feeRecipient == address(0)) revert InvalidFeeRecipient();
        emit FeeRecipientUpdated(feeRecipient, _feeRecipient);
        feeRecipient = _feeRecipient;
    }

    /// @notice Transfer ownership (owner only)
    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert OnlyOwner();
        if (newOwner == address(0)) revert InvalidFeeRecipient();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Get offer details
    function getOffer(uint256 offerId) external view returns (Offer memory) {
        return offers[offerId];
    }
}
