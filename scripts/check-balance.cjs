const { ethers } = require("hardhat");

async function main() {
    try {
        // Create provider with specific network settings
        const provider = new ethers.JsonRpcProvider("https://rpc-testnet.dbcwallet.io");
        
        // Create wallet instance
        const wallet = new ethers.Wallet("15ed9810f64dc30002a26def833fdda5006ef5ae51553c9d83e1644b295fa321", provider);
        
        console.log("\nChecking network and balance...");
        
        // Get network details
        const network = await provider.getNetwork();
        console.log("Network Info:", {
            chainId: network.chainId.toString(),
            name: network.name
        });
        
        // Get account details
        console.log("\nAccount Info:");
        console.log("Address:", wallet.address);
        
        // Get and format balance
        const balance = await provider.getBalance(wallet.address);
        console.log("Balance (wei):", balance.toString());
        console.log("Balance (DBC):", ethers.formatEther(balance));
        
        // Get nonce
        const nonce = await provider.getTransactionCount(wallet.address);
        console.log("Nonce:", nonce);
        
        // Test RPC connection with a few basic calls
        console.log("\nTesting RPC connection...");
        const blockNumber = await provider.getBlockNumber();
        console.log("Current block number:", blockNumber);
        
        const gasPrice = await provider.getFeeData();
        console.log("Gas price info:", {
            gasPrice: ethers.formatUnits(gasPrice.gasPrice || 0, "gwei") + " gwei",
            maxFeePerGas: gasPrice.maxFeePerGas ? ethers.formatUnits(gasPrice.maxFeePerGas, "gwei") + " gwei" : "N/A",
            maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ? ethers.formatUnits(gasPrice.maxPriorityFeePerGas, "gwei") + " gwei" : "N/A"
        });
        
    } catch (error) {
        console.error("\nError occurred:");
        console.error(error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
