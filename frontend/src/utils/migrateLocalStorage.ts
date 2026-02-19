import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

interface LocalStorageSession {
  id: number;
  title: string;
  messages: Array<{
    role: string;
    content: string;
    timestamp: string;
  }>;
  created_at?: string;
  updated_at?: string;
}

/**
 * Get all chat sessions from localStorage
 */
const getLocalStorageSessions = (): LocalStorageSession[] => {
  try {
    const sessions: LocalStorageSession[] = [];
    
    // Iterate through localStorage keys to find chat sessions
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      
      if (key && key.startsWith('chat_session_')) {
        try {
          const sessionData = localStorage.getItem(key);
          if (sessionData) {
            const session = JSON.parse(sessionData);
            sessions.push(session);
          }
        } catch (parseError) {
          console.error(`Error parsing session ${key}:`, parseError);
        }
      }
    }
    
    console.log(`Found ${sessions.length} sessions in localStorage`);
    return sessions;
  } catch (error) {
    console.error('Error reading localStorage:', error);
    return [];
  }
};

/**
 * Migrate localStorage chat sessions to database with wallet address
 * @param walletAddress - User's wallet address
 * @returns Migration result with success status and migrated session count
 */
export const migrateLocalStorageToDatabase = async (
  walletAddress: string
): Promise<{
  success: boolean;
  migrated_count: number;
  sessions: Array<{ original_id: number; new_id: number; title: string; message_count: number }>;
  error?: string;
}> => {
  try {
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }

    // Get all sessions from localStorage
    const localSessions = getLocalStorageSessions();
    
    if (localSessions.length === 0) {
      console.log('No localStorage sessions to migrate');
      return {
        success: true,
        migrated_count: 0,
        sessions: []
      };
    }

    console.log(`Migrating ${localSessions.length} sessions to database for wallet: ${walletAddress}`);

    // Call backend migration endpoint
    const response = await axios.post(`${API_URL}/api/chat/sessions/migrate`, {
      wallet_address: walletAddress,
      sessions: localSessions
    });

    console.log('Migration response:', response.data);

    // Optionally clear localStorage sessions after successful migration
    // (Uncomment if you want to clean up after migration)
    // localSessions.forEach((session) => {
    //   localStorage.removeItem(`chat_session_${session.id}`);
    // });

    return {
      success: true,
      migrated_count: response.data.migrated_count,
      sessions: response.data.sessions
    };

  } catch (error: any) {
    console.error('Error migrating localStorage sessions:', error);
    return {
      success: false,
      migrated_count: 0,
      sessions: [],
      error: error.response?.data?.detail || error.message || 'Migration failed'
    };
  }
};

/**
 * Check if migration is needed (has localStorage sessions but no DB sessions)
 */
export const checkMigrationNeeded = async (walletAddress: string): Promise<boolean> => {
  try {
    // Check if there are localStorage sessions
    const localSessions = getLocalStorageSessions();
    if (localSessions.length === 0) {
      return false; // No localStorage sessions to migrate
    }

    // Check if there are already DB sessions for this wallet
    const response = await axios.get(`${API_URL}/api/chat/sessions?wallet_address=${walletAddress}`);
    const dbSessions = response.data;

    // Need migration if we have localStorage sessions but no DB sessions
    return localSessions.length > 0 && dbSessions.length === 0;

  } catch (error) {
    console.error('Error checking migration status:', error);
    return false;
  }
};
