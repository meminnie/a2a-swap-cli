// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TradeEscrow.sol";

/// @title EscrowFactory - CREATE2 factory for per-trade escrow contracts
/// @notice Operator deploys TradeEscrow instances with deterministic addresses.
///         Sellers can send tokens to the pre-computed address before deployment.
contract EscrowFactory {
    address public owner;
    address public operator;
    address public feeRecipient;
    uint256 public feeBps;
    uint256 public constant MAX_FEE_BPS = 100; // 1% max

    uint256 public nextNonce;

    mapping(address => bool) public deployedEscrows;

    event EscrowDeployed(
        address indexed escrow,
        address indexed seller,
        address indexed buyer,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 buyAmount,
        uint256 nonce
    );
    event OperatorUpdated(address oldOperator, address newOperator);
    event FeeBpsUpdated(uint256 oldBps, uint256 newBps);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);
    event OwnershipTransferred(address oldOwner, address newOwner);

    error OnlyOwner();
    error OnlyOperator();
    error FeeTooHigh();
    error InvalidAddress();
    error EscrowAlreadyDeployed();

    constructor(
        address _operator,
        address _feeRecipient,
        uint256 _feeBps
    ) {
        if (_operator == address(0)) revert InvalidAddress();
        if (_feeRecipient == address(0)) revert InvalidAddress();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();

        owner = msg.sender;
        operator = _operator;
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    /// @notice Compute the deterministic address for a TradeEscrow
    /// @param seller The seller address
    /// @param buyer The buyer address
    /// @param sellToken Token the seller deposits
    /// @param buyToken Token the buyer deposits
    /// @param sellAmount Amount seller deposits
    /// @param buyAmount Amount buyer deposits
    /// @param deadline Trade deadline timestamp
    /// @param nonce Unique nonce for same-param trades
    function computeAddress(
        address seller,
        address buyer,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 buyAmount,
        uint256 deadline,
        uint256 nonce
    ) public view returns (address) {
        bytes32 salt = _computeSalt(
            seller, buyer, sellToken, buyToken,
            sellAmount, buyAmount, deadline, nonce
        );

        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(_creationCode(
                    seller, buyer, sellToken, buyToken,
                    sellAmount, buyAmount, deadline
                ))
            )
        );

        return address(uint160(uint256(hash)));
    }

    /// @notice Deploy a TradeEscrow for a matched trade
    /// @return escrow The deployed escrow address
    function deploy(
        address seller,
        address buyer,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 buyAmount,
        uint256 deadline,
        uint256 nonce
    ) external onlyOperator returns (address escrow) {
        bytes32 salt = _computeSalt(
            seller, buyer, sellToken, buyToken,
            sellAmount, buyAmount, deadline, nonce
        );

        bytes memory bytecode = _creationCode(
            seller, buyer, sellToken, buyToken,
            sellAmount, buyAmount, deadline
        );

        assembly {
            escrow := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }

        if (escrow == address(0)) revert EscrowAlreadyDeployed();
        deployedEscrows[escrow] = true;

        emit EscrowDeployed(
            escrow, seller, buyer,
            sellToken, buyToken,
            sellAmount, buyAmount, nonce
        );
    }

    /// @notice Get the next available nonce and increment
    function useNonce() external onlyOperator returns (uint256 nonce) {
        nonce = nextNonce;
        nextNonce = nonce + 1;
    }

    // --- Admin functions ---

    function setOperator(address _operator) external onlyOwner {
        if (_operator == address(0)) revert InvalidAddress();
        emit OperatorUpdated(operator, _operator);
        operator = _operator;
    }

    function setFeeBps(uint256 _feeBps) external onlyOwner {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit FeeBpsUpdated(feeBps, _feeBps);
        feeBps = _feeBps;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidAddress();
        emit FeeRecipientUpdated(feeRecipient, _feeRecipient);
        feeRecipient = _feeRecipient;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // --- Internal helpers ---

    function _computeSalt(
        address seller,
        address buyer,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 buyAmount,
        uint256 deadline,
        uint256 nonce
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            seller, buyer, sellToken, buyToken,
            sellAmount, buyAmount, deadline, nonce
        ));
    }

    function _creationCode(
        address seller,
        address buyer,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 buyAmount,
        uint256 deadline
    ) internal view returns (bytes memory) {
        return abi.encodePacked(
            type(TradeEscrow).creationCode,
            abi.encode(
                seller, buyer, sellToken, buyToken,
                sellAmount, buyAmount,
                feeBps, feeRecipient, operator, deadline
            )
        );
    }
}
