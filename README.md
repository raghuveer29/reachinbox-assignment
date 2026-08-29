# ReachInbox Email Job Scheduler

A full-stack email scheduling system built for the ReachInbox Software Development Intern Assignment.

The application allows users to schedule emails, process them using BullMQ and Redis, store email state in PostgreSQL, send emails through Ethereal SMTP, and search email data using Elasticsearch.

---

## Tech Stack

### Backend

- TypeScript
- Express.js
- PostgreSQL
- BullMQ
- Redis
- Ethereal Email SMTP
- Elasticsearch
- Bull Board

### Frontend

- React
- TypeScript
- Vite
- CSS

### Infrastructure

- Docker
- Docker Compose

---

## Architecture

```text
                    React Frontend
                          |
                          v
                    Express API
                     /    |    \
                    /     |     \
                   v      v      v
            PostgreSQL  BullMQ  Elasticsearch
                         |
                         v
                        Redis
                         |
                         v
                    Email Worker
                         |
                         v
                   Ethereal SMTP