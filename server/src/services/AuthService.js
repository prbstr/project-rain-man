import bcrypt from 'bcryptjs';
import { userRepository } from '../repositories/UserRepository.js';
import { userSettingsRepository } from '../repositories/UserSettingsRepository.js';
import { generateAccessToken, generateRefreshToken, rotateRefreshToken } from '../auth/tokens.js';

export class AuthService {
  async register(email, username, password) {
    // Check for existing user
    const existing = await userRepository.findByEmailOrUsername(email, username);
    if (existing) {
      throw new Error('Email or username already in use');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await userRepository.create({
      email,
      username,
      passwordHash,
    });

    // Create default settings
    await userSettingsRepository.create(user.id);

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  }

  async login(email, password) {
    // Find user
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Validate password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = await generateRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  }

  async refresh(refreshToken) {
    return rotateRefreshToken(refreshToken);
  }

  async logout(refreshToken) {
    if (refreshToken) {
      // This is handled by RefreshTokenRepository.deleteByToken in controller
    }
    return { message: 'Logged out' };
  }
}

export const authService = new AuthService();
