import { Client } from "@elastic/elasticsearch";

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
});

const INDEX = "emails";

export async function indexEmail(email: any) {
  await client.index({
    index: INDEX,
    id: String(email.id),
    document: email,
    refresh: true,
  });
}

export async function searchEmails(query: string) {
  const result = await client.search({
    index: INDEX,
    query: {
      bool: {
        should: [
          {
            match: {
              subject: query,
            },
          },
          {
            match: {
              body: query,
            },
          },
          {
            match: {
              recipientEmail: query,
            },
          },
          {
            match: {
              senderEmail: query,
            },
          },
          {
            match: {
              status: query,
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
  });

  return result.hits.hits.map((hit) => hit._source);
}