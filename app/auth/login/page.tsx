import { LoginForm } from '@/components/auth/login-form';
import { siteConfig } from '@/config/site';

export const metadata = {
  title: `Login | ${siteConfig.name}`,
  description: 'Login to access your account',
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col space-y-2 text-center mb-8">
          <h1 className="text-2xl font-bold">{siteConfig.name}</h1>
          <p className="text-sm text-muted-foreground">
            Enter your credentials to access your account
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}

