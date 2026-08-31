import { describe, it, expect, vi, beforeEach } from 'vitest';
import { savePushSubscription, deletePushSubscription, getPushSubscriptionStatus } from './push-subscriptions';
import * as supabaseSSR from '@supabase/ssr';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    getAll: vi.fn(),
    set: vi.fn(),
  })),
}));

describe('push-subscriptions actions', () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'sub-id', enabled: true },
        error: null,
      }),
    };

    (supabaseSSR.createServerClient as any).mockReturnValue(mockSupabase);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  describe('savePushSubscription', () => {
    it('throws Unauthorized if no user', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('err') });
      await expect(savePushSubscription({} as any)).rejects.toThrow('Unauthorized');
    });

    it('throws on invalid payload', async () => {
      const sub = {
        endpoint: 'https://test' // missing keys
      } as any;
      await expect(savePushSubscription(sub)).rejects.toThrow('Invalid subscription payload');
    });

    it('upserts subscription to db', async () => {
      const sub = {
        endpoint: 'https://test',
        keys: { p256dh: 'p256', auth: 'auth' }
      } as any;
      
      const res = await savePushSubscription(sub, 'test-agent');
      expect(res.success).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('push_subscriptions');
      expect(mockSupabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'test-user-id',
          endpoint: 'https://test',
          p256dh: 'p256',
          auth: 'auth',
          user_agent: 'test-agent'
        }),
        { onConflict: 'endpoint' }
      );
    });
  });

  describe('deletePushSubscription', () => {
    it('deletes specific endpoint for current user', async () => {
      const res = await deletePushSubscription('https://test');
      expect(res.success).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('push_subscriptions');
      expect(mockSupabase.delete).toHaveBeenCalled();
      expect(mockSupabase.eq).toHaveBeenCalledWith('endpoint', 'https://test');
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'test-user-id');
    });
  });

  describe('getPushSubscriptionStatus', () => {
    it('returns isSubscribed true if found', async () => {
      const res = await getPushSubscriptionStatus('https://test');
      expect(res.isSubscribed).toBe(true);
      expect(res.isEnabled).toBe(true);
    });

    it('returns false if not found', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      const res = await getPushSubscriptionStatus('https://test');
      expect(res.isSubscribed).toBe(false);
    });
  });
});
