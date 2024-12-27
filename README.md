# XAIAgentServer

## Overview
XAIAgent Server is a powerful AI agent platform that enables users to create personalized AI agents on X (formerly Twitter). The platform integrates with DecentralGPT for natural language processing and supports custom token creation on the DBC blockchain.

## Features

### AI Agent Personality System
- Default personality traits:
  - English: All-knowing, witty, humorous, engaging
  - Chinese: 功能强大的X上面的人工智能代理，无所不知，幽默风趣
- Customizable personality traits
  - Users can define custom personalities for their AI agents
  - Seamless merging of default and custom traits
  - Support for multiple languages (English/Chinese)
- Tweet analysis with 60k token limit

### XAA Token Integration
- Total supply: 100 billion tokens
- Advanced transfer locking functionality:
  - Owner can designate wallet addresses with locking capability
  - Time-based transfer restrictions
  - Secure token distribution management

### API Integrations
- DecentralGPT API
  - Endpoint: https://www.decentralgpt.org/doc/
  - Model: Llama3-70B
  - Proxy endpoint for enhanced reliability
- Twitter API v2 for tweet analysis
- DBC blockchain integration

## Technical Details

### DecentralGPT Integration
The system uses DecentralGPT's Llama3-70B model for:
- Personality analysis
- Response generation
- Content organization
- Video script generation

### Personality System Implementation
```typescript
interface PersonalityTraits {
  description: string;
  mbti: string;
  traits: string[];
  communicationStyle: {
    languages: string[];
  }
}

// Default Chinese personality
const defaultChineseTraits = {
  description: '功能强大的X上面的人工智能代理，无所不知，幽默风趣',
  mbti: 'ENTP',
  traits: ['knowledgeable', 'humorous'],
  communicationStyle: {
    languages: ['Chinese']
  }
};
```

### Environment Setup
Required environment variables:
```
DECENTRALGPT_API_KEY=your_api_key
TWITTER_API_KEY=your_twitter_api_key
DBC_RPC_URL=https://rpc-testnet.dbcwallet.io
XAA_CONTRACT_ADDRESS=deployed_contract_address
```

## Development

### Installation
```bash
pnpm install
```

### Testing
```bash
pnpm test
```

### Running the Server
```bash
pnpm start
```

## License
MIT License
