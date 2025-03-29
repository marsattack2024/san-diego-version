# Utils Directory

This directory contains utility functions and helper modules that are used throughout the application.

## URL Utilities (`url-utils.ts`)

The URL Utilities module provides a centralized set of functions for handling URLs throughout the application. It ensures consistent URL validation, extraction, and formatting.

### Key Features

- **URL Extraction**: Extract URLs from text with intelligent detection
- **URL Validation**: Validate and sanitize URLs to ensure they're well-formed and safe
- **Protocol Handling**: Ensure URLs have proper protocols (https:// by default)
- **Domain Validation**: Detect domain-like strings with validation against false positives
- **Security Controls**: Block specific domains from being processed (localhost, internal domains, etc.)

### Main Functions

- `extractUrls(text, options)`: Extract URLs from text with improved detection
- `validateAndSanitizeUrl(url, options)`: Validate and sanitize a URL to ensure it's safe and well-formed
- `ensureProtocol(url)`: Ensure a URL has a protocol (adds https:// if missing)
- `isDomainLike(text)`: Test if a string looks like a domain name (without protocol)

### Usage Example

```typescript
import { extractUrls, validateAndSanitizeUrl, ensureProtocol } from '@/lib/utils/url-utils';

// Extract URLs from text
const text = "Check out example.com and https://test.org for more information";
const urls = extractUrls(text); 
// Result: ["https://example.com", "https://test.org"]

// Validate a URL
const validUrl = validateAndSanitizeUrl("example.com");
// Result: "https://example.com"

// Ensure protocol
const urlWithProtocol = ensureProtocol("test.org");
// Result: "https://test.org"
```

### Integration

This utility module is used by:

- Web Scraper Tool (`lib/chat-engine/tools/web-scraper.ts`)
- Website Summarizer Tool (`lib/agents/tools/website-summarizer.ts`)
- Puppeteer Service (`lib/services/puppeteer.service.ts`)
- Chat Engine Core (`lib/chat-engine/core.ts`)

The URL Utilities module centralizes URL handling logic to maintain consistent validation and security controls across the application. 