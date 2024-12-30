import { ethers, Contract, JsonRpcProvider, Wallet, ContractFactory, parseUnits, formatUnits } from 'ethers';
import { TokenMetadata, Token } from '../types/index.js';
import { tokenEvents, TOKEN_EVENTS } from '../types/events.js';
import { XAccountData } from '../types/twitter.js';
import { DBCSwapService } from './dbcSwapService.js';
import { DRC20_ABI } from '../constants/abis.js';
import TwitterClient from './twitterClient.js';
import { generateTokenName as defaultGenerateTokenName } from './aiAgentService.js';
import { TweetV2 } from 'twitter-api-v2';

// Token service implementation
// Token confirmation map with proper metadata initialization
export const tokenConfirmations = new Map<string, TokenMetadata>();
export const CONFIRMATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes timeout

// Cleanup expired confirmations every minute
const cleanupInterval = setInterval(() => {
  const now = new Date();
  for (const [userId, metadata] of tokenConfirmations.entries()) {
    const tokenAge = now.getTime() - new Date(metadata.timestamp).getTime();
    if (tokenAge > CONFIRMATION_TIMEOUT) {
      if (metadata.pendingConfirmation) {
        // Emit timeout event before cleanup
        const timeoutMetadata: TokenMetadata = {
          name: metadata.name,
          symbol: metadata.symbol,
          description: metadata.description,
          decimals: metadata.decimals || 18,
          totalSupply: metadata.totalSupply || '1000000',
          initialPrice: metadata.initialPrice || '0.1',
          lockPeriod: metadata.lockPeriod || (365 * 24 * 60 * 60),
          distributionRules: {
            lockedPercentage: 50,
            investorPercentage: 25,
            minimumInvestment: '25000',
            targetFDV: '75000'
          },
          timestamp: metadata.timestamp || new Date().toISOString(),
          version: 1,
          confirmed: false,
          pendingConfirmation: false,
          reason: 'TIMEOUT',
          hits: 1,
          freeUsesLeft: 5,
          paymentRequired: false,
          cached: true,
          success: false,
          tweetId: metadata.tweetId || '',
          userId: userId
        };
        tokenEvents.emit(TOKEN_EVENTS.CONFIRMATION_TIMEOUT, {
          userId,
          metadata: timeoutMetadata
        });
        
        // Post timeout notification
        TwitterClient.postResponse(
          `Token confirmation timeout. Please try again.`,
          metadata.tweetId
        ).catch(error => {
          console.error('Error posting timeout notification:', error);
        });
        
        console.log(`Token confirmation timeout for user ${userId}`);
      }
      tokenConfirmations.delete(userId);
    }
  }
}, 60 * 1000);

