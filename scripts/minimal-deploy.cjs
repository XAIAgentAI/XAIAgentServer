const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        const provider = new ethers.JsonRpcProvider("https://rpc-testnet.dbcwallet.io");
        const wallet = new ethers.Wallet("15ed9810f64dc30002a26def833fdda5006ef5ae51553c9d83e1644b295fa321", provider);
        
        console.log("Starting minimal deployment...");
        console.log("Deployer address:", wallet.address);
        
        const artifactPath = path.join(__dirname, '../artifacts/contracts/XAIAgentDRC20.sol/XAIAgentDRC20.json');
        const contractArtifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        
        const factory = new ethers.ContractFactory(
            contractArtifact.abi,
            contractArtifact.bytecode,
            wallet
        );
        
        console.log("Deploying contract...");
        const contract = await factory.deploy(
            wallet.address,
            {
                gasPrice: ethers.parseUnits("10", "gwei"),
                gasLimit: 3000000
            }
        );
        
        console.log("Deployment transaction sent:", contract.deploymentTransaction().hash);
        console.log("Waiting for confirmation...");
        
        await contract.waitForDeployment();
        const contractAddress = await contract.getAddress();
        
        console.log("Contract deployed to:", contractAddress);
        
        // Verify total supply
        const totalSupply = await contract.totalSupply();
        console.log("Total supply:", ethers.formatEther(totalSupply), "XAA");
        
        return contractAddress;
    } catch (error) {
        console.error("Deployment failed:", error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
