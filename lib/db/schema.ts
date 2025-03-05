export interface Vote {
  id: string;
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
  createdAt: string;
}

export interface Chat {
  id: string;
  title?: string;
  createdAt: string;
  userId: string;
  messages: Array<any>; // For MVP, we're not defining a strict message type
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  content?: string;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  kind: string;
  userId: string;
  createdAt: string | Date;
  updatedAt?: string | Date;
} 