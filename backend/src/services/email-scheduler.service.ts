import { emailQueue } from "../queue/email.queue.js";

export interface ScheduleEmailInput {
  recipientEmail: string;
  senderEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
}

export async function scheduleEmail(data: ScheduleEmailInput) {
  const scheduledAt = new Date(data.scheduledAt);

  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Invalid scheduledAt");
  }

  if (scheduledAt.getTime() <= Date.now()) {
    throw new Error("scheduledAt must be in the future");
  }

  const job = await emailQueue.add(
    "send-email",
    {
      to: data.recipientEmail,
      subject: data.subject,
      body: data.body,
      senderEmail: data.senderEmail,
    },
    {
      delay: Math.max(0, scheduledAt.getTime() - Date.now()),
    },
  );

  return job;
}