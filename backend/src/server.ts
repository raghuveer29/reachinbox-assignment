import express from "express";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { pool } from "./db";
import { emailQueue } from "./queue/email.queue";
import {
  indexEmail,
  searchEmails,
} from "./services/elasticsearch.service";
import { ExpressAdapter } from "@bull-board/express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { Queue } from "bullmq";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

dotenv.config();

const app = express();
app.use(
  session({
    secret: process.env.SESSION_SECRET || "reachinbox-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:5000/auth/google/callback",
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;

        if (!email) {
          return done(new Error("Google account has no email"));
        }

        const result = await pool.query(
          `INSERT INTO "user"
            ("googleId", "email", "name", "avatar", "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,NOW(),NOW())
           ON CONFLICT ("googleId")
           DO UPDATE SET
             "email" = EXCLUDED."email",
             "name" = EXCLUDED."name",
             "avatar" = EXCLUDED."avatar",
             "updatedAt" = NOW()
           RETURNING *`,
          [
            profile.id,
            email,
            profile.displayName,
            profile.photos?.[0]?.value || null,
          ],
        );

        done(null, result.rows[0]);
      } catch (error) {
        done(error as Error);
      }
    },
  ),
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const result = await pool.query(
      `SELECT * FROM "user" WHERE "id" = $1`,
      [id],
    );

    done(null, result.rows[0] || false);
  } catch (error) {
    done(error);
  }
});

app.use(express.json());
const dashboardQueue = new Queue("email-queue", {
  connection: {
    host: "localhost",
    port: 6379,
  },
});

const serverAdapter = new ExpressAdapter();

serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(dashboardQueue)],
  serverAdapter,
});

app.use(
  "/admin/queues",
  serverAdapter.getRouter(),
);

app.get("/", (_req, res) => {
  res.send("ReachInbox backend is running");
});

const PORT = process.env.PORT || 5000;
app.get("/api/emails/scheduled", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        "recipientEmail",
        "senderEmail",
        subject,
        "scheduledAt",
        status,
        "createdAt"
       FROM "email"
       WHERE status = 'scheduled'
       ORDER BY "scheduledAt" ASC`,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch scheduled emails",
    });
  }
});
app.get("/api/emails/sent", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        "recipientEmail",
        "senderEmail",
        subject,
        "sentAt",
        status,
        "errorMessage"
       FROM "email"
       WHERE status IN ('sent', 'failed')
       ORDER BY "sentAt" DESC NULLS LAST`,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch sent emails",
    });
  }
});
app.get("/api/emails", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM "email"
       ORDER BY "createdAt" DESC`,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch emails",
    });
  }
});
app.get("/api/emails/search", async (req, res) => {
  try {
    const query = String(req.query.q || "");

    if (!query) {
      return res.status(400).json({
        error: "Search query is required",
      });
    }

    const results = await searchEmails(query);

    res.json(results);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Search failed",
    });
  }
});
app.post("/api/emails/schedule-bulk", async (req, res) => {
  try {
    const {
      recipients,
      senderEmail,
      subject,
      body,
      startTime,
      delayBetweenEmails = 2000,
    } = req.body;

    if (
      !Array.isArray(recipients) ||
      recipients.length === 0 ||
      !senderEmail ||
      !subject ||
      !body ||
      !startTime
    ) {
      return res.status(400).json({
        error: "Invalid scheduling data",
      });
    }

    const start = new Date(startTime);

    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({
        error: "Invalid startTime",
      });
    }

    if (start.getTime() <= Date.now()) {
      return res.status(400).json({
        error: "startTime must be in the future",
      });
    }

    const scheduledEmails = [];

    for (let i = 0; i < recipients.length; i++) {
      const recipientEmail = String(recipients[i]).trim();

      if (!recipientEmail) continue;

      const scheduledAt = new Date(
        start.getTime() +
          i * Number(delayBetweenEmails),
      );

      const jobId = `email-${Date.now()}-${i}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      const result = await pool.query(
        `INSERT INTO "email"
        ("recipientEmail", "senderEmail", "subject", "body",
         "scheduledAt", "status", "jobId", "userId",
         "createdAt", "updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
        RETURNING *`,
        [
          recipientEmail,
          senderEmail,
          subject,
          body,
          scheduledAt,
          "scheduled",
          jobId,
          1,
        ],
      );

      const email = result.rows[0];

      await indexEmail(email);

      await emailQueue.add(
        "send-email",
        {
          emailId: email.id,
          to: recipientEmail,
          subject,
          body,
          senderEmail,
        },
        {
          jobId,
          delay: Math.max(
            0,
            scheduledAt.getTime() - Date.now(),
          ),
        },
      );

      scheduledEmails.push(email);
    }

    return res.status(201).json({
      message: `${scheduledEmails.length} emails scheduled`,
      emails: scheduledEmails,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to schedule emails",
    });
  }
});
app.post("/api/emails/send", async (req, res) => {
  try {
    const {
      recipientEmail,
      senderEmail,
      subject,
      body,
    } = req.body;

    if (
      !recipientEmail ||
      !senderEmail ||
      !subject ||
      !body
    ) {
      return res.status(400).json({
        error: "All fields are required",
      });
    }

    const jobId = `email-${randomUUID()}`;

    const result = await pool.query(
      `INSERT INTO "email"
       ("recipientEmail", "senderEmail", "subject", "body",
        "scheduledAt", "status", "jobId", "userId",
        "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,NOW(),'scheduled',$5,1,NOW(),NOW())
       RETURNING *`,
      [
        recipientEmail,
        senderEmail,
        subject,
        body,
        jobId,
      ],
    );

    const email = result.rows[0];

    await indexEmail(email);

    await emailQueue.add(
      "send-email",
      {
        emailId: email.id,
        to: recipientEmail,
        subject,
        body,
        senderEmail,
      },
      {
        jobId,
      },
    );

    return res.status(201).json({
      message: "Email queued successfully",
      email,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to send email",
    });
  }
});
app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "http://localhost:5173/",
  }),
  (_req, res) => {
    res.redirect("http://localhost:5173/");
  },
);

