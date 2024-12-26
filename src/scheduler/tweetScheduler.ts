import { getUserAgentAccounts, trainAIAgent } from '../services/aiAgentService';
import { tweetService } from '../services/tweetService';

let schedulerInterval: NodeJS.Timeout;

export function startTweetScheduler() {
  // Run immediately on startup
  void fetchAndProcessTweets();
  
  // Then schedule to run every 30 minutes
  schedulerInterval = setInterval(fetchAndProcessTweets, 30 * 60 * 1000);
  console.log('[TweetScheduler] Started tweet scheduler');
}

export function stopTweetScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    console.log('[TweetScheduler] Stopped tweet scheduler');
  }
}

async function fetchAndProcessTweets() {
  try {
    console.log('[TweetScheduler] Starting scheduled tweet fetch...');
    
    // Get all user accounts with AI agents
    const accounts = await getUserAgentAccounts();
    let processedCount = 0;
    
    for (const account of accounts) {
      try {
        // Fetch latest tweets
        const updates = await tweetService.fetchTweetsForAgentAccounts();
        
        // Process updates for this agent
        const agentUpdate = updates.find(update => update.agentId === account.agentId);
        if (agentUpdate) {
          await trainAIAgent(account.agentId, { tweets: agentUpdate.tweets });
          console.log(`[TweetScheduler] Updated training data for agent ${account.agentId}`);
        }
        
        // Train AI agent with new tweets
        await trainAIAgent(account.agentId, { tweets });
        
        processedCount++;
        console.log(`[TweetScheduler] Updated training data for agent ${account.agentId}`);
      } catch (error) {
        console.error(`[TweetScheduler] Error processing tweets for agent ${account.agentId}:`, error);
        // Continue with next account
      }
    }
    
    console.log(`[TweetScheduler] Completed tweet fetch for ${processedCount} out of ${accounts.length} agents`);
  } catch (error) {
    console.error('[TweetScheduler] Error in scheduled tweet fetch:', error);
  }
}
