import { expect } from 'chai';
import sinon from 'sinon';
import { Types } from 'mongoose';
import { storeTrainingData } from '../src/services/aiAgentService.js';
import { validateTrainingData } from '../src/utils/validation.js';
describe('Training Data Management', () => {
    const validAgentId = new Types.ObjectId().toString();
    const validTrainingText = 'This is a valid training text that should pass validation.';
    const validUserId = 'user123';
    let sandbox;
    beforeEach(async () => {
        sandbox = sinon.createSandbox();
        const decentralGPTStub = sandbox.stub().resolves(JSON.stringify({
            success: true,
            data: {
                message: 'Training data processed successfully'
            }
        }));
        const aiAgentServiceModule = await import('../src/services/aiAgentService.js');
        aiAgentServiceModule.injectDependencies({
            decentralGPTClient: {
                call: decentralGPTStub
            }
        });
    });
    afterEach(() => {
        sandbox.restore();
    });
    describe('validateTrainingData', () => {
        it('should validate agent ID format', () => {
            const invalidId = 'invalid-id';
            const error = validateTrainingData(invalidId, validTrainingText);
            expect(error).to.equal('Invalid agent ID');
        });
        it('should validate training text length', () => {
            const shortText = 'too short';
            const error = validateTrainingData(validAgentId, shortText);
            expect(error).to.equal('Training text must be at least 10 characters long');
        });
        it('should accept valid input', () => {
            const error = validateTrainingData(validAgentId, validTrainingText);
            expect(error).to.be.null;
        });
    });
    describe('storeTrainingData', () => {
        it('should store training data successfully', async () => {
            const result = await storeTrainingData(validAgentId, validTrainingText);
            expect(result).to.be.undefined;
        });
        it('should store multiple training texts for the same agent', async () => {
            const texts = [
                'First training text for testing purposes',
                'Second training text for testing purposes',
                'Third training text for testing purposes'
            ];
            for (const text of texts) {
                const result = await storeTrainingData(validAgentId, text);
                expect(result).to.be.undefined;
            }
        });
    });
});
