import type { 
  AnalysisResponse, 
  ModelAvailabilityResponse,
  TokenMetadata,
  TokenDistributionResponse,
  TokenDistributionResult,
  ServiceResponse
} from '../types/index.js';

export interface DecentralGPTClient {
  call(prompt: string, context: string): Promise<AnalysisResponse>;
  fetchAvailableModels(): Promise<string[]>;
  verifyModelAvailability(modelId?: string): Promise<ServiceResponse<{
    modelAvailable: boolean;
    modelId: string;
    availableModels: string[];
  }>>;
  streamResponse?(prompt: string, context: string): AsyncGenerator<string, void, unknown>;
  createToken(metadata: TokenMetadata): Promise<TokenDistributionResponse>;
  distributeTokens(tokenId: string, creatorAddress: string): Promise<TokenDistributionResult>;
}

export function createTestClient(implementation: Partial<DecentralGPTClient>): DecentralGPTClient {
  return {
    call: implementation.call || (async () => {
      throw new Error('Not implemented');
    }),
    fetchAvailableModels: implementation.fetchAvailableModels || (async () => {
      if (process.env.NODE_ENV === 'test') {
        return ['llama-3.3-xai', 'GPT-4'];
      }
      throw new Error('Not implemented');
    }),
    verifyModelAvailability: implementation.verifyModelAvailability || (async (modelId?: string) => {
      if (process.env.NODE_ENV === 'test') {
        const models = ['llama-3.3-70b', 'gpt-4', 'llama-3.3-xai'];
        const defaultModel = 'llama-3.3-70b';
        
        if (!modelId) {
          return {
            success: true,
            data: {
              modelAvailable: true,
              modelId: defaultModel,
              availableModels: models
            }
          };
        }

        const normalizedModelId = modelId.toLowerCase().trim();
        
        // For exact model matches
        if (models.some(m => m.toLowerCase() === normalizedModelId)) {
          return {
            success: true,
            data: {
              modelAvailable: true,
              modelId: modelId,
              availableModels: models
            }
          };
        }

        // For llama-3.3 models, check if any llama-3.3 model is available
        if (normalizedModelId.startsWith('llama-3.3')) {
          const llamaModels = models.filter(m => m.toLowerCase().startsWith('llama-3.3'));
          if (llamaModels.length > 0) {
            const preferredModel = llamaModels.find(m => m.toLowerCase().includes('70b')) || llamaModels[0];
            return {
              success: true,
              data: {
                modelAvailable: true,
                modelId: preferredModel,
                availableModels: models
              }
            };
          }
        }

        // For other models, return not available but include default model
        return {
          success: true,
          data: {
            modelAvailable: false,
            modelId: defaultModel,
            availableModels: models
          }
        };
      }
      throw new Error('Not implemented');
    }),
    streamResponse: implementation.streamResponse || (async function* (prompt: string, context: string) {
      if (process.env.NODE_ENV === 'test') {
        yield 'Test';
        yield ' response';
        yield ' streaming';
        return;
      }
      throw new Error('Not implemented');
    }),
    createToken: implementation.createToken || (async (metadata: TokenMetadata) => {
      if (process.env.NODE_ENV === 'test') {
        return {
          success: true,
          data: {
            tokenId: 'test-token-id',
            contractAddress: '0x1234567890123456789012345678901234567890',
            status: 'completed'
          }
        };
      }
      throw new Error('Not implemented');
    }),
    distributeTokens: implementation.distributeTokens || (async (tokenId: string, creatorAddress: string) => {
      if (process.env.NODE_ENV === 'test') {
        const totalSupply = '1000000000000000000000000'; // 1M tokens
        return {
          success: true,
          data: {
            creatorAmount: '100000000000000000000000',    // 10% to creator (30-day lock)
            xaaAmount: '50000000000000000000000',         // 5% permanently locked with XAA
            ecosystemAmount: '100000000000000000000000',  // 10% for ecosystem (180-day lock)
            dbcAmount: '750000000000000000000000',        // 75% locked with DBC
            transactionHash: '0x1234567890123456789012345678901234567890123456789012345678901234'
          }
        };
      }
      throw new Error('Not implemented');
    })
  };
}

// Default implementation
export const decentralGPTClient = createTestClient({});

export default decentralGPTClient;
