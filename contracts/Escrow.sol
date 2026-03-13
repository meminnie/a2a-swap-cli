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

    struct Offer {
        address proposer;
        address acceptor;
        address sellToken;
        uint256 sellAmount;
        address buyToken;
        uint256 buyAmount;
        uint256 deadline;
        OfferStatus status;
        bool proposerDeposited;
        bool acceptorDeposited;
    }

    uint256 public nextOfferId;
    mapping(uint256 => Offer) public offers;

    // TODO: ERC-8004 trust score interface
    // ITrustRegistry public trustRegistry;
    // uint256 public minTrustScore;

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

    error OfferNotOpen();
    error OfferNotAccepted();
    error NotParticipant();
    error AlreadyDeposited();
    error OfferExpired();
    error OfferNotExpired();
    error OnlyProposer();

    /// @notice Create a new OTC swap offer
    /// @param sellToken Token the proposer is selling
    /// @param sellAmount Amount of sellToken
    /// @param buyToken Token the proposer wants to buy
    /// @param buyAmount Amount of buyToken
    /// @param duration How long the offer stays open (seconds)
    function createOffer(
        address sellToken,
        uint256 sellAmount,
        address buyToken,
        uint256 buyAmount,
        uint256 duration
    ) external returns (uint256 offerId) {
        offerId = nextOfferId++;

        offers[offerId] = Offer({
            proposer: msg.sender,
            acceptor: address(0),
            sellToken: sellToken,
            sellAmount: sellAmount,
            buyToken: buyToken,
            buyAmount: buyAmount,
            deadline: block.timestamp + duration,
            status: OfferStatus.Open,
            proposerDeposited: false,
            acceptorDeposited: false
        });

        emit OfferCreated(
            offerId,
            msg.sender,
            sellToken,
            sellAmount,
            buyToken,
            buyAmount,
            block.timestamp + duration
        );
    }

    /// @notice Accept an open offer
    function acceptOffer(uint256 offerId) external {
        Offer storage offer = offers[offerId];
        if (offer.status != OfferStatus.Open) revert OfferNotOpen();
        if (block.timestamp >= offer.deadline) revert OfferExpired();

        // TODO: check ERC-8004 trust score
        // require(trustRegistry.getScore(msg.sender) >= minTrustScore);

        offer.acceptor = msg.sender;
        offer.status = OfferStatus.Accepted;

        emit OfferAccepted(offerId, msg.sender);
    }

    /// @notice Deposit tokens into escrow (both parties must deposit)
    /// @dev Proposer can deposit when Open or Accepted; acceptor only when Accepted
    function deposit(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (block.timestamp >= offer.deadline) revert OfferExpired();

        if (msg.sender == offer.proposer) {
            if (offer.status != OfferStatus.Open && offer.status != OfferStatus.Accepted)
                revert OfferNotOpen();
            if (offer.proposerDeposited) revert AlreadyDeposited();
            offer.proposerDeposited = true;
            IERC20(offer.sellToken).safeTransferFrom(
                msg.sender,
                address(this),
                offer.sellAmount
            );
        } else if (msg.sender == offer.acceptor) {
            if (offer.status != OfferStatus.Accepted) revert OfferNotAccepted();
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
    function refund(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (block.timestamp < offer.deadline) revert OfferNotExpired();
        if (offer.status != OfferStatus.Accepted) revert OfferNotAccepted();

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
    }

    /// @dev Execute the swap — send tokens to counterparties
    function _settle(uint256 offerId) internal {
        Offer storage offer = offers[offerId];
        offer.status = OfferStatus.Settled;

        // Proposer's sellToken goes to acceptor
        IERC20(offer.sellToken).safeTransfer(
            offer.acceptor,
            offer.sellAmount
        );

        // Acceptor's buyToken goes to proposer
        IERC20(offer.buyToken).safeTransfer(
            offer.proposer,
            offer.buyAmount
        );

        emit SwapSettled(offerId);
    }

    /// @notice Get offer details
    function getOffer(uint256 offerId) external view returns (Offer memory) {
        return offers[offerId];
    }
}
