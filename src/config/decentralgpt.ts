// DecentralGPT configuration
export const DECENTRALGPT_MODEL = process.env.DECENTRALGPT_MODEL || 'llama-3.3-70b';
export const DECENTRALGPT_PROJECT = process.env.DECENTRALGPT_PROJECT || 'DecentralGPT';
export const DECENTRALGPT_ENDPOINT = process.env.DECENTRALGPT_ENDPOINT || 'https://singapore-chat.degpt.ai/api/v0/ai/chat/completions';

// Export for TypeScript
export type DecentralGPTConfig = {
  DECENTRALGPT_MODEL: string;
  DECENTRALGPT_PROJECT: string;
  DECENTRALGPT_ENDPOINT: string;
};
