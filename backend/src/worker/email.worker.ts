import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { pool } from "../db";
import { sendEmail } from "../services/email.service";
import {
  getSendDelay,
  recordSend,
} from "../services/rate-limit.service";
import { indexEmail } from "../services/elasticsearch.service";

const redisConnection = new IORedis({
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
});

const emailWorker = new Worker(
  "email-queue",
  async (job) => {
    const {
      emailId,
      to,
      subject,
      body,
      senderEmail,
    } = job.data;

    console.log(`Processing email ${emailId}, job ${job.id}`);

    const result = await pool.query(
      `UPDATE "email"
       SET "status" = 'processing',
           "updatedAt" = NOW()
       WHERE "id" = $1
         AND "status" = 'scheduled'
       RETURNING *`,
      [emailId],
    );

    if (result.rows.length === 0) {
      console.log(`Email ${emailId} already processed. Skipping.`);
      return { skipped: true };
    }

    try {
      const slot = await getSendDelay(senderEmail);

      if (!slot.allowed) {
        console.log(
          `Hourly limit reached for ${senderEmail}. Rescheduling...`,
        );

        await job.moveToDelayed(
          Date.now() + slot.delay,
          job.token,
        );

        await pool.query(
          `UPDATE "email"
           SET "status" = 'scheduled',
               "updatedAt" = NOW()
           WHERE "id" = $1`,
          [emailId],
        );

        return {
          rescheduled: true,
        };
      }

      if (slot.delay > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, slot.delay),
        );
      }

      // Send email
      const emailResult = await sendEmail(
        to,
        subject,
        body,
      );

      // Record rate-limit usage
      await recordSend(senderEmail);

      // Mark as sent
      await pool.query(
        `UPDATE "email"
         SET "status" = 'sent',
             "sentAt" = NOW(),
             "updatedAt" = NOW()
         WHERE "id" = $1`,
        [emailId],
      );

      // Update Elasticsearch
      const updatedEmail = await pool.query(
        `SELECT * FROM "email" WHERE "id" = $1`,
        [emailId],
      );

      await indexEmail(updatedEmail.rows[0]);

      console.log(`Email ${emailId} sent successfully`);
      console.log("Preview:", emailResult.previewUrl);

      return emailResult;

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error";

      await pool.query(
        `UPDATE "email"
         SET "status" = 'failed',
             "errorMessage" = $2,
             "updatedAt" = NOW()
         WHERE "id" = $1`,
        [emailId, message],
      );

      console.error(
        `Email ${emailId} failed:`,
        message,
      );

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: Number(
      process.env.WORKER_CONCURRENCY || 5,
    ),
  },
);

emailWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

emailWorker.on("failed", (job, error) => {
  console.error(
    `Job ${job?.id} failed:`,
    error.message,
  );
});

console.log("Email worker started");