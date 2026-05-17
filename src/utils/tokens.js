import jwt from 'jsonwebtoken';
import { env } from './env.js';

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}
