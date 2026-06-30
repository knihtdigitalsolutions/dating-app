import { NextResponse } from 'next/server'
import { prisma, Gender, SecurityEventType, SecurityEventSeverity } from '@dating/db'
import { authenticateUser } from '@/lib/api-guard'
import { logSecurityEvent } from '@/lib/security'

// Helper to calculate exact age and prevent under-age registrations
function calculateAge(birthDateString: string): number {
  const birthDate = new Date(birthDateString)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

export async function POST(request: Request) {
  try {
    // 1. Authenticate the request using our security guard layer
    const authenticatedUser = await authenticateUser()
    
    const body = await request.json()
    const {
      displayName,
      bio,
      birthDate,
      gender,
      interestedIn,
      latitude,
      longitude,
      locationName,
      photos, // Array of: { url: string, storageKey: string, order: number, isMain: boolean }
    } = body

    // 2. Base Validation
    if (!displayName || !birthDate || !gender || !interestedIn || !photos || photos.length === 0) {
      return NextResponse.json({ error: 'Missing required onboarding parameters' }, { status: 400 })
    }

    // 3. Server-side age enforcement
    const age = calculateAge(birthDate)
    if (age < 18) {
      const ipAddress = request.headers.get('x-forwarded-for') || '127.0.0.1'
      const userAgent = request.headers.get('user-agent') || 'unknown'
      
      await logSecurityEvent(
        authenticatedUser.id,
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        SecurityEventSeverity.HIGH,
        { ipAddress, userAgent },
        `Underage registration attempt rejected. Stated birthdate: ${birthDate} (Age: ${age})`
      )
      return NextResponse.json({ error: 'You must be 18 years or older to use this platform.' }, { status: 403 })
    }

    // 4. Run database operations inside an ACID transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create or update the user's profile information
      const profile = await tx.profile.upsert({
        where: { userId: authenticatedUser.id },
        update: {
          displayName,
          bio,
          age,
          birthDate: new Date(birthDate),
          gender: gender as Gender,
          interestedIn: interestedIn as Gender[],
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          locationName,
          updatedAt: new Date(),
        },
        create: {
          userId: authenticatedUser.id,
          displayName,
          bio,
          age,
          birthDate: new Date(birthDate),
          gender: gender as Gender,
          interestedIn: interestedIn as Gender[],
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          locationName,
        },
      })

      // Wipe out any stale photo references if this is a registration retry
      await tx.photo.deleteMany({ where: { profileId: profile.id } })

      // Write the new S3 file metadata records cleanly linked to this profile
      await tx.photo.createMany({
        data: photos.map((p: any) => ({
          profileId: profile.id,
          url: p.url,
          storageKey: p.storageKey,
          order: p.order || 0,
          isMain: p.isMain || false,
        })),
      })

      // Trace profile modification changes inside our security registry
      const ipAddress = request.headers.get('x-forwarded-for') || '127.0.0.1'
      const userAgent = request.headers.get('user-agent') || 'unknown'
      await logSecurityEvent(
        authenticatedUser.id,
        SecurityEventType.PROFILE_UPDATED,
        SecurityEventSeverity.INFO,
        { ipAddress, userAgent },
        `Profile setup successfully initialized for user account context.`
      )

      return profile
    })

    return NextResponse.json({
      success: true,
      data: {
        profileId: result.id,
        displayName: result.displayName,
      },
    })
  } catch (error: any) {
    console.error('Onboarding Processing Error:', error)
    if (error.message === 'Invalid token security footprint context') {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Failed to process onboarding dataset' }, { status: 500 })
  }
}