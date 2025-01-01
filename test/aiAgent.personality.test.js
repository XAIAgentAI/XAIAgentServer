import { expect } from 'chai';
import { mergePersonalities } from '../src/services/aiAgentService';
import { TweetService } from '../src/services/tweetService';
describe('AI Agent Personality Tests', () => {
    const basePersonality = {
        mbti: 'INTJ',
        traits: ['analytical', 'strategic'],
        interests: ['technology', 'science'],
        values: ['innovation', 'efficiency'],
        communicationStyle: {
            primary: 'direct',
            strengths: ['clarity', 'precision'],
            weaknesses: ['brevity'],
            languages: ['English']
        },
        professionalAptitude: {
            industries: ['tech', 'research'],
            skills: ['programming', 'analysis'],
            workStyle: 'independent'
        },
        socialInteraction: {
            style: 'professional',
            preferences: ['structured discussions'],
            challenges: ['small talk']
        },
        contentCreation: {
            topics: ['AI', 'technology'],
            style: 'informative',
            engagement_patterns: ['question-answer']
        },
        description: 'A technical AI assistant',
        lastUpdated: new Date().toISOString()
    };
    const incomingPersonality = {
        mbti: 'ENFP',
        traits: ['creative', 'strategic'],
        interests: ['art', 'science'],
        values: ['creativity', 'innovation'],
        communicationStyle: {
            primary: 'friendly',
            strengths: ['empathy', 'clarity'],
            weaknesses: ['focus'],
            languages: ['Chinese']
        },
        professionalAptitude: {
            industries: ['creative', 'tech'],
            skills: ['design', 'programming'],
            workStyle: 'collaborative'
        },
        socialInteraction: {
            style: 'casual',
            preferences: ['open discussions'],
            challenges: ['formal settings']
        },
        contentCreation: {
            topics: ['design', 'AI'],
            style: 'engaging',
            engagement_patterns: ['storytelling']
        },
        description: 'A creative AI companion',
        lastUpdated: new Date().toISOString()
    };
    describe('Personality Merging', () => {
        it('should properly merge two personalities', () => {
            const merged = mergePersonalities(basePersonality, incomingPersonality);
            // Check arrays are properly merged and deduplicated
            expect(merged.traits).to.include.members(['analytical', 'creative', 'strategic']);
            expect(merged.traits.filter(t => t === 'strategic')).to.have.lengthOf(1);
            // Check language merging
            expect(merged.communicationStyle.languages).to.have.members(['English', 'Chinese']);
            // Check skills merging
            expect(merged.professionalAptitude.skills).to.have.members(['programming', 'analysis', 'design']);
            // Check description concatenation
            expect(merged.description).to.include(basePersonality.description);
            expect(merged.description).to.include(incomingPersonality.description);
            // Verify lastUpdated is recent
            const lastUpdated = new Date(merged.lastUpdated);
            expect(lastUpdated.getTime()).to.be.closeTo(new Date().getTime(), 1000);
        });
        it('should handle merging with empty or partial personalities', () => {
            const partialPersonality = {
                mbti: '',
                traits: ['adaptable'],
                interests: [],
                values: [],
                communicationStyle: {
                    primary: 'flexible',
                    strengths: ['adaptability'],
                    weaknesses: [],
                    languages: ['Spanish']
                },
                professionalAptitude: {
                    industries: [],
                    skills: [],
                    workStyle: ''
                },
                socialInteraction: {
                    style: '',
                    preferences: [],
                    challenges: []
                },
                contentCreation: {
                    topics: [],
                    style: '',
                    engagement_patterns: []
                },
                description: '',
                lastUpdated: new Date().toISOString()
            };
            const merged = mergePersonalities(basePersonality, partialPersonality);
            // Original traits should be preserved
            expect(merged.traits).to.include.members(['analytical', 'strategic', 'adaptable']);
            // New language should be added
            expect(merged.communicationStyle.languages).to.include('Spanish');
            // Original fields should be preserved
            expect(merged.mbti).to.equal(basePersonality.mbti);
            expect(merged.professionalAptitude.skills).to.deep.equal(basePersonality.professionalAptitude.skills);
        });
    });
    describe('Default Persona', () => {
        it('should include Chinese personality traits when merging with default persona', () => {
            const defaultChineseTraits = {
                description: '功能强大的X上面的人工智能代理，无所不知，幽默风趣',
                mbti: 'ENTP',
                traits: ['knowledgeable', 'humorous'],
                interests: ['artificial intelligence'],
                values: ['knowledge', 'humor'],
                communicationStyle: {
                    primary: 'engaging',
                    strengths: ['wit', 'knowledge'],
                    weaknesses: [],
                    languages: ['Chinese']
                },
                professionalAptitude: {
                    industries: ['AI'],
                    skills: ['conversation'],
                    workStyle: 'adaptive'
                },
                socialInteraction: {
                    style: 'engaging',
                    preferences: ['humor'],
                    challenges: []
                },
                contentCreation: {
                    topics: ['AI'],
                    style: 'engaging',
                    engagement_patterns: ['humor']
                },
                lastUpdated: new Date().toISOString()
            };
            const merged = mergePersonalities(basePersonality, defaultChineseTraits);
            expect(merged.description).to.include('功能强大的X上面的人工智能代理');
            expect(merged.description).to.include('无所不知');
            expect(merged.description).to.include('幽默风趣');
            expect(merged.communicationStyle.languages).to.include('Chinese');
        });
    });
    describe('Token Limit Enforcement', () => {
        it('should enforce 60k token limit when analyzing tweets', async () => {
            const tweetService = new TweetService();
            // Create a large array of tweets that would exceed 60k tokens
            const longTweets = Array(150).fill({
                id: '1',
                text: 'This is a very long tweet '.repeat(100), // Approximately 500 tokens per tweet
                createdAt: new Date().toISOString()
            });
            const { tweets: analyzedTweets, totalTokens } = await tweetService.testProcessTweets(longTweets);
            // Verify total tokens is under 60k
            expect(totalTokens).to.be.lessThan(60000);
            // Verify tweets were truncated
            expect(analyzedTweets.length).to.be.lessThan(longTweets.length);
        });
    });
});
