const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("XAIAgentDRC20", function () {
    let Token;
    let token;
    let owner;
    let admin;
    let user1;
    let user2;

    beforeEach(async function () {
        Token = await ethers.getContractFactory("XAIAgentDRC20");
        [owner, admin, user1, user2] = await ethers.getSigners();
        token = await Token.deploy(owner.address);
        await token.waitForDeployment();
    });

    describe("Basic Token Functionality", function () {
        it("Has correct name and symbol", async function () {
            expect(await token.name()).to.equal("XAA Token");
            expect(await token.symbol()).to.equal("XAA");
        });

        it("Has correct total supply of 1000 billion tokens", async function () {
            const expectedSupply = ethers.parseUnits("1000000000000", 18); // 1000 billion
            expect(await token.totalSupply()).to.equal(expectedSupply);
        });

        it("Owner has the total supply", async function () {
            const totalSupply = await token.totalSupply();
            expect(await token.balanceOf(owner.address)).to.equal(totalSupply);
        });
    });

    describe("Lock Transfer Admin Management", function () {
        it("Owner can add lock transfer admin", async function () {
            await token.addLockTransferAdmin(admin.address);
            expect(await token.lockTransferAdmins(admin.address)).to.be.true;
        });

        it("Owner can remove lock transfer admin", async function () {
            await token.addLockTransferAdmin(admin.address);
            await token.removeLockTransferAdmin(admin.address);
            expect(await token.lockTransferAdmins(admin.address)).to.be.false;
        });

        it("Non-owner cannot add lock transfer admin", async function () {
            await expect(
                token.connect(user1).addLockTransferAdmin(admin.address)
            ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });
    });

    describe("Token Locking Functionality", function () {
        const LOCK_AMOUNT = ethers.parseUnits("1000", 18);
        const LOCK_DURATION = 3600; // 1 hour

        beforeEach(async function () {
            await token.addLockTransferAdmin(admin.address);
            await token.transfer(admin.address, ethers.parseUnits("10000", 18));
        });

        it("Admin can transfer and lock tokens", async function () {
            await token.connect(admin).transferAndLock(user1.address, LOCK_AMOUNT, LOCK_DURATION);
            
            expect(await token.balanceOf(user1.address)).to.equal(LOCK_AMOUNT);
            expect(await token.totalLockedBalance(user1.address)).to.equal(LOCK_AMOUNT);
        });

        it("Cannot transfer locked tokens", async function () {
            await token.connect(admin).transferAndLock(user1.address, LOCK_AMOUNT, LOCK_DURATION);
            
            await expect(
                token.connect(user1).transfer(user2.address, LOCK_AMOUNT)
            ).to.be.revertedWith("XAA: transfer amount exceeds unlocked balance");
        });

        it("Can transfer unlocked tokens", async function () {
            // Transfer some unlocked tokens
            await token.transfer(user1.address, LOCK_AMOUNT);
            // Lock some other tokens
            await token.connect(admin).transferAndLock(user1.address, LOCK_AMOUNT, LOCK_DURATION);

            // Should be able to transfer the unlocked portion
            await token.connect(user1).transfer(user2.address, LOCK_AMOUNT);
            expect(await token.balanceOf(user2.address)).to.equal(LOCK_AMOUNT);
        });

        it("Can transfer previously locked tokens after unlock time", async function () {
            await token.connect(admin).transferAndLock(user1.address, LOCK_AMOUNT, LOCK_DURATION);
            
            // Fast forward time past the lock duration
            await time.increase(LOCK_DURATION + 1);
            
            // Should now be able to transfer
            await token.connect(user1).transfer(user2.address, LOCK_AMOUNT);
            expect(await token.balanceOf(user2.address)).to.equal(LOCK_AMOUNT);
        });

        it("Returns correct lock info", async function () {
            await token.connect(admin).transferAndLock(user1.address, LOCK_AMOUNT, LOCK_DURATION);
            
            const [lockedAt, lockedAmount, unlockAt] = await token.getLockInfo(user1.address, 0);
            expect(lockedAmount).to.equal(LOCK_AMOUNT);
            expect(Number(unlockAt) - Number(lockedAt)).to.equal(LOCK_DURATION);
        });

        it("Returns correct lock count", async function () {
            expect(await token.getLockCount(user1.address)).to.equal(0);
            
            await token.connect(admin).transferAndLock(user1.address, LOCK_AMOUNT, LOCK_DURATION);
            expect(await token.getLockCount(user1.address)).to.equal(1);
            
            await token.connect(admin).transferAndLock(user1.address, LOCK_AMOUNT, LOCK_DURATION);
            expect(await token.getLockCount(user1.address)).to.equal(2);
        });
    });
});
