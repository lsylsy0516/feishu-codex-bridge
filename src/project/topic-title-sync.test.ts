import type { LarkChannel } from '@larksuiteoapi/node-sdk';
import { describe, expect, it } from 'vitest';
import { fetchFeishuTopicTitle } from './topic-title-sync';

function fakeChannel(title: string): LarkChannel {
  return {
    botIdentity: { openId: 'ou_bot', name: 'Codex' },
    rawClient: {
      im: {
        v1: {
          message: {
            async list() {
              return {
                data: {
                  items: [{
                    message_id: 'om_reply',
                    root_id: 'om_root',
                  }],
                },
              };
            },
            async get() {
              return {
                data: {
                  items: [{
                    message_id: 'om_root',
                    msg_type: 'text',
                    create_time: '1785208049000',
                    sender: { id: 'ou_user', id_type: 'open_id', sender_type: 'user' },
                    body: { content: JSON.stringify({ text: title }) },
                  }],
                },
              };
            },
          },
        },
      },
    },
  } as unknown as LarkChannel;
}

describe('Feishu topic title sync', () => {
  it('resolves the topic root message and normalizes its title', async () => {
    await expect(fetchFeishuTopicTitle(
      fakeChannel('  为什么我在飞书发起的 Codex 对话看不到  '),
      'omt_topic',
    )).resolves.toBe('为什么我在飞书发起的 Codex 对话看不到');
  });
});
