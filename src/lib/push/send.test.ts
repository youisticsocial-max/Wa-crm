import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendPushToUser, sendPushToQueue, PushPayload } from './send'
import webpush from 'web-push'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

describe('Push Sender', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public'
    process.env.VAPID_PRIVATE_KEY = 'test-private'
  })

  const dummyPayload: PushPayload = {
    title: 'Test',
    body: 'Test body',
    type: 'test',
    conversationId: 'conv-123',
    url: '/inbox'
  }

  it('initializes vapid keys only once', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: mockEq1,
    } as any

    await sendPushToUser(mockDb, 'user-1', dummyPayload)
    await sendPushToUser(mockDb, 'user-1', dummyPayload)

    expect(webpush.setVapidDetails).toHaveBeenCalledTimes(1)
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:admin@youistic.com',
      'test-public',
      'test-private'
    )
  })

  it('fetches subscriptions and sends to all devices', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({
      data: [
        { id: 'sub-1', endpoint: 'ep1', p256dh: 'p1', auth: 'a1' },
        { id: 'sub-2', endpoint: 'ep2', p256dh: 'p2', auth: 'a2' },
      ],
      error: null
    })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: mockEq1,
    } as any

    const sendMock = webpush.sendNotification as any
    sendMock.mockResolvedValue(undefined)

    await sendPushToUser(mockDb, 'user-1', dummyPayload)

    expect(mockDb.from).toHaveBeenCalledWith('push_subscriptions')
    expect(sendMock).toHaveBeenCalledTimes(2)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'ep1' }),
      JSON.stringify(dummyPayload)
    )
  })

  it('deletes subscription if endpoint returns 404/410', async () => {
    const mockDelete = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'push_subscriptions') {
          return {
            select: vi.fn().mockReturnThis(),
            delete: mockDelete,
            eq: vi.fn().mockImplementation((col, val) => {
              if (col === 'user_id') {
                return {
                  eq: vi.fn().mockResolvedValue({
                    data: [
                      { id: 'sub-1', endpoint: 'ep1', p256dh: 'p1', auth: 'a1' },
                      { id: 'sub-2', endpoint: 'ep2', p256dh: 'p2', auth: 'a2' },
                    ],
                    error: null
                  })
                }
              }
              if (col === 'id') return mockEq()
              return { eq: vi.fn().mockReturnThis() }
            }),
          }
        }
      }),
    } as any

    const sendMock = webpush.sendNotification as any
    sendMock.mockImplementation((sub: any) => {
      if (sub.endpoint === 'ep1') {
        const err = new Error('Gone') as any
        err.statusCode = 410
        return Promise.reject(err)
      }
      return Promise.resolve()
    })

    await sendPushToUser(mockDb, 'user-1', dummyPayload)

    expect(sendMock).toHaveBeenCalledTimes(2)
    // Should have deleted sub-1
    expect(mockDelete).toHaveBeenCalled()
    expect(mockDb.from).toHaveBeenCalledWith('push_subscriptions')
  })

  it('sends to queue admins and owners', async () => {
    const mockDb = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [{ user_id: 'admin-1' }, { user_id: 'owner-1' }],
              error: null
            })
          }
        }
        if (table === 'push_subscriptions') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: 'sub-admin', endpoint: 'epA', p256dh: 'pA', auth: 'aA' }
              ],
              error: null
            })
          }
        }
      }),
    } as any

    const sendMock = webpush.sendNotification as any
    sendMock.mockResolvedValue(undefined)

    await sendPushToQueue(mockDb, 'account-1', dummyPayload)

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'epA' }),
      JSON.stringify(dummyPayload)
    )
  })
})
