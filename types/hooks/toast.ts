import type { ToastActionElement } from '@/components/ui/toast';
import type { VariantProps } from 'class-variance-authority';

export type ToastProps = VariantProps<typeof toast> & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export interface ToasterToast extends Omit<ToastProps, 'id'> {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
  duration?: number;
}

export interface ToastActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  altText?: string;
}

export type ToastProviderProps = React.PropsWithChildren & {
  duration?: number;
  swipeDirection?: 'up' | 'down' | 'left' | 'right';
  swipeThreshold?: number;
};