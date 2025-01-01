import { expect } from 'chai';
import sinon from 'sinon';
import type { AnalysisResponse, PersonalAnalysisResult } from '../src/types/index.js';
import { createTestClient } from '../src/services/decentralGPTClient.js';

describe('DecentralGPT Integration', () => {
  let sandbox: sinon.SinonSandbox;
  const mockModels = ['Llama3.3-70B', 'GPT-4', 'Claude-2'];
  const mockAnalysisData: PersonalAnalysisResult = {
    personalityTraits: {
      openness: 0.8,
      conscientiousness: 0.7,
      extraversion: 0.6,
      agreeableness: 0.7,
      neuroticism: 0.4
    },
    interests: ['technology', 'AI'],
    writingStyle: {
      formal: 0.7,
      technical: 0.6,
      friendly: 0.8,
      emotional: 0.4
    },
    topicPreferences: ['AI']
  };

  const mockResponse = {
    success: true,
    data: mockAnalysisData,
    hits: 1,
    freeUsesLeft: 5,
    paymentRequired: false,
    cached: false
  } as AnalysisResponse<PersonalAnalysisResult>;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should successfully fetch available models', async () => {
    const mockClient = {
      fetchAvailableModels: sandbox.stub().resolves(mockModels)
    };
    const client = createTestClient(mockClient);
    const models = await client.fetchAvailableModels();
    expect(models).to.deep.equal(mockModels);
    expect(mockClient.fetchAvailableModels.calledOnce).to.be.true;
  });

  it('should handle API calls correctly', async () => {
    const mockCall = sinon.stub().resolves(mockResponse);
    const client = createTestClient({
      call: mockCall,
      fetchAvailableModels: sandbox.stub().resolves(['llama-3.3-70b', 'gpt-4'])
    });
    const result = await client.call('test prompt', 'test context');
    expect(result).to.deep.equal(mockResponse);
    expect(mockCall.calledOnce).to.be.true;
    expect(mockCall.calledWith('test prompt', 'test context')).to.be.true;
  });

  it('should handle server errors gracefully', async () => {
    const mockClient = {
      fetchAvailableModels: sandbox.stub().rejects(new Error('Server Error'))
    };
    const client = createTestClient(mockClient);
    try {
      await client.fetchAvailableModels();
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).to.equal('Server Error');
      expect(mockClient.fetchAvailableModels.calledOnce).to.be.true;
    }
  });

  it('should handle network errors gracefully', async () => {
    const mockClient = {
      call: sandbox.stub().rejects(new Error('Network Error'))
    };
    const client = createTestClient(mockClient);
    try {
      await client.call('test prompt', 'test context');
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).to.equal('Network Error');
      expect(mockClient.call.calledOnce).to.be.true;
    }
  });
});
