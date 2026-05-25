import { z } from 'zod';
import { keysService } from '../services/KeysService.js';

const apiKeySchema = z.object({
  exchange: z.literal('bybit'),
  label: z.string().min(1).max(50),
  apiKey: z.string().min(10),
  apiSecret: z.string().min(10),
  isTestnet: z.boolean().default(true),
});

export class KeysController {
  async listKeys(req, res, next) {
    try {
      const keys = await keysService.listKeys(req.user.sub);
      res.json(keys);
    } catch (err) {
      next(err);
    }
  }

  async createOrUpdateKey(req, res, next) {
    try {
      const parsed = apiKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const { exchange, label, apiKey, apiSecret, isTestnet } = parsed.data;

      const record = await keysService.createOrUpdateKey(
        req.user.sub,
        exchange,
        label,
        apiKey,
        apiSecret,
        isTestnet
      );

      res.json({
        id: record.id,
        exchange: record.exchange,
        label: record.label,
        isTestnet: record.isTestnet,
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteKey(req, res, next) {
    try {
      await keysService.deleteKey(req.user.sub, req.params.id);
      res.json({ message: 'Key deleted' });
    } catch (err) {
      next(err);
    }
  }
}

export const keysController = new KeysController();
