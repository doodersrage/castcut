import { llmImageUploadHandlers } from '@/lib/llm/image-routes';

const handlers = llmImageUploadHandlers('gemini');

export const runtime = 'nodejs';
export const GET = handlers.GET;
export const POST = handlers.POST;
export const OPTIONS = handlers.OPTIONS;