// Token name confirmation function
export async function confirmTokenName(userId: string, confirmed: boolean): Promise<TokenMetadata> {
  const pendingToken = tokenConfirmations.get(userId);
  if (!pendingToken) {
    const error = new Error('No pending token found for confirmation');
    error.name = 'TOKEN_CONFIRMATION_ERROR';
    throw error;
  }
  
  // Initialize base token metadata
  const baseMetadata: TokenMetadata = {
    name: pendingToken.name,
    symbol: pendingToken.symbol,
    description: pendingToken.description || '',
    decimals: pendingToken.decimals || 18,
    totalSupply: pendingToken.totalSupply || '1000000',
    initialPrice: pendingToken.initialPrice || '0.1',
    lockPeriod: pendingToken.lockPeriod || (365 * 24 * 60 * 60),
    distributionRules: {
      lockedPercentage: 50,
      investorPercentage: 25,
      minimumInvestment: '25000',
      targetFDV: '75000'
    },
    timestamp: pendingToken.timestamp || new Date().toISOString(),
    version: 1,
    confirmed: false,
    pendingConfirmation: false,
    hits: 1,
    freeUsesLeft: 5,
    paymentRequired: false,
    cached: true,
    success: false,
    tweetId: pendingToken.tweetId || '',
    userId: userId
  };

  const now = new Date();
  const tokenAge = now.getTime() - new Date(pendingToken.timestamp).getTime();
  
  if (tokenAge > CONFIRMATION_TIMEOUT) {
    console.log(`Token confirmation timeout for user ${userId}`);
    const timeoutMetadata: TokenMetadata = {
      name: pendingToken.name,
      symbol: pendingToken.symbol,
      description: pendingToken.description,
      decimals: pendingToken.decimals || 18,
      totalSupply: pendingToken.totalSupply || '1000000',
      initialPrice: pendingToken.initialPrice || '0.1',
      lockPeriod: pendingToken.lockPeriod || (365 * 24 * 60 * 60),
      distributionRules: {
        lockedPercentage: 50,
        investorPercentage: 25,
        minimumInvestment: '25000',
        targetFDV: '75000'
      },
      timestamp: pendingToken.timestamp || new Date().toISOString(),
      version: 1,
      confirmed: false,
      pendingConfirmation: false,
      reason: 'TIMEOUT',
      hits: 1,
      freeUsesLeft: 5,
      paymentRequired: false,
      cached: true,
      success: false,
      tweetId: pendingToken.tweetId || '',
      userId: userId
    };
    
    // Emit timeout event with metadata and clean up
    tokenEvents.emit(TOKEN_EVENTS.CONFIRMATION_TIMEOUT, {
      userId,
      metadata: timeoutMetadata
    });

    try {
      await TwitterClient.postResponse(
        `Token confirmation timeout. Please try again.`,
        pendingToken.tweetId
      );
    } catch (error) {
      console.error('Error posting timeout notification:', error);
    }
    
    // Clean up the confirmation
    tokenConfirmations.delete(userId);
    
    // Return timeout metadata with required fields
    const returnMetadata: TokenMetadata = {
      ...baseMetadata,
      confirmed: false,
      pendingConfirmation: false,
      reason: 'TIMEOUT',
      success: false,
      hits: 1,
      freeUsesLeft: 5,
      paymentRequired: false,
      cached: true
    };
    return returnMetadata;
  }

  if (confirmed) {
    // Emit confirmation event and update status
    tokenEvents.emit(TOKEN_EVENTS.CONFIRMED, pendingToken);
    pendingToken.confirmed = true;
    pendingToken.pendingConfirmation = false;
    tokenConfirmations.set(userId, pendingToken);
    
    // Post confirmation success message
    try {
      await TwitterClient.postResponse(
        `Token name "${pendingToken.name}" has been confirmed! I'll start the creation process now.`,
        pendingToken.tweetId
      );
    } catch (error) {
      console.error('Error posting confirmation message:', error);
    }
    
    // Schedule cleanup after confirmation
    const cleanupTimeoutId = setTimeout(() => {
      const token = tokenConfirmations.get(userId);
      if (token) {
        if (token.confirmed) {
          tokenConfirmations.delete(userId);
          console.log(`Cleaned up confirmed token for user ${userId}`);
        } else {
          // Handle unconfirmed token timeout
          const timeoutMetadata: TokenMetadata = {
            name: token.name,
            symbol: token.symbol,
            description: token.description || '',
            decimals: token.decimals || 18,
            totalSupply: token.totalSupply || '1000000',
            initialPrice: token.initialPrice || '0.1',
            lockPeriod: token.lockPeriod || (365 * 24 * 60 * 60),
            distributionRules: {
              lockedPercentage: 50,
              investorPercentage: 25,
              minimumInvestment: '25000',
              targetFDV: '75000'
            },
            timestamp: token.timestamp || new Date().toISOString(),
            version: 1,
            confirmed: false,
            pendingConfirmation: false,
            reason: 'TIMEOUT',
            hits: 1,
            freeUsesLeft: 5,
            paymentRequired: false,
            cached: true,
            success: false,
            tweetId: token.tweetId || '',
            userId: userId
          };
          tokenEvents.emit(TOKEN_EVENTS.CONFIRMATION_TIMEOUT, {
            userId,
            metadata: timeoutMetadata
          });
          tokenConfirmations.delete(userId);
          console.log(`Token confirmation timeout for user ${userId}`);
        }
      }
    }, CONFIRMATION_TIMEOUT);
    
    console.log(`Token name confirmed for user ${userId}`);
    const confirmedMetadata: TokenMetadata = {
      ...baseMetadata,
      confirmed: true,
      pendingConfirmation: false,
      success: true,
      hits: 1,
      freeUsesLeft: 5,
      paymentRequired: false,
      cached: true
    };
    return confirmedMetadata;
  } else {
    // Emit rejection event and clean up
    const rejectionMetadata: TokenMetadata = {
      name: pendingToken.name,
      symbol: pendingToken.symbol,
      description: pendingToken.description || '',
      decimals: pendingToken.decimals || 18,
      totalSupply: pendingToken.totalSupply || '1000000',
      initialPrice: pendingToken.initialPrice || '0.1',
      lockPeriod: pendingToken.lockPeriod || (365 * 24 * 60 * 60),
      distributionRules: {
        lockedPercentage: 50,
        investorPercentage: 25,
        minimumInvestment: '25000',
        targetFDV: '75000'
      },
      timestamp: pendingToken.timestamp || new Date().toISOString(),
      version: 1,
      confirmed: false,
      pendingConfirmation: false,
      reason: 'REJECTED',
      hits: 1,
      freeUsesLeft: 5,
      paymentRequired: false,
      cached: true,
      success: false,
      tweetId: pendingToken.tweetId || '',
      userId: userId
    };
    tokenEvents.emit(TOKEN_EVENTS.REJECTED, { 
      userId,
      metadata: rejectionMetadata
    });
    tokenConfirmations.delete(userId);
    
    // Post rejection message
    try {
      await TwitterClient.postResponse(
        `Token name rejected. Please try again with a different name or mention me with "create token" to start over.`,
        pendingToken.tweetId
      );
    } catch (error) {
      console.error('Error posting rejection message:', error);
    }
    
    console.log(`Token name rejected for user ${userId}`);
    return rejectionMetadata;
  }
}

