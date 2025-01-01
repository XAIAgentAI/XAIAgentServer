// Setup file for Mocha tests
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
// Create require function
global.require = createRequire(import.meta.url);
// Define __filename and __dirname
global.__filename = fileURLToPath(import.meta.url);
global.__dirname = dirname(__filename);
