// ─────────────────────────────────────────
// ROAM SHARED TYPES
// ─────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

// Auth
export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface JwtPayload {
  sub: string      // userId
  phone?: string
  email?: string
  plan: string
  iat: number
  exp: number
}

export interface OtpRequestBody {
  phone: string
}

export interface OtpVerifyBody {
  phone: string
  code: string
}

// Profile
export interface ProfileCreateBody {
  displayName: string
  bio?: string
  age: number
  birthDate: string
  gender: string
  interestedIn: string[]
  interests: string[]
  lookingFor?: string
}

export interface ProfileUpdateBody extends Partial<ProfileCreateBody> {
  height?: number
  occupation?: string
  education?: string
  religion?: string
  drinking?: string
  smoking?: string
  children?: string
  languages?: string[]
}

export interface ProfileCard {
  id: string
  userId: string
  displayName: string
  age: number
  bio?: string
  gender: string
  photos: { url: string; order: number }[]
  videos: { thumbnailUrl?: string; streamVideoId: string }[]
  distance?: number       // km
  compatibilityScore?: number
  interests: string[]
  verificationStatus: string
  isOnline?: boolean
  locationName?: string
}

// Swipe
export interface SwipeBody {
  swipedId: string
  action: 'LIKE' | 'PASS' | 'SUPER_LIKE'
}

export interface SwipeResult {
  isMatch: boolean
  match?: {
    id: string
    compatibilityScore?: number
  }
}

// Message
export interface SendMessageBody {
  matchId: string
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'VOICE' | 'GIF'
  content?: string
  mediaUrl?: string
  duration?: number
}

export interface MessageDto {
  id: string
  matchId: string
  senderId: string
  type: string
  content?: string
  mediaUrl?: string
  duration?: number
  isRead: boolean
  readAt?: string
  createdAt: string
}

// Call
export interface InitiateCallBody {
  matchId: string
  calleeId: string
  type: 'VOICE' | 'VIDEO'
}

export interface CallDto {
  id: string
  matchId: string
  callerId: string
  calleeId: string
  type: string
  status: string
  roomName?: string
  startedAt?: string
  duration?: number
}

// Payment
export interface CreateSubscriptionBody {
  plan: 'GOLD' | 'PLATINUM'
  method: string
  phoneNumber?: string  // for mobile money
}

export interface PesapalOrderResponse {
  orderTrackingId: string
  merchantReference: string
  redirectUrl: string
}

export interface PesapalWebhookBody {
  OrderTrackingId: string
  OrderMerchantReference: string
  OrderNotificationType: string
}

// Socket events
export interface SocketEvents {
  // Client → Server
  'message:send': SendMessageBody
  'message:read': { messageId: string }
  'typing:start': { matchId: string }
  'typing:stop': { matchId: string }
  'call:initiate': InitiateCallBody
  'call:accept': { callId: string }
  'call:decline': { callId: string }
  'call:end': { callId: string }
  'presence:ping': {}

  // Server → Client
  'message:new': MessageDto
  'message:read:ack': { messageId: string; readAt: string }
  'typing:indicator': { matchId: string; userId: string; isTyping: boolean }
  'match:new': { match: { id: string }; profile: ProfileCard }
  'call:incoming': CallDto
  'call:accepted': { callId: string; roomToken: string }
  'call:declined': { callId: string }
  'call:ended': { callId: string }
  'presence:update': { userId: string; isOnline: boolean; lastSeen: string }
}

// Subscription plan features
export const PLAN_FEATURES = {
  FREE: {
    dailyLikes: 20,
    superLikes: 1,
    boosts: 0,
    seeWhoLikedYou: false,
    rewind: false,
    readReceipts: false,
    videoCalls: false,
    voiceCalls: false,
    passportMode: false,
    incognitoMode: false,
  },
  GOLD: {
    dailyLikes: 100,
    superLikes: 5,
    boosts: 1,
    seeWhoLikedYou: true,
    rewind: true,
    readReceipts: true,
    videoCalls: true,
    voiceCalls: true,
    passportMode: false,
    incognitoMode: false,
  },
  PLATINUM: {
    dailyLikes: -1, // unlimited
    superLikes: 10,
    boosts: 3,
    seeWhoLikedYou: true,
    rewind: true,
    readReceipts: true,
    videoCalls: true,
    voiceCalls: true,
    passportMode: true,
    incognitoMode: true,
  },
} as const

// Subscription pricing (UGX)
export const PLAN_PRICING = {
  GOLD: {
    monthly: 35000,   // ~9 USD
    quarterly: 90000,
    annual: 280000,
  },
  PLATINUM: {
    monthly: 65000,   // ~17 USD
    quarterly: 170000,
    annual: 520000,
  },
} as const
