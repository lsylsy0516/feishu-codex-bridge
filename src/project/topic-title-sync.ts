import type { LarkChannel } from '@larksuiteoapi/node-sdk';
import { threadTitleFromText } from '../bot/thread-title';
import { fetchQuotedContext } from '../bot/quote';
import { log } from '../core/logger';

export async function fetchFeishuTopicTitle(
  channel: LarkChannel,
  topicId: string,
  knownRootMessageId?: string,
): Promise<string | undefined> {
  const rootMessageId = knownRootMessageId
    ?? await findTopicRootMessageId(channel, topicId);
  if (!rootMessageId) return undefined;
  const root = await fetchQuotedContext(channel, rootMessageId);
  if (!root?.content.trim()) return undefined;
  return threadTitleFromText(root.content);
}

async function findTopicRootMessageId(
  channel: LarkChannel,
  topicId: string,
): Promise<string | undefined> {
  try {
    const response = await channel.rawClient.im.v1.message.list({
      params: {
        container_id_type: 'thread',
        container_id: topicId,
        sort_type: 'ByCreateTimeAsc',
        page_size: 1,
        card_msg_content_type: 'user_card_content',
      },
    });
    const first = response.data?.items?.[0];
    return first?.root_id ?? first?.message_id;
  } catch (err) {
    log.warn('session', 'topic-root-fetch-failed', {
      topicId,
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
