import { FastifyInstance } from 'fastify'
import { handlePesapalWebhook } from './payments'

export default async function webhookRoutes(app: FastifyInstance) {
  // PesaPal IPN - no auth, but verified internally via API call
  app.post('/pesapal', async (req, reply) => {
    return handlePesapalWebhook(req, reply)
  })

  app.get('/pesapal', async (req, reply) => {
    // PesaPal sometimes hits GET too
    return reply.send({ status: 'ok' })
  })
}
