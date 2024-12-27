// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title XAIAgent DRC20 Token
 * @dev Implementation of the XAA token on DeepBrainChain with 1000 billion total supply
 */
contract XAIAgentDRC20 is ERC20, ERC20Burnable, Ownable {
    // Struct to track locked token information
    struct LockInfo {
        uint256 lockedAt;      // Timestamp when the tokens were locked
        uint256 lockedAmount;  // Amount of tokens that are locked
        uint256 unlockAt;      // Timestamp when the tokens will unlock
    }

    // Mapping from address to their lock entries
    mapping(address => LockInfo[]) private walletLockInfo;

    // Mapping to track addresses that can perform locked transfers
    mapping(address => bool) public lockTransferAdmins;

    // Events for admin management
    event LockTransferAdminAdded(address indexed admin);
    event LockTransferAdminRemoved(address indexed admin);
    event TokensLockedAndTransferred(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 unlockTime
    );

    // Modifier to restrict functions to lock transfer admins
    modifier onlyLockTransferAdmin() {
        require(lockTransferAdmins[_msgSender()], "XAA: caller is not a lock transfer admin");
        _;
    }

    constructor(address initialOwner) ERC20("XAA Token", "XAA") Ownable(initialOwner) {
        // Mint 1000 billion tokens to the contract creator
        _mint(initialOwner, 1000_000_000_000 * 10**decimals()); // 1000 billion tokens
    }

    /**
     * @dev Burns a specific amount of tokens.
     * @param amount The amount of token to be burned.
     */
    function burn(uint256 amount) public virtual override {
        _burn(_msgSender(), amount);
    }

    /**
     * @dev Burns a specific amount of tokens from a specific address.
     * @param account The address to burn tokens from.
     * @param amount The amount of token to be burned.
     */
    function burnFrom(address account, uint256 amount) public virtual override {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }

    /**
     * @dev Adds an address to the list of lock transfer admins.
     * @param admin The address to be added as a lock transfer admin.
     */
    function addLockTransferAdmin(address admin) external onlyOwner {
        require(admin != address(0), "XAA: admin is zero address");
        require(!lockTransferAdmins[admin], "XAA: already a lock transfer admin");
        lockTransferAdmins[admin] = true;
        emit LockTransferAdminAdded(admin);
    }

    /**
     * @dev Removes an address from the list of lock transfer admins.
     * @param admin The address to be removed from lock transfer admins.
     */
    function removeLockTransferAdmin(address admin) external onlyOwner {
        require(lockTransferAdmins[admin], "XAA: not a lock transfer admin");
        lockTransferAdmins[admin] = false;
        emit LockTransferAdminRemoved(admin);
    }

    /**
     * @dev Calculates the total amount of tokens that are currently locked for an address.
     * @param account The address to check locked tokens for
     * @return The total amount of locked tokens
     */
    function calculateLockedAmount(address account) public view returns (uint256) {
        LockInfo[] storage locks = walletLockInfo[account];
        uint256 lockedSum = 0;
        for (uint256 i = 0; i < locks.length; i++) {
            if (block.timestamp < locks[i].unlockAt) {
                lockedSum += locks[i].lockedAmount;
            }
        }
        return lockedSum;
    }

    /**
     * @dev Returns information about a specific lock entry for an address
     * @param account The address to get lock info for
     * @param index The index of the lock entry to query
     * @return lockedAt The timestamp when the tokens were locked
     * @return lockedAmount The amount of tokens that are locked
     * @return unlockAt The timestamp when the tokens will unlock
     */
    function getLockInfo(address account, uint256 index) 
        external 
        view 
        returns (uint256 lockedAt, uint256 lockedAmount, uint256 unlockAt) 
    {
        require(index < walletLockInfo[account].length, "XAA: lock index out of bounds");
        LockInfo storage lock = walletLockInfo[account][index];
        return (lock.lockedAt, lock.lockedAmount, lock.unlockAt);
    }

    /**
     * @dev Returns the number of lock entries for an address
     * @param account The address to get the lock count for
     * @return The number of lock entries
     */
    function getLockCount(address account) external view returns (uint256) {
        return walletLockInfo[account].length;
    }

    /**
     * @dev Returns the total amount of tokens that are currently locked for an address
     * @param account The address to get the total locked balance for
     * @return uint256 The total amount of locked tokens
     */
    function totalLockedBalance(address account) external view returns (uint256) {
        return calculateLockedAmount(account);
    }

    /**
     * @dev Hook that is called before any transfer of tokens.
     * @param from The address tokens are transferred from
     * @param to The address tokens are transferred to
     * @param value The amount of tokens to transfer
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        if (from != address(0)) { // Skip check on minting
            uint256 lockedAmount = calculateLockedAmount(from);
            uint256 unlockedBalance = balanceOf(from) - lockedAmount;
            require(unlockedBalance >= value, "XAA: transfer amount exceeds unlocked balance");
        }
        super._update(from, to, value);
    }

    /**
     * @dev Transfers tokens to an address and locks them for a specified duration.
     * @param to The address to transfer and lock tokens for
     * @param amount The amount of tokens to transfer and lock
     * @param lockSeconds The duration in seconds for which the tokens will be locked
     */
    function transferAndLock(
        address to,
        uint256 amount,
        uint256 lockSeconds
    ) external onlyLockTransferAdmin {
        require(to != address(0), "XAA: transfer to zero address");
        require(amount > 0, "XAA: amount must be positive");
        require(lockSeconds > 0, "XAA: lock duration must be positive");

        uint256 unlockTime = block.timestamp + lockSeconds;
        
        // Create new lock entry
        LockInfo memory lockEntry = LockInfo({
            lockedAt: block.timestamp,
            lockedAmount: amount,
            unlockAt: unlockTime
        });
        
        // Add lock entry and transfer tokens
        walletLockInfo[to].push(lockEntry);
        _transfer(_msgSender(), to, amount);
        
        emit TokensLockedAndTransferred(_msgSender(), to, amount, unlockTime);
    }
}
