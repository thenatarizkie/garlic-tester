# Garlic Player API Client

A web-based client application for interacting with Garlic Player digital signage devices. This tool provides a user-friendly interface to manage content, capture screenshots, and monitor Garlic Player devices through their REST API.

## Features

- **OAuth2 Authentication**: Secure token-based authentication with Garlic Player devices
- **Local IP Detection**: Automatic detection of your local network IP addresses using WebRTC
- **Content Management**: Update content URLs and reload content on player devices
- **Screenshot Capture**: Take and save screenshots from player devices
- **Device Information**: Query device model information and file listings
- **CORS Proxy**: Built-in proxy server to handle cross-origin requests
- **Responsive UI**: Clean, modern interface built with Tailwind CSS

## Prerequisites

- Node.js >= 18.0.0
- A Garlic Player device on your network
- Network access to the Garlic Player device (default port: 8080)

## Installation

1. Clone or download this repository:
```bash
git clone <repository-url>
cd garlic-tester
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The application will be available at `http://localhost:3005`

## Usage

### Starting the Application

**Production mode:**
```bash
npm start
```

**Development mode** (with auto-restart on file changes):
```bash
npm run dev
```

### Using the Web Interface

1. **Connect to a Player:**
   - Click "Get My Local IP" to auto-detect your network IP addresses
   - Select the appropriate IP or choose "Custom IP..." to enter manually
   - Enter the Garlic Player device credentials (default: admin/admin)
   - Click "Get Access Token" to authenticate

2. **Manage Content:**
   - Enter a content URI (e.g., `https://example.com/content.smil`)
   - Click "Update Content URL" to push new content to the player
   - Click "Reload" to restart the current content

3. **Device Operations:**
   - **Get Model Info**: Retrieve device hardware and software information
   - **List Files**: View files stored on the player device
   - **Take Screenshot**: Capture and download a screenshot from the player

4. **View Results:**
   - All API responses appear in the Console Output section
   - Screenshots are displayed below the console when captured

## API Endpoints

### POST /api/proxy

Proxies HTTP requests to Garlic Player devices to avoid CORS restrictions.

**Request Body:**
```json
{
  "target_url": "http://192.168.1.100:8080/v2/system/modelInfo",
  "method": "GET",
  "body": {}
}
```

**Response:**
Returns the proxied response from the target URL.

### POST /api/screenshot

Fetches a screenshot from a Garlic Player device and saves it locally.

**Request Body:**
```json
{
  "target_url": "http://192.168.1.100:8080/v2/task/screenshot?access_token=YOUR_TOKEN"
}
```

**Response:**
```json
{
  "success": true,
  "filename": "screenshot_2025-11-07T10-30-45.jpg",
  "filepath": "screenshots/screenshot_2025-11-07T10-30-45.jpg",
  "size": 125430,
  "content_type": "image/jpeg",
  "timestamp": "2025-11-07T10-30-45"
}
```

## Configuration

### Environment Variables

- `PORT`: Server port (default: 3005)

Example:
```bash
PORT=8080 npm start
```

### Garlic Player Default Settings

- **Default IP**: 127.0.0.1 (localhost)
- **Default Port**: 8080
- **Default Credentials**: admin/admin
- **API Base Path**: `/v2/`

## Project Structure

```
garlic-tester/
├── server.js           # Express server with proxy endpoints
├── package.json        # Node.js dependencies and scripts
├── public/
│   ├── index.html      # Main web interface
│   └── screenshots/    # Saved screenshots directory
├── CLAUDE.md           # Developer guidance for Claude Code
└── README.md           # This file
```

## Garlic Player API Reference

This client supports the Garlic Player v2 REST API. Common endpoints include:

- `POST /v2/oauth2/token` - Obtain access token
- `GET /v2/system/modelInfo` - Get device information
- `POST /v2/files/find` - List files on device
- `POST /v2/task/screenshot` - Capture screenshot
- `POST /v2/app/start` - Update content URL
- `POST /v2/app/switch` - Reload/switch content

All authenticated endpoints require `?access_token=YOUR_TOKEN` parameter.

## Troubleshooting

### Cannot connect to Garlic Player

- Verify the player device is on the same network
- Check that port 8080 is not blocked by firewall
- Ensure the IP address is correct
- Try pinging the device IP

### Token authentication fails

- Verify username and password are correct
- Check that the Garlic Player REST API is enabled
- Ensure the device firmware supports v2 API

### Screenshot capture fails

- Confirm the access token is valid (tokens may expire)
- Check that the player is currently displaying content
- Verify sufficient disk space for screenshot storage

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- WebRTC IP detection requires HTTPS on some browsers

## Security Notes

- This is a development/testing tool - not intended for production use
- Credentials are transmitted over HTTP (not encrypted)
- Consider using HTTPS in production environments
- Screenshots are publicly accessible in the `public/screenshots/` directory

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Support

For Garlic Player documentation and support, visit:
- [Garlic Player Website](https://garlic-player.com/)
- [Garlic Player Documentation](https://garlic-player.com/documentation/)
