import { Router } from 'express';
import { authController } from '../controllers/AuthController.js';

export const authRouter = Router();

// POST /auth/register
authRouter.post('/register', (req, res, next) => authController.register(req, res, next));

// POST /auth/login
authRouter.post('/login', (req, res, next) => authController.login(req, res, next));

// POST /auth/refresh
authRouter.post('/refresh', (req, res, next) => authController.refresh(req, res, next));

// POST /auth/logout
authRouter.post('/logout', (req, res, next) => authController.logout(req, res, next));
