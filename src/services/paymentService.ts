import { ethers, parseUnits, Contract, JsonRpcProvider } from 'ethers';
import { UserAnalytics, PaymentValidationRequest } from '../types/index.js';
import { userAnalyticsService } from './userAnalyticsService.js';

export const paymentService = {
  checkXAABalance,
  processXAAPayment,
  getXAAApprovalStatus,
  validateAndProcessPayment
};

export { validateAndProcessPayment };

// XAA token contract ABI (minimal interface for balance and transfer)
const XAA_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

// DBC Chain configuration
const DBC_RPC = 'https://rpc.dbcwallet.io';
const DBC_CHAIN_ID = 19880818;

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Environment configuration
const XAA_CONTRACT_ADDRESS = process.env.XAA_CONTRACT_ADDRESS as string;
const PLATFORM_WALLET_ADDRESS = process.env.PLATFORM_WALLET_ADDRESS as string;
const MATCHING_ANALYSIS_COST = process.env.MATCHING_ANALYSIS_COST ? parseUnits(process.env.MATCHING_ANALYSIS_COST, 18) : parseUnits('10', 18);

// Validate configuration
if (!XAA_CONTRACT_ADDRESS || !PLATFORM_WALLET_ADDRESS) {
  throw new Error('Missing required environment variables for XAA payment processing');
}

import { PaymentError } from '../types/index.js';

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Helper function to add retry logic
 * @param operation Function to retry
 * @param maxRetries Maximum number of retry attempts
 * @param delayMs Delay between retries in milliseconds
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  // This line will never be reached due to the throw in the catch block
  throw new Error('Unexpected error in withRetry');
}

/**
 * Initialize provider and contract instances
 */
const provider = new JsonRpcProvider(DBC_RPC);
const xaaContract = new Contract(XAA_CONTRACT_ADDRESS, XAA_ABI, provider);

/**
 * Check if user has sufficient XAA balance for matching analysis
 * @param userAddress User's wallet address
 * @returns boolean indicating if user has sufficient balance
 */
async function checkXAABalance(userAddress: string): Promise<{ 
  success: boolean; 
  error?: PaymentError;
  balance?: bigint;
}> {
  try {
    const balance = await withRetry(async () => await xaaContract.balanceOf(userAddress));
    return {
      success: balance >= MATCHING_ANALYSIS_COST,
      balance
    };
  } catch (error) {
    console.error('Error checking XAA balance:', error);
    return {
      success: false,
      error: error instanceof Error && error.message.includes('network') 
        ? 'NETWORK_ERROR'
        : 'CONTRACT_ERROR'
    };
  }
}

/**
 * Process XAA payment for matching analysis
 * @param userAddress User's wallet address
 * @returns boolean indicating if payment was successful
 */
async function processXAAPayment(userAddress: string): Promise<{
  success: boolean;
  error?: PaymentError;
  transactionHash?: string;
}> {
  try {
    // Check allowance with retry
    const allowance = await withRetry(async () => 
      await xaaContract.allowance(userAddress, PLATFORM_WALLET_ADDRESS)
    );
    
    if (allowance < MATCHING_ANALYSIS_COST) {
      return {
        success: false,
        error: 'INSUFFICIENT_ALLOWANCE'
      };
    }

    // Transfer XAA tokens with retry
    const tx = await withRetry(async () => 
      await xaaContract.transfer(PLATFORM_WALLET_ADDRESS, MATCHING_ANALYSIS_COST)
    );
    
    // Wait for confirmation with retry
    const receipt = await withRetry(async () => await tx.wait());

    return {
      success: true,
      transactionHash: receipt.hash
    };
  } catch (error) {
    console.error('Error processing XAA payment:', error);
    return {
      success: false,
      error: error instanceof Error && error.message.includes('network') 
        ? 'NETWORK_ERROR' 
        : 'TRANSACTION_FAILED'
    };
  }
}

/**
 * Get approval status and generate approval data if needed
 * @param userAddress User's wallet address
 * @returns Object containing approval status and data
 */
async function getXAAApprovalStatus(userAddress: string): Promise<{
  success: boolean;
  approved: boolean;
  error?: PaymentError;
  approvalData?: {
    to: string;
    amount: string;
  };
}> {
  try {
    const allowance = await withRetry(async () => 
      await xaaContract.allowance(userAddress, PLATFORM_WALLET_ADDRESS)
    );
    
    if (allowance >= MATCHING_ANALYSIS_COST) {
      return { 
        success: true,
        approved: true 
      };
    }

    return {
      success: true,
      approved: false,
      approvalData: {
        to: XAA_CONTRACT_ADDRESS,
        amount: MATCHING_ANALYSIS_COST.toString()
      }
    };
  } catch (error) {
    console.error('Error checking XAA approval:', error);
    return { 
      success: false,
      approved: false,
      error: error instanceof Error && error.message.includes('network')
        ? 'NETWORK_ERROR'
        : 'CONTRACT_ERROR'
    };
  }
}

/**
 * Validate and process payment for matching analysis
 * @param userAddress User's wallet address
 * @param analytics User's analytics data
 * @returns Object containing payment status and any error messages
 */
async function validateAndProcessPayment(
  request: PaymentValidationRequest
): Promise<{
  success: boolean;
  error?: PaymentError;
  requiresApproval?: boolean;
  approvalData?: {
    to: string;
    amount: string;
  };
  transactionHash?: string;
}> {
  try {
    // Get cost based on request type
    const cost = request.type === 'matching' ? MATCHING_ANALYSIS_COST :
                request.type === 'personality' ? parseUnits('50', 18) :
                request.type === 'token' ? parseUnits('500', 18) :
                parseUnits(request.amount.toString(), 18);
    
    // Check XAA balance
    const balanceCheck = await checkXAABalance(request.userId);
    if (!balanceCheck.success || !balanceCheck.balance || BigInt(balanceCheck.balance.toString()) < BigInt(cost.toString())) {
      return {
        success: false,
        error: balanceCheck.error || 'INSUFFICIENT_BALANCE'
      };
    }

    // Check approval status
    const approvalStatus = await getXAAApprovalStatus(request.userId);
    if (!approvalStatus.success) {
      return {
        success: false,
        error: approvalStatus.error || 'CONTRACT_ERROR'
      };
    }
    
    if (!approvalStatus.approved) {
      return {
        success: false,
        error: 'INSUFFICIENT_ALLOWANCE',
        requiresApproval: true,
        approvalData: approvalStatus.approvalData
      };
    }

    // Process payment
    const paymentResult = await processXAAPayment(request.userId);
    if (!paymentResult.success) {
      return {
        success: false,
        error: paymentResult.error || 'TRANSACTION_FAILED'
      };
    }

    return { 
      success: true,
      transactionHash: paymentResult.transactionHash
    };
  } catch (error) {
    console.error('Error in validateAndProcessPayment:', error);
    return {
      success: false,
      error: 'CONTRACT_ERROR' as PaymentError
    };
  }
}
