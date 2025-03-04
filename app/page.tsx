import { redirect } from 'next/navigation';

export default function Home() {
  // In a real app with authentication, we would:
  // 1. Check if the user is authenticated
  // 2. Redirect to /enhanced-chat if authenticated
  // 3. Redirect to /auth/login if not authenticated
  
  // For now, just redirect to the enhanced chat page
  // This will be protected by middleware in a real implementation
  redirect('/enhanced-chat');
}