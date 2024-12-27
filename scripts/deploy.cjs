const hre = require("hardhat");

async function main() {
    console.log("\nStarting XAIAgent DRC20 token deployment...");

    try {
        // Get network info
        const network = await hre.ethers.provider.getNetwork();
        console.log("Connected to network:", {
            chainId: network.chainId,
            name: network.name
        });

        // Get deployer account
        const [deployer] = await hre.ethers.getSigners();
        console.log("Deploying contracts with account:", deployer.address);

        // Get account balance
        const balance = await hre.ethers.provider.getBalance(deployer.address);
        console.log("Account balance:", hre.ethers.formatEther(balance), "DBC");

        // Create contract factory with minimal settings
        const XAIAgentDRC20 = await hre.ethers.getContractFactory("XAIAgentDRC20");
        console.log("Contract factory created. Starting deployment...");

        // Deploy with minimal gas settings
        const contract = await XAIAgentDRC20.deploy(
            deployer.address,
            {
                gasPrice: hre.ethers.parseUnits("10", "gwei"), // 10 gwei
                gasLimit: 3000000 // Fixed gas limit
            }
        );

        console.log("Deployment transaction sent. Waiting for confirmation...");
        await contract.waitForDeployment();
        
        const contractAddress = await contract.getAddress();
        console.log("Contract deployed to:", contractAddress);
        console.log("Transaction hash:", contract.deploymentTransaction().hash);

        // Verify total supply
        const totalSupply = await contract.totalSupply();
        console.log("Total supply:", hre.ethers.formatEther(totalSupply), "XAA");

        return contractAddress;
    } catch (error) {
        console.error("\nDeployment failed:");
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
