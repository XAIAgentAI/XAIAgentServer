import { EventEmitter } from 'events';
import { TokenMetadata } from './index.js';

// Event names as constants
export const TOKEN_EVENTS = {
  CONFIRMATION_TIMEOUT: 'tokenConfirmationTimeout',
  CONFIRMED: 'tokenConfirmed',
  REJECTED: 'tokenRejected',
  PENDING_CONFIRMATION: 'tokenPendingConfirmation'
} as const;

// Event payload types
export interface TokenEventPayloads {
  [TOKEN_EVENTS.CONFIRMATION_TIMEOUT]: { 
    userId: string;
    metadata: TokenMetadata;
  };
  [TOKEN_EVENTS.CONFIRMED]: TokenMetadata;
  [TOKEN_EVENTS.REJECTED]: { 
    userId: string;
    metadata: TokenMetadata;
  };
  [TOKEN_EVENTS.PENDING_CONFIRMATION]: {
    userId: string;
    metadata: TokenMetadata;
  };
}

// Event payload types
export interface TokenEventPayloads {
  [TOKEN_EVENTS.CONFIRMATION_TIMEOUT]: { 
    userId: string;
    metadata: TokenMetadata;
  };
  [TOKEN_EVENTS.CONFIRMED]: TokenMetadata;
  [TOKEN_EVENTS.REJECTED]: { 
    userId: string;
    metadata: TokenMetadata;
  };
  [TOKEN_EVENTS.PENDING_CONFIRMATION]: {
    userId: string;
    metadata: TokenMetadata;
  };
}

// Token event emitter class
export class TokenEventEmitter extends EventEmitter {
  emit<K extends keyof TokenEventPayloads>(
    event: K,
    payload: TokenEventPayloads[K]
  ): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof TokenEventPayloads>(
    event: K,
    listener: (payload: TokenEventPayloads[K]) => void
  ): this {
    return super.on(event, listener);
  }
}

// Export singleton instance
export const tokenEvents = new TokenEventEmitter();
