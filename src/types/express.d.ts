declare namespace Express {
  export interface Request {
    user?: {
      id: string;
      // Add other user properties as needed
    };
  }
}

export {};
