#!/usr/bin/env node

/**
 * Main Entry Point
 * Starts the AI Agent Platform
 */

const Server = require('./api/server');

// Create and start server
const server = new Server();

server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await server.stop();
  process.exit(0);
});
