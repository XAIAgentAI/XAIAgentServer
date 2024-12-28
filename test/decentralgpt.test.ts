import { expect } from 'chai';
import sinon from 'sinon';
import { fetchAvailableModels } from '../src/services/aiAgentService';
import fetch from 'node-fetch';

describe('DecentralGPT Integration', () => {
  let sandbox: sinon.SinonSandbox;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    fetchStub = sandbox.stub();
    (global as any).fetch = fetchStub;
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should fetch available models successfully', async () => {
    const mockModels = {
      models: ['Llama3.3-70B', 'GPT-4', 'Claude-2']
    };

    fetchStub.resolves({
      ok: true,
      json: async () => mockModels
    });

    const models = await fetchAvailableModels();
    expect(models).to.deep.equal(mockModels.models);
    expect(fetchStub.calledOnce).to.be.true;
    expect(fetchStub.firstCall.args[0]).to.include('/api/v0/ai/projects/models');
  });

  it('should handle API errors gracefully', async () => {
    fetchStub.resolves({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Server Error'
    });

    try {
      await fetchAvailableModels();
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).to.include('Failed to fetch available models: 500');
    }
  });

  it('should handle network errors appropriately', async () => {
    const networkError = new Error('Network error');
    (networkError as any).code = 'ECONNREFUSED';
    fetchStub.rejects(networkError);

    try {
      await fetchAvailableModels();
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).to.equal('Network error: Unable to connect to DecentralGPT API');
    }
  });

  it('should handle invalid response format', async () => {
    fetchStub.resolves({
      ok: true,
      json: async () => ({ invalid: 'response' })
    });

    try {
      await fetchAvailableModels();
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).to.equal('Invalid response format from DecentralGPT API: models array not found');
    }
  });
});