const TOTAL_SUPPLY = parseUnits('100000000000', 18); // 100 billion tokens
const TARGET_FDV_USD = 100_000; // $100k USD initial FDV

export async function createToken(metadata: TokenMetadata, creatorAddress: string): Promise<Token> {
  try {
    // Use provided token metadata
    const tokenMetadata = metadata;
    
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

async function generateTokenMetadata(
  xAccountData: XAccountData,
  generateTokenName = defaultGenerateTokenName
): Promise<TokenMetadata> {
  try {
    // Generate initial token name using AI
    const tokenName = await generateTokenName(xAccountData);
    
    const baseMetadata: TokenMetadata = {
      name: tokenName.name,
      symbol: tokenName.symbol,
      description: tokenName.description,
      decimals: 18,
      totalSupply: '1000000',
      initialPrice: '0.1',
      lockPeriod: 365 * 24 * 60 * 60, // 1 year in seconds
      distributionRules: {
        lockedPercentage: 50,
        investorPercentage: 25,
        minimumInvestment: '25000',
        targetFDV: '75000'
      },
      timestamp: new Date().toISOString(),
      version: 1,
      tweetId: xAccountData.tweetId || '',
      userId: xAccountData.profile.username,
      hits: 1,
      freeUsesLeft: 5,
      confirmed: false,
      pendingConfirmation: true
    };
    
    if (!xAccountData.tweetId) {
      console.warn('No tweet ID provided, skipping confirmation flow');
      return {
        ...baseMetadata,
        pendingConfirmation: false
      };
    }
    
    // Set up confirmation timeout
    const timeoutId = setTimeout(async () => {
      try {
        const existingMetadata = tokenConfirmations.get(xAccountData.profile.username);
        if (existingMetadata?.pendingConfirmation) {
          const timeoutMetadata: TokenMetadata = {
            ...existingMetadata,
            confirmed: false,
            pendingConfirmation: false,
            reason: 'TIMEOUT',
            hits: existingMetadata.hits || 1,
            freeUsesLeft: existingMetadata.freeUsesLeft || 5,
            distributionRules: {
              lockedPercentage: 50,
              investorPercentage: 25,
              minimumInvestment: '25000',
              targetFDV: '75000'
            },
            version: 1,
            tweetId: xAccountData.tweetId || '',
            userId: xAccountData.profile.username,
            name: existingMetadata.name,
            symbol: existingMetadata.symbol,
            description: existingMetadata.description,
            decimals: existingMetadata.decimals || 18,
            totalSupply: existingMetadata.totalSupply || '1000000',
            initialPrice: existingMetadata.initialPrice || '0.1',
            lockPeriod: existingMetadata.lockPeriod || (365 * 24 * 60 * 60),
            timestamp: existingMetadata.timestamp || new Date().toISOString(),
            success: true,
            cached: true
          };
          tokenEvents.emit(TOKEN_EVENTS.CONFIRMATION_TIMEOUT, {
            userId: xAccountData.profile.username,
            metadata: timeoutMetadata
          });
          
          // Post timeout notification
          if (xAccountData.tweetId) {
            await TwitterClient.postResponse(
              `Token confirmation timeout. Please try again.`,
              xAccountData.tweetId
            );
          }
          
          tokenConfirmations.delete(xAccountData.profile.username);
        }
      } catch (error) {
        console.error('Error handling token confirmation timeout:', error);
      }
    }, CONFIRMATION_TIMEOUT);
    
    // Initialize token metadata with pending state and proper defaults
    const initialMetadata: TokenMetadata = {
      ...baseMetadata,
      confirmed: false,
      pendingConfirmation: true,
      hits: 1,
      freeUsesLeft: 5,
      tweetId: xAccountData.tweetId || '',
      userId: xAccountData.profile.username,
      timeoutId, // Store the timeout ID
      cached: false,
      reason: undefined
    };
    
    // Store metadata in confirmations map with proper initialization
    const metadata = {
      ...initialMetadata,
      hits: 1,
      freeUsesLeft: 5,
      confirmed: false,
      pendingConfirmation: true,
      userId: xAccountData.profile.username,
      tokenName: initialMetadata.name || '',
      timestamp: new Date().toISOString()
    };
    tokenConfirmations.set(xAccountData.profile.username, metadata);
    
    return initialMetadata;

    // Post confirmation request as reply
    await TwitterClient.postResponse(
      `I suggest naming your token "${tokenName.name}" (${tokenName.symbol}). Reply with "yes" to confirm or suggest a different name.`,
      xAccountData.tweetId
    );
    
    // Wait for user response with 5-minute timeout
    const REMINDER_TIME = CONFIRMATION_TIMEOUT - 30000; // Send reminder 30 seconds before timeout
    const POLL_INTERVAL = 10000; // 10 second polling interval
    
    const startTime = Date.now();
    let response: TweetV2 | null = null;
    let reminderSent = false;
    
    // Set timeout for confirmation
    const reminderTimeoutId = setTimeout(async () => {
      const pendingToken = tokenConfirmations.get(xAccountData.profile.username);
      if (pendingToken?.pendingConfirmation) {
        console.log(`Token confirmation timed out for user ${xAccountData.profile.username}`);
        const timeoutMetadata: TokenMetadata = {
          ...pendingToken,
          confirmed: false,
          pendingConfirmation: false,
          reason: 'TIMEOUT',
          hits: 1,
          freeUsesLeft: 5,
          distributionRules: {
            lockedPercentage: 50,
            investorPercentage: 25,
            minimumInvestment: '25000',
            targetFDV: '75000'
          },
          version: 1,
          tweetId: xAccountData.tweetId || '',
          userId: xAccountData.profile.username,
          name: pendingToken.name,
          symbol: pendingToken.symbol,
          description: pendingToken.description,
          decimals: pendingToken.decimals || 18,
          totalSupply: pendingToken.totalSupply || '1000000',
          initialPrice: pendingToken.initialPrice || '0.1',
          lockPeriod: pendingToken.lockPeriod || (365 * 24 * 60 * 60),
          timestamp: new Date().toISOString()
        };
        
        // Emit timeout event with metadata
        tokenEvents.emit(TOKEN_EVENTS.CONFIRMATION_TIMEOUT, {
          userId: xAccountData.profile.username,
          metadata: timeoutMetadata
        });
        
        // Post timeout notification
        if (xAccountData.tweetId) {
          await TwitterClient.postResponse(
            `Token confirmation timeout. Please try again.`,
            xAccountData.tweetId
          );
        }
        
        tokenConfirmations.delete(xAccountData.profile.username);
      }
    }, CONFIRMATION_TIMEOUT);
    
    // We already have a timeout set up above, no need for another one

    // Initialize token metadata with pending state and proper defaults
    const finalMetadata: TokenMetadata = {
      name: tokenName.name,
      symbol: tokenName.symbol,
      description: tokenName.description || `AI-generated token for ${xAccountData.profile.username}`,
      decimals: 18,
      totalSupply: '1000000000000000000',
      initialPrice: '0.000075',
      lockPeriod: 72,
      distributionRules: {
        lockedPercentage: 50,
        investorPercentage: 25,
        minimumInvestment: '25000',
        targetFDV: '75000'
      },
      hits: 1,
      freeUsesLeft: 5,
      confirmed: false,
      pendingConfirmation: true,
      timeoutId: timeoutId, // Set the timeout ID
      timestamp: new Date().toISOString(),
      tweetId: xAccountData.tweetId || '',
      userId: xAccountData.profile.username,
      version: 1,
      paymentRequired: false,
      cached: true,
      success: true,
      reason: undefined
    };

    // Store token metadata in confirmations map
    tokenConfirmations.set(xAccountData.profile.username, finalMetadata);

    // Emit pending confirmation event
    tokenEvents.emit(TOKEN_EVENTS.PENDING_CONFIRMATION, {
      userId: xAccountData.profile.username,
      metadata: finalMetadata
    });

    try {
      while (Date.now() - startTime < CONFIRMATION_TIMEOUT) {
        response = await TwitterClient.waitForReply(xAccountData.tweetId || '', POLL_INTERVAL);
        
        // Safely handle response text
        if (!response) {
          continue; // Skip this iteration if no response
        }
        
        // Type assertion after null check
        const responseText = (response as TweetV2).text;
        if (responseText) {
          // Check if response is a confirmation
          const normalizedResponse = responseText.toLowerCase();
          const isConfirmed = normalizedResponse.includes('yes');
          if (isConfirmed) {
            console.log('Token name confirmed by user');
            const confirmedMetadata = {
              ...finalMetadata,
              pendingConfirmation: false,
              confirmed: true,
              userId: xAccountData.profile.username,
              tweetId: xAccountData.tweetId || '',
              hits: finalMetadata.hits || 1,
              freeUsesLeft: finalMetadata.freeUsesLeft || 5,
              success: true,
              cached: true
            };
            tokenConfirmations.set(xAccountData.profile.username, confirmedMetadata);
            return confirmedMetadata;
          }
        }
        
        // Send reminder if approaching timeout
        if (!reminderSent && Date.now() - startTime > REMINDER_TIME) {
          console.log('Almost at timeout, sending reminder...');
          await TwitterClient.postResponse(
            `Reminder: You have 30 seconds left to confirm the token name "${tokenName.name}" (${tokenName.symbol}). Reply with "yes" to confirm.`,
            xAccountData.tweetId
          );
          reminderSent = true;
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        
        // Check if token has been confirmed or rejected during polling
        const currentToken = tokenConfirmations.get(xAccountData.profile.username);
        if (currentToken?.confirmed) {
          console.log('Token confirmed during polling');
          return currentToken as TokenMetadata;
        }
      }
      
      // If we get here, timeout occurred
      console.log('No confirmation received within timeout');
      
      // Handle timeout
      const timeoutMetadata = {
        ...finalMetadata,
        pendingConfirmation: false,
        confirmed: false,
        reason: 'TIMEOUT',
        hits: finalMetadata.hits || 1,
        freeUsesLeft: finalMetadata.freeUsesLeft || 5,
        success: false,
        cached: false
      };
      
      // Emit timeout event and clean up
      tokenEvents.emit(TOKEN_EVENTS.CONFIRMATION_TIMEOUT, {
        userId: xAccountData.profile.username,
        metadata: timeoutMetadata
      });
      tokenConfirmations.delete(xAccountData.profile.username);
      console.log('Token confirmation timed out');
      
      // Post timeout notification
      if (xAccountData.tweetId) {
        await TwitterClient.postResponse(
          `Token confirmation timeout. Please try again.`,
          xAccountData.tweetId
        );
      }
      
      return timeoutMetadata;
    } catch (error) {
      console.error('Error waiting for token name confirmation:', error);
      throw new Error('TOKEN_CONFIRMATION_ERROR');
    }
  } catch (error) {
    console.error('Error in generateTokenMetadata:', error);
    throw new Error(`Failed to generate token metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function to generate symbol from name
function generateSymbol(name: string): string {
  return name
    .split(/\s+/) // Split on whitespace
    .map(word => word[0]?.toUpperCase() || '') // Get first letter of each word
    .join('')
    .slice(0, 5); // Take first 5 characters
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

      const token: Token = {
        address: await contract.getAddress(),
        name: metadata.name,
        symbol: metadata.symbol,
        creatorAddress,
        totalSupply: TOTAL_SUPPLY.toString(),
        initialPriceUSD: (TARGET_FDV_USD / Number(formatUnits(TOTAL_SUPPLY, 18))).toString(),
        pendingConfirmation: false
      };
      console.log('Deployed token:', token);
      return token;
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

export async function getTokenByCreator(creatorAddress: string): Promise<Token | null> {
  try {
    const provider = new JsonRpcProvider(process.env.DBC_RPC_URL || 'https://rpc.dbcwallet.io');
    // TODO: Implement token lookup by creator address from contract events
    // For now, return null to indicate no existing token
    return null;
  } catch (error) {
    console.error('Error in getTokenByCreator:', error);
    return null;
  }
}
