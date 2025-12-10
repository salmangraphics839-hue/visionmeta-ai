export interface KeySlot {
  id: string;
  key: string;
  provider: 'openai' | 'google' | 'deepseek';
  isActive: boolean;
  failureCount: number;
  addedAt: number;
}

class KeyManagerService {
  private keys: KeySlot[] = [];
  private STORAGE_KEY = 'vision_system_keys';

  constructor() {
    this.load();
    this.migrateLegacyKey();
  }

  // Safe ID generator that works in all contexts
  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      try {
        return crypto.randomUUID();
      } catch (e) {
        // Fallback if crypto exists but randomUUID fails
      }
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  private load() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.keys = JSON.parse(stored);
      }
    } catch (e) {
      console.error("Failed to load keys", e);
      this.keys = []; 
    }
  }

  private save() {
    try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.keys));
    } catch (e) {
        console.error("Failed to save keys", e);
    }
  }

  // Migrate old single key to new system
  private migrateLegacyKey() {
    try {
        const oldKey = localStorage.getItem('openai_api_key');
        if (oldKey && this.keys.length === 0) {
          this.addKey(oldKey);
          localStorage.removeItem('openai_api_key');
        }
    } catch (e) {
        console.error("Migration failed", e);
    }
  }

  getKeys(): KeySlot[] {
    return [...this.keys];
  }

  hasKeys(): boolean {
    return this.keys.some(k => k.isActive);
  }

  /**
   * ROUTING LOGIC:
   * 'vision' -> OpenAI or Google (Random Load Balancing)
   * 'text'   -> DeepSeek (Priority 1), then others (Priority 2)
   * 'video'  -> Google (Priority 1 - Native Video), then OpenAI (Priority 2 - Fallback)
   */
  getKeyForCapability(capability: 'vision' | 'text' | 'video'): KeySlot | null {
    const active = this.keys.filter(k => k.isActive);
    if (active.length === 0) return null;

    let candidates: KeySlot[] = [];

    if (capability === 'video') {
        // Priority 1: Google (Native Video Understanding)
        const googleKeys = active.filter(k => k.provider === 'google');
        if (googleKeys.length > 0) {
            candidates = googleKeys;
        } else {
            // Priority 2: OpenAI (Fallback)
            candidates = active.filter(k => k.provider === 'openai');
        }
    } 
    else if (capability === 'text') {
        // Priority 1: DeepSeek (Cost/Performance Optimization)
        const deepseekKeys = active.filter(k => k.provider === 'deepseek');
        if (deepseekKeys.length > 0) {
            candidates = deepseekKeys;
        } else {
            // Priority 2: Fallback to any active key
            candidates = active;
        }
    } 
    else if (capability === 'vision') {
        // Load Balancing: Distribute evenly between OpenAI and Google
        candidates = active.filter(k => k.provider === 'openai' || k.provider === 'google');
    }

    if (candidates.length === 0) return null;

    // Random Load Balancing among the selected candidates
    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex];
  }

  getNextKey(): KeySlot | null {
    return this.getKeyForCapability('text');
  }

  addKey(keyStr: string, explicitProvider: 'auto' | 'openai' | 'deepseek' | 'google' = 'auto') {
    const cleaned = keyStr.trim();
    if (!cleaned) return;

    let provider: 'openai' | 'google' | 'deepseek' | null = null;
    
    // 1. Use explicit provider if selected
    if (explicitProvider !== 'auto') {
        provider = explicitProvider;
    } else {
        // 2. Auto-Detect Logic
        if (cleaned.startsWith('sk-')) provider = 'openai'; // Default to OpenAI for sk- if auto
        else if (cleaned.startsWith('AIza')) provider = 'google';
    }

    if (!provider) {
      throw new Error("Unrecognized license format. Please select the provider manually.");
    }

    // Check duplicates
    if (this.keys.some(k => k.key === cleaned)) {
      throw new Error("This license key is already added.");
    }

    this.keys.push({
      id: this.generateId(),
      key: cleaned,
      provider,
      isActive: true,
      failureCount: 0,
      addedAt: Date.now()
    });
    this.save();
  }

  removeKey(id: string) {
    this.keys = this.keys.filter(k => k.id !== id);
    this.save();
  }

  toggleKey(id: string) {
    this.keys = this.keys.map(k => k.id === id ? { ...k, isActive: !k.isActive } : k);
    this.save();
  }

  reportFailure(id: string) {
    this.keys = this.keys.map(k => 
      k.id === id ? { ...k, failureCount: k.failureCount + 1 } : k
    );
    this.save();
  }
}

export const KeyManager = new KeyManagerService();