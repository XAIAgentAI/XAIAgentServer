const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        // Setup provider and wallet
        const provider = new ethers.JsonRpcProvider("https://rpc-testnet.dbcwallet.io");
        const privateKey = "15ed9810f64dc30002a26def833fdda5006ef5ae51553c9d83e1644b295fa321";
        const wallet = new ethers.Wallet(privateKey, provider);
        
        console.log("\nStarting direct deployment of XAIAgent DRC20 token...");
        
        // Get network and account info
        const network = await provider.getNetwork();
        console.log("Network:", {
            chainId: network.chainId.toString(),
            name: network.name
        });
        
        const balance = await provider.getBalance(wallet.address);
        console.log("Account:", wallet.address);
        console.log("Balance:", ethers.formatEther(balance), "DBC");
        
        // Read contract artifacts
        const artifactPath = path.join(__dirname, '../artifacts/contracts/XAIAgentDRC20.sol/XAIAgentDRC20.json');
        const contractArtifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        
        // Prepare deployment transaction
        const factory = new ethers.ContractFactory(
            contractArtifact.abi,
            contractArtifact.bytecode,
            wallet
        );
        
        console.log("\nPreparing deployment transaction...");
        
        // Get nonce and gas price
        const nonce = await provider.getTransactionCount(wallet.address);
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || ethers.parseUnits("10", "gwei");
        
        // Estimate deployment cost
        const deploymentData = factory.interface.encodeDeploy([wallet.address]);
        const estimatedGas = await provider.estimateGas({
            from: wallet.address,
            data: deploymentData
        });
        
        const totalCost = gasPrice * estimatedGas;
        console.log("Deployment cost estimation:", {
            gasPrice: ethers.formatUnits(gasPrice, "gwei") + " gwei",
            estimatedGas: estimatedGas.toString(),
            totalCost: ethers.formatEther(totalCost) + " DBC"
        });
        
        if (balance < totalCost) {
            throw new Error(`Insufficient funds. Need ${ethers.formatEther(totalCost)} DBC but have ${ethers.formatEther(balance)} DBC`);
        }
        
        // Deploy contract
        console.log("\nDeploying contract...");
        const contract = await factory.deploy(
            wallet.address,
            {
                gasPrice: gasPrice,
                gasLimit: estimatedGas * BigInt(2), // Add buffer
                nonce: nonce
            }
        );
        
        console.log("Deployment transaction sent:", contract.deploymentTransaction().hash);
        console.log("Waiting for confirmation...");
        
        await contract.waitForDeployment();
        const contractAddress = await contract.getAddress();
        
        console.log("\nContract deployed successfully!");
        console.log("Contract address:", contractAddress);
        
        // Verify total supply
        const totalSupply = await contract.totalSupply();
        console.log("Total supply:", ethers.formatEther(totalSupply), "XAA");
        
        return contractAddress;
    } catch (error) {
        console.error("\nDeployment failed:");
        console.error(error.message);
        if (error.transaction) {
            console.error("\nTransaction details:", error.transaction);
        }
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