app.get("/api/auth/me", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({
      authenticated: false,
    });
  }

  res.json({
    authenticated: true,
    user: req.user,
  });
});

app.post("/api/auth/logout", (req, res) => {
  req.logout((error) => {
    if (error) {
      return res.status(500).json({
        error: "Logout failed",
      });
    }

    res.json({
      message: "Logged out",
    });
  });
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
app.post("/test-job", async (_req, res) => {
  const job = await emailQueue.add(
  "test-email",
  {
    to: "your-test-recipient@example.com",
    subject: "ReachInbox Test",
    body: "Hello! This email was sent through BullMQ and Ethereal.",
  },
  {
    delay: 10000,
  }
);

  res.json({
    message: "Job scheduled",
    jobId: job.id,
  });
});
app.post("/api/emails/schedule", async (req, res) => {
  try {
    const {
      recipientEmail,
      senderEmail,
      subject,
      body,
      scheduledAt,
    } = req.body;

    if (
      !recipientEmail ||
      !senderEmail ||
      !subject ||
      !body ||
      !scheduledAt
    ) {
      return res.status(400).json({
        error: "All fields are required",
      });
    }

    const scheduledDate = new Date(scheduledAt);

    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({
        error: "Invalid scheduledAt",
      });
    }

    if (scheduledDate.getTime() <= Date.now()) {
      return res.status(400).json({
        error: "scheduledAt must be in the future",
      });
    }

    const jobId = `email-${randomUUID()}`;

    const result = await pool.query(
      `INSERT INTO "email"
       ("recipientEmail", "senderEmail", "subject", "body",
        "scheduledAt", "status", "jobId", "userId",
        "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        recipientEmail,
        senderEmail,
        subject,
        body,
        scheduledDate,
        "scheduled",
        jobId,
        1,
      ],
    );

    const email = result.rows[0];
    await indexEmail(email);

    await emailQueue.add(
      "send-email",
      {
        emailId: email.id,
        to: recipientEmail,
        subject,
        body,
        senderEmail,
      },
      {
        jobId,
        delay: scheduledDate.getTime() - Date.now(),
      },
    );

    return res.status(201).json({
      message: "Email scheduled successfully",
      email,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to schedule email",
    });
  }
});