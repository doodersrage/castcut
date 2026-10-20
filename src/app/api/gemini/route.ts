import { llmImageQueueHandlers } from '@/lib/llm/image-routes';

const handlers = llmImageQueueHandlers('gemini');

export const runtime = 'nodejs';
export const maxDuration = 120;
export const GET = handlers.GET;
export const POST = handlers.POST;
export const OPTIONS = handlers.OPTIONS;
