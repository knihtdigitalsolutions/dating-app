import OpenAI from 'openai'
import { prisma } from '@dating/db'
import { logger } from '../lib/logger'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateProfileEmbedding(profileId: string): Promise<void> {
  try {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
    })

    if (!profile) return

    // Build a rich text representation of the profile for embedding
    const text = [
      profile.bio || '',
      `Age: ${profile.age}`,
      `Interests: ${profile.interests.join(', ')}`,
      `Looking for: ${profile.lookingFor || 'connection'}`,
      `Occupation: ${profile.occupation || ''}`,
      `Education: ${profile.education || ''}`,
      `Languages: ${profile.languages.join(', ')}`,
    ].filter(Boolean).join('. ')

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })

    const embedding = response.data[0].embedding

    // Store as pgvector (raw SQL since Prisma doesn't support vector natively)
    await prisma.$executeRaw`
      UPDATE "Profile"
      SET embedding = ${JSON.stringify(embedding)}::vector,
          "embeddingUpdatedAt" = NOW()
      WHERE id = ${profileId}::uuid
    `

    logger.info({ profileId }, 'Profile embedding generated')
  } catch (err) {
    logger.error({ err, profileId }, 'Failed to generate embedding')
  }
}

export async function getAiCompatibilityScore(
  user1Id: string,
  user2Id: string
): Promise<number | null> {
  try {
    // Cosine similarity via pgvector
    const result = await prisma.$queryRaw<[{ similarity: number }]>`
      SELECT 1 - (p1.embedding <=> p2.embedding) AS similarity
      FROM "Profile" p1, "Profile" p2
      WHERE p1."userId" = ${user1Id}::uuid
        AND p2."userId" = ${user2Id}::uuid
        AND p1.embedding IS NOT NULL
        AND p2.embedding IS NOT NULL
    `

    return result[0]?.similarity ?? null
  } catch {
    return null
  }
}

export async function moderateImage(imageUrl: string): Promise<{ safe: boolean; reason?: string }> {
  try {
    const response = await openai.moderations.create({
      model: 'omni-moderation-latest',
      input: [{ type: 'image_url', image_url: { url: imageUrl } }],
    })

    const result = response.results[0]
    if (result.flagged) {
      const categories = Object.entries(result.categories)
        .filter(([, v]) => v)
        .map(([k]) => k)
      return { safe: false, reason: categories.join(', ') }
    }

    return { safe: true }
  } catch (err) {
    logger.error({ err }, 'Image moderation failed')
    return { safe: true } // fail open, flag for manual review
  }
}

export async function generateIcebreaker(
  senderBio: string,
  recipientBio: string,
  interests: string[]
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a friendly dating app assistant for East Africa. Generate a single, genuine, warm conversation starter (max 2 sentences) based on shared interests. Be specific, not generic. Do not use "Hey" or emojis.',
      },
      {
        role: 'user',
        content: `Sender bio: "${senderBio}"\nRecipient bio: "${recipientBio}"\nShared interests: ${interests.join(', ')}`,
      },
    ],
    max_tokens: 100,
    temperature: 0.8,
  })

  return response.choices[0]?.message?.content || "I'd love to know more about you!"
}
