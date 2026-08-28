import IORedis from "ioredis";

const redis = new IORedis({
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
});

const MIN_DELAY_MS = Number(
  process.env.MIN_EMAIL_DELAY_MS || 2000,
);

const MAX_EMAILS_PER_HOUR = Number(
  process.env.MAX_EMAILS_PER_HOUR || 100,
);

export async function getSendDelay(senderEmail: string) {
  const now = Date.now();
  const hour = Math.floor(now / 3600000);

  const countKey = `email:rate:${senderEmail}:${hour}`;
  const lastKey = `email:last-send:${senderEmail}`;

  const lastSend = await redis.get(lastKey);
  const count = Number(await redis.get(countKey) || 0);

  let delay = 0;

  if (lastSend) {
    const elapsed = now - Number(lastSend);

    if (elapsed < MIN_DELAY_MS) {
      delay = MIN_DELAY_MS - elapsed;
    }
  }

  if (count >= MAX_EMAILS_PER_HOUR) {
    const nextHour = (hour + 1) * 3600000;

    return {
      allowed: false,
      delay: nextHour - now,
    };
  }

  return {
    allowed: true,
    delay,
  };
}

export async function recordSend(senderEmail: string) {
  const now = Date.now();
  const hour = Math.floor(now / 3600000);

  const countKey = `email:rate:${senderEmail}:${hour}`;
  const lastKey = `email:last-send:${senderEmail}`;

  const count = await redis.incr(countKey);

  if (count === 1) {
    await redis.expire(countKey, 7200);
  }

  await redis.set(lastKey, now.toString());

  return count;
}