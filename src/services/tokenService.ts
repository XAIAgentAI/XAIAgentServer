import { ethers, Contract, JsonRpcProvider, Wallet, ContractFactory, parseUnits, formatUnits } from 'ethers';
import { TokenMetadata, Token } from '../types/index';
import { XAccountData } from '../types/twitter.js';
import { DBCSwapService } from './dbcSwapService';
import { DRC20_ABI } from '../constants/abis';

const TOTAL_SUPPLY = parseUnits('100000000000', 18); // 100 billion tokens
const TARGET_FDV_USD = 100_000; // $100k USD initial FDV

export async function createToken(xAccountData: XAccountData, creatorAddress: string): Promise<Token> {
  try {
    // Generate token name and description using DecentralGPT
    const tokenMetadata = await generateTokenMetadata(xAccountData);
    
    // Deploy token contract on DBC chain with 100 billion total supply
    const token = await deployTokenContract(tokenMetadata, creatorAddress);
    
    // Get XAA price to calculate initial token amount for pool
    const dbcSwapService = new DBCSwapService();
    const xaaPrice = await dbcSwapService.getXAAPrice();
    
    // Calculate initial token price based on $100k FDV
    const initialPriceUSD = TARGET_FDV_USD / Number(formatUnits(TOTAL_SUPPLY, 18));
    
    // Create pool with only user tokens (no XAA)
    const initialTokenAmount = TOTAL_SUPPLY.toString();
    const pool = await dbcSwapService.createPool(token.address, initialTokenAmount);
    
    // Transfer 10% to creator's wallet
    const creatorAmount = (TOTAL_SUPPLY * BigInt(10)) / BigInt(100);
    await transferTokens(token.address, creatorAddress, creatorAmount.toString());
    
    // Renounce ownership
    await renounceOwnership(token.address);
    
    return {
      ...token,
      totalSupply: TOTAL_SUPPLY.toString(),
      initialPriceUSD: initialPriceUSD.toString(),
      poolAddress: pool.poolAddress
    };
  } catch (error: any) {
    console.error('Error creating token:', error);
    if (error.message.includes('insufficient funds')) {
      throw new Error('Insufficient funds to deploy token contract');
    }
    if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
      throw new Error('Failed to deploy token: Gas estimation failed');
    }
    if (error.message.includes('nonce too low')) {
      throw new Error('Transaction failed: Nonce already used');
    }
    throw new Error(`Failed to create token: ${error.message}`);
  }
}

async function generateTokenMetadata(xAccountData: XAccountData): Promise<TokenMetadata> {
  // TODO: Implement DecentralGPT integration for token name/description generation
  return {
    name: 'Default Token Name',
    symbol: 'DTN',
    description: 'Default token description',
    timestamp: new Date().toISOString(),
    version: 1
  };
}

async function deployTokenContract(metadata: TokenMetadata, creatorAddress: string): Promise<Token> {
  if (!process.env.DBC_PRIVATE_KEY) {
    throw new Error('DBC_PRIVATE_KEY environment variable is required');
  }

  const provider = new JsonRpcProvider(process.env.DBC_RPC_URL || 'https://rpc.dbcwallet.io');
  const signer = new Wallet(process.env.DBC_PRIVATE_KEY, provider);
  
  // Deploy token contract with manual gas settings and nonce management
  const factory = new ContractFactory(DRC20_ABI, process.env.DRC20_BYTECODE || '', signer);
  
  // Get current nonce
  const nonce = await provider.getTransactionCount(signer.address);
  
  // Set deployment options with nonce
  const deploymentOptions = {
    gasLimit: 3000000,  // Manual gas limit
    gasPrice: parseUnits('1', 'gwei'),  // 1 Gwei gas price
    nonce: nonce
  };

  const maxRetries = 3;
  let lastError: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Clear any pending transactions by incrementing nonce
      const currentNonce = nonce + attempt;
      const currentOptions = { ...deploymentOptions, nonce: currentNonce };
      
      const contract = await factory.deploy(currentOptions);
      await contract.waitForDeployment();
      
      // Initialize token after deployment with incremented nonce
      const contractWithSigner = contract.connect(signer);
      // Call initialize function using contract interface
      const initializeFn = contractWithSigner.getFunction('initialize');
      if (!initializeFn) {
        throw new Error('Initialize function not found in contract ABI');
      }
      await initializeFn(
        metadata.name,
        metadata.symbol,
        TOTAL_SUPPLY,
        creatorAddress,
        { 
          gasLimit: 2000000,
          nonce: currentNonce + 1
        }
      );

      return {
        address: await contract.getAddress(),
        name: metadata.name,
        symbol: metadata.symbol,
        creatorAddress,
        totalSupply: TOTAL_SUPPLY.toString(),
        initialPriceUSD: (TARGET_FDV_USD / Number(formatUnits(TOTAL_SUPPLY, 18))).toString()
      };
    } catch (error: any) {
      console.error(`Deployment attempt ${attempt + 1} failed:`, error);
      lastError = error;
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error(lastError?.message || 'Failed to deploy token contract after multiple attempts');
}

async function transferTokens(tokenAddress: string, to: string, amount: string): Promise<void> {
  if (!process.env.DBC_PRIVATE_KEY) {
    throw new Error('DBC_PRIVATE_KEY environment variable is required');
  }
  const provider = new JsonRpcProvider(process.env.DBC_RPC_URL || 'https://rpc.dbcwallet.io');
  const signer = new Wallet(process.env.DBC_PRIVATE_KEY, provider);
  const tokenContract = new Contract(tokenAddress, DRC20_ABI, signer);
  
  await tokenContract.transfer(to, amount);
}

async function renounceOwnership(tokenAddress: string): Promise<void> {
  if (!process.env.DBC_PRIVATE_KEY) {
    throw new Error('DBC_PRIVATE_KEY environment variable is required');
  }
  const provider = new JsonRpcProvider(process.env.DBC_RPC_URL || 'https://rpc.dbcwallet.io');
  const signer = new Wallet(process.env.DBC_PRIVATE_KEY, provider);
  const tokenContract = new Contract(tokenAddress, DRC20_ABI, signer);
  
  await tokenContract.renounceOwnership();
}
