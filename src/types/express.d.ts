import 'express-session';

declare module 'express-session' {
  interface SessionData {
    tokens?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
    };
  }
}

declare namespace Express {
  export interface Request {
    user?: {
      id: string;
      // Add other user properties as needed
    };
  }
}

export {};
