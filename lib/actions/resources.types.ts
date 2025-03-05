import { z } from 'zod';

// Schema for new resource
export const insertResourceSchema = z.object({
  content: z.string().min(1, 'Content is required')
});

export type NewResourceParams = z.infer<typeof insertResourceSchema>;

export interface Embedding {
  content: string;
  embedding: number[];
} 