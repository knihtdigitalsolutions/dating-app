export async function sendSms(to: string, message: string): Promise<boolean> {
  const username = process.env.AT_USERNAME
  const apiKey = process.env.AT_API_KEY
  const from = process.env.AT_SENDER_ID

  if (!username || !apiKey) {
    console.error('[SMS GATEWAY ERROR] Missing Africa\'s Talking Environment Credentials.')
    return false
  }

  // Choose correct endpoint based on username environment context
  const baseUrl = username === 'sandbox'
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging'

  // Africa's Talking expects form-urlencoded params
  const bodyParams = new URLSearchParams()
  bodyParams.append('username', username)
  bodyParams.append('to', to)
  bodyParams.append('message', message)
  
  if (from && username !== 'sandbox') {
    bodyParams.append('from', from)
  }

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': apiKey,
      },
      body: bodyParams.toString(),
    })

    const data = await response.json()

    // Validate recipients array response structure
    const recipientData = data?.SMSMessageData?.Recipients?.[0]
    
    if (recipientData && (recipientData.status === 'Success' || recipientData.status === 'Pending')) {
      console.log(`[SMS DISPATCH SUCCESS] Verification route hit -> Sent to: ${to}, MessageId: ${recipientData.messageId}`)
      return true
    } else {
      console.error('[SMS DISPATCH FAILURE] Gateway error response:', recipientData?.status || 'Unknown failure condition')
      return false
    }
  } catch (error) {
    console.error('[SMS GATEWAY CRITICAL EXCEPTION] Network pipeline error:', error)
    return false
  }
}