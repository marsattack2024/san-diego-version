# AI Chat Application with Vercel AI SDK, Shadcn UI, and RAG

This application demonstrates how to build a modern AI chat application using the Vercel AI SDK, Shadcn UI components, and Retrieval-Augmented Generation (RAG).

## Features

- 💬 Chat with AI using the Vercel AI SDK
- 🔍 Retrieval-Augmented Generation (RAG) for more accurate responses
- 🌐 Web search and scraping capabilities
- 📊 Deep research using Perplexity API
- 🔐 Authentication with Supabase
- 🎨 Beautiful UI with Shadcn UI components
- 📱 Responsive design for all devices

## Prerequisites

- Node.js 18+ and npm
- Supabase account
- OpenAI API key
- Perplexity API key (optional, for deep search)

## Local Development

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the example environment file and fill in your values:
   ```bash
   cp .env.example .env.local
   ```

4. Set up Supabase:
   - Create a new Supabase project
   - Run the SQL from `supabase/migrations/20240306_initial_schema.sql` in the Supabase SQL editor
   - Enable Email/Password authentication in Supabase Auth settings
   - Add your Supabase URL and anon key to `.env.local`

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deploying to Vercel

### 1. Prepare Your Project

Ensure your project is ready for deployment:
- All environment variables are properly set
- The application builds successfully locally
- You have a Supabase project set up

### 2. Deploy to Vercel

#### Using the Vercel Dashboard

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "New Project"
4. Import your repository
5. Configure the project:
   - Framework Preset: Next.js
   - Root Directory: ./
   - Build Command: next build
   - Output Directory: .next
6. Add environment variables:
   ```
   OPENAI_API_KEY=your_openai_api_key
   PERPLEXITY_API_KEY=your_perplexity_api_key
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   NEXT_PUBLIC_APP_URL=your_vercel_deployment_url
   ```
7. Click "Deploy"

#### Using Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy the project:
   ```bash
   vercel
   ```

4. Follow the prompts to configure your project.

### 3. Set Up Supabase Authentication Redirect URLs

After deploying to Vercel, you need to update your Supabase authentication settings:

1. Go to your Supabase project dashboard
2. Navigate to Authentication > URL Configuration
3. Add your Vercel deployment URL to the Site URL
4. Add the following redirect URLs:
   - `https://your-vercel-url.vercel.app/auth/callback`
   - `https://your-vercel-url.vercel.app/login`

### 4. Verify Deployment

1. Visit your deployed application
2. Test the authentication flow
3. Test the chat functionality
4. Test the RAG functionality by uploading documents

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key | Yes |
| `PERPLEXITY_API_KEY` | Your Perplexity API key for deep search | No |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous key | Yes |
| `NEXT_PUBLIC_APP_URL` | Your application URL | Yes |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | No |
| `ENABLE_REMOTE_LOGGING` | Enable remote logging | No |

## Project Structure

- `app/` - Next.js app router pages
- `components/` - UI components
- `lib/` - Core utilities & business logic
  - `agents/` - Agent implementations
  - `chat/` - Chat logic
  - `logger/` - Unified logging system
  - `supabase/` - Supabase client
  - `vector/` - Vector search functionality
- `public/` - Static assets
- `types/` - TypeScript types

## Technologies Used

- [Next.js](https://nextjs.org/) - React framework
- [Vercel AI SDK](https://sdk.vercel.ai/docs) - AI integration
- [Shadcn UI](https://ui.shadcn.com/) - UI components
- [Supabase](https://supabase.com/) - Backend and authentication
- [OpenAI](https://openai.com/) - AI models
- [Perplexity](https://www.perplexity.ai/) - Deep search
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [TypeScript](https://www.typescriptlang.org/) - Type safety

## License

MIT 