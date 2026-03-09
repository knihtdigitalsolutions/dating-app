'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { api } from '@/lib/api'

export default function MatchesPage() {
  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: async () => (await api.get('/matches')).data.data,
    refetchInterval: 30000,
  })

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="p-6 border-b border-border-subtle">
        <h1 className="text-2xl font-display font-bold text-white">Matches</h1>
        <p className="section-label mt-1">{matches.length} connections</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-surface-raised animate-pulse" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
            <span className="text-5xl">💘</span>
            <h3 className="text-white text-xl font-display">No matches yet</h3>
            <p className="text-gray-500 text-sm">Keep discovering! Your matches will appear here.</p>
            <Link href="/discover" className="btn-primary">Start Swiping</Link>
          </div>
        ) : (
          <div className="p-4 space-y-1.5">
            {matches.map((match: any) => (
              <Link key={match.id} href={`/chat/${match.id}`}>
                <div className="flex items-center gap-4 p-4 rounded-2xl hover:bg-surface-raised transition-colors group cursor-pointer border border-transparent hover:border-border-subtle">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-surface-overlay border border-border-subtle">
                      {match.other.photo ? (
                        <img src={match.other.photo} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl">👤</div>
                      )}
                    </div>
                    {match.other.isOnline && (
                      <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-success border-2 border-surface-base" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`font-medium text-sm ${!match.lastMessage?.isRead && !match.lastMessage?.isMine ? 'text-white' : 'text-gray-300'}`}>
                        {match.other.displayName}
                      </span>
                      {match.lastMessage && (
                        <span className="text-gray-600 font-mono text-xs flex-shrink-0">
                          {formatDistanceToNow(new Date(match.lastMessage.createdAt), { addSuffix: false })}
                        </span>
                      )}
                    </div>

                    {match.compatibilityScore && (
                      <p className="text-gold-500 font-mono text-xs">✦ {Math.round(match.compatibilityScore * 100)}% match</p>
                    )}

                    <p className={`text-sm truncate mt-0.5 ${!match.lastMessage?.isRead && !match.lastMessage?.isMine ? 'text-white font-medium' : 'text-gray-500'}`}>
                      {match.lastMessage
                        ? `${match.lastMessage.isMine ? 'You: ' : ''}${match.lastMessage.type === 'TEXT' ? match.lastMessage.content : `📎 ${match.lastMessage.type.toLowerCase()}`}`
                        : '👋 Say hello!'}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {match.lastMessage && !match.lastMessage.isRead && !match.lastMessage.isMine && (
                    <span className="w-2.5 h-2.5 rounded-full bg-gold-500 flex-shrink-0" />
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
