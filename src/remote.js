import { z } from 'zod';
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol';
import { packageName, remoteName } from './shared.js';

const modes = ['standard', 'fast', 'ultrafast'];
const codec = (name, create) => ({ mode: 'strict', typeSymbol: `${packageName}#${name}`, create });
const parameter = (name, create) => {
  const schema = codec(name, create);
  return { name, source: 'json', codec: schema, strictCodec: schema };
};
const session = parameter('sessionId', () => z.string().regex(/^[\w-]+$/).max(200));
const result = codec('Speed', () => z.object({ mode: z.enum(modes) }));
const method = (parameters) => ({ service: remoteName, invocation: { kind: 'direct' }, parameters, result });
export const remoteInfo = createTypertRemoteInfo({
  package: packageName,
  methods: {
    [`${remoteName}/speed`]: method([session]),
    [`${remoteName}/setFast`]: method([session, parameter('enabled', () => z.boolean())]),
  },
}, z);
