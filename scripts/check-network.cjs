const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("https://rpc-testnet.dbcwallet.io");
    
    try {
        const network = await provider.getNetwork();
        console.log("Network Chain ID:", Number(network.chainId));
        
        const block = await provider.getBlock("latest");
        console.log("Latest block number:", block.number);
        
        const balance = await provider.getBalance("0x6B8853E7d04D43212263E1Fd5d270573C3F20918");
        console.log("Account balance:", ethers.formatEther(balance), "DBC");
    } catch (error) {
        console.error("Error:", error);
    }
}

main().catch(console.error);
