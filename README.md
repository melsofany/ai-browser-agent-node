# AI Browser Agent Platform

A cloud-based AI agent platform similar to Manus that can control a browser, execute development tasks, and be accessible remotely from a mobile phone.

## Features

- **Browser Automation**: Control web browsers using Playwright
- **Task Planning**: Break down complex tasks into executable steps
- **System Integration**: Execute terminal commands and manage files
- **Development Tools**: Git operations, dependency management
- **Real-time Dashboard**: Web interface with live logs and task status
- **WebSocket Communication**: Real-time updates via Socket.io
- **REST API**: Full API for programmatic access
- **Docker Support**: Easy deployment with containerization

## Architecture

### Multi-Agent System

The platform uses a multi-agent architecture inspired by AutoGen:

1. **Planner Agent**: Receives tasks and breaks them into smaller executable steps
2. **Execution Agent**: Executes commands, edits files, installs dependencies
3. **Browser Agent**: Controls the browser using Playwright

### Components

```
ai-browser-agent-node/
├── agents/                 # AI agents
│   ├── plannerAgent.js
│   ├── executionAgent.js
│   └── browserAgent.js
├── controllers/            # Task management
│   └── taskController.js
├── api/                    # Express server and routes
│   ├── server.js
│   └── routes.js
├── config/                 # Configuration
│   └── config.js
├── ui/                     # Web dashboard
│   ├── index.html
│   └── dashboard.js
├── main.js                 # Entry point
├── package.json
├── Dockerfile
└── README.md
```

## Installation

### Prerequisites

- Node.js 22+
- npm or pnpm
- Docker (for containerized deployment)

### Local Setup

```bash
# Clone the repository
git clone https://github.com/melsofany/ai-browser-agent-node.git
cd ai-browser-agent-node

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Start the server
npm start
```

The dashboard will be available at `http://localhost:3000`

## Configuration

Create a `.env` file in the project root:

```env
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
BROWSER_TIMEOUT=30000
MAX_CONCURRENT_TASKS=5
GITHUB_TOKEN=your_github_token
RENDER_API_KEY=your_render_api_key
```

## API Endpoints

### Task Management

- `POST /api/task` - Submit a new task
- `POST /api/task/:taskId/execute` - Execute a task
- `GET /api/task/:taskId/status` - Get task status
- `GET /api/tasks` - Get all tasks
- `GET /api/status` - Get system status

### Browser Control

- `POST /api/browser/navigate` - Navigate to URL
- `POST /api/browser/click` - Click element
- `POST /api/browser/type` - Type text
- `GET /api/browser/extract` - Extract page content
- `POST /api/browser/screenshot` - Take screenshot

### Logs

- `GET /api/logs` - Get system logs

## Usage Examples

### Submit a Browser Task

```bash
curl -X POST http://localhost:3000/api/task \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Navigate to GitHub and search for Node.js",
    "type": "browser",
    "url": "https://github.com",
    "actions": [
      {
        "type": "click",
        "params": { "selector": "input[placeholder=\"Search\"]" }
      },
      {
        "type": "type",
        "params": { "selector": "input[placeholder=\"Search\"]", "text": "Node.js" }
      }
    ]
  }'
```

### Submit a System Command Task

```bash
curl -X POST http://localhost:3000/api/task \
  -H "Content-Type: application/json" \
  -d '{
    "description": "List files in current directory",
    "type": "system",
    "commands": ["ls -la"]
  }'
```

### Execute a Task

```bash
curl -X POST http://localhost:3000/api/task/{taskId}/execute
```

### Get Task Status

```bash
curl http://localhost:3000/api/task/{taskId}/status
```

## WebSocket Events

### Client → Server

- `submitTask(taskData)` - Submit a new task
- `executeTask(taskId)` - Execute a task
- `getStatus()` - Get current status
- `getLogs(limit)` - Get logs

### Server → Client

- `connected` - Connection established
- `taskSubmitted` - Task was submitted
- `taskExecuted` - Task execution completed
- `taskUpdate` - Task status updated
- `status` - Status update
- `logs` - Logs update
- `error` - Error occurred

## Docker Deployment

### Build Docker Image

```bash
docker build -t ai-browser-agent:latest .
```

### Run Docker Container

```bash
docker run -p 3000:3000 \
  -e GITHUB_TOKEN=your_token \
  -e RENDER_API_KEY=your_key \
  ai-browser-agent:latest
```

## Render Deployment

### Prerequisites

- Render account
- GitHub repository with the code
- Docker image ready

### Deploy Steps

1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Select Docker as the runtime
4. Configure environment variables:
   - `GITHUB_TOKEN`
   - `RENDER_API_KEY`
5. Set port to 3000
6. Deploy

## Forked Repositories

This project integrates with:

- [Open Interpreter](https://github.com/melsofany/open-interpreter)
- [AutoGen](https://github.com/melsofany/autogen)
- [Browser Use](https://github.com/melsofany/browser-use)

## Development

### Running in Development Mode

```bash
NODE_ENV=development npm start
```

### Debugging

Enable debug logs:

```bash
LOG_LEVEL=debug npm start
```

## Performance Considerations

- Browser instances are managed efficiently
- Tasks are queued and executed sequentially
- Logs are limited to prevent memory issues
- Timeouts prevent hanging processes

## Security

- Environment variables for sensitive data
- CORS enabled for remote access
- Input validation on all endpoints
- Error handling prevents information leakage

## Troubleshooting

### Browser Not Starting

Ensure Playwright browsers are installed:

```bash
npx playwright install chromium
```

### Port Already in Use

Change the PORT in .env or:

```bash
PORT=3001 npm start
```

### Connection Issues

Check if the server is running:

```bash
curl http://localhost:3000/health
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

ISC

## Support

For issues and questions, please open an issue on GitHub.

## Roadmap

- [ ] Multi-browser support (Firefox, Safari)
- [ ] Advanced task scheduling
- [ ] Machine learning integration
- [ ] Enhanced analytics
- [ ] Mobile app
- [ ] Plugin system
- [ ] Distributed agent network

---

Built with ❤️ using Node.js, Express, Playwright, and Socket.io
