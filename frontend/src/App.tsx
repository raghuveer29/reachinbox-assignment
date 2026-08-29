import { useEffect, useRef, useState } from "react";
import {
  Search,
  RefreshCw,
  Clock3,
  Send,
  Star,
  ArrowLeft,
  Paperclip,
  CalendarClock,
  Upload,
  ChevronDown,
  Trash2,
} from "lucide-react";
import "./App.css";

const API = "http://localhost:5000";

type Email = {
  id: number;
  recipientEmail: string;
  senderEmail: string;
  subject: string;
  body: string;
  scheduledAt?: string;
  sentAt?: string;
  status: string;
};

function App() {
  // -----------------------------
  // GENERAL STATE
  // -----------------------------

  const [page, setPage] = useState<"scheduled" | "sent">("scheduled");
  const [emails, setEmails] = useState<Email[]>([]);
  const [selected, setSelected] = useState<Email | null>(null);
  const [compose, setCompose] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // -----------------------------
  // LOGIN STATE
  // -----------------------------

  const [loggedIn, setLoggedIn] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // -----------------------------
  // COMPOSE STATE
  // -----------------------------

  const [to, setTo] = useState("");
  const [senderEmail, setSenderEmail] = useState(
    "brice59@ethereal.email",
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // -----------------------------
  // SCHEDULING STATE
  // -----------------------------

  const [scheduledAt, setScheduledAt] = useState("");
  const [sendLater, setSendLater] = useState(false);

  // Delay is stored in milliseconds
  const [delayBetweenEmails, setDelayBetweenEmails] =
    useState(2000);

  // Maximum emails per hour
  const [hourlyLimit, setHourlyLimit] = useState(200);

  // CSV recipients
  const [csvRecipients, setCsvRecipients] = useState<string[]>(
    [],
  );

  const fileRef = useRef<HTMLInputElement>(null);

  // -----------------------------
  // LOAD EMAILS
  // -----------------------------

  async function loadEmails() {
    setLoading(true);

    try {
      const endpoint =
        page === "scheduled"
          ? "/api/emails/scheduled"
          : "/api/emails/sent";

      const res = await fetch(`${API}${endpoint}`);

      if (!res.ok) {
        throw new Error(
          `Backend returned ${res.status}`,
        );
      }

      const data = await res.json();

      setEmails(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load emails:", err);
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (loggedIn) {
      loadEmails();
    }
  }, [page, loggedIn]);

  // -----------------------------
  // CSV HANDLER
  // -----------------------------

  function handleCSV(file: File) {
    const reader = new FileReader();

    reader.onload = () => {
      const text = String(reader.result || "");

      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        alert("CSV is empty.");
        return;
      }

      const emailsFromCSV = text.match(
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
) || [];

      if (emailsFromCSV.length === 0) {
        alert("No valid email addresses found.");
        return;
      }

      // Remove duplicate email addresses
      const uniqueEmails = [
        ...new Set(emailsFromCSV),
      ];

      setCsvRecipients(uniqueEmails);

      // Do not put hundreds/thousands of emails
      // into the "To" input.
      setTo(
        `${uniqueEmails.length} recipient${
          uniqueEmails.length === 1 ? "" : "s"
        } loaded`,
      );

      alert(
        `${uniqueEmails.length} recipients loaded successfully.`,
      );
    };

    reader.onerror = () => {
      alert("Failed to read CSV file.");
    };

    reader.readAsText(file);
  }

  // -----------------------------
  // SEARCH
  // -----------------------------

  async function handleSearch() {
    const query = search.trim();

    if (!query) {
      loadEmails();
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `${API}/api/emails/search?q=${encodeURIComponent(query)}`,
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);

        throw new Error(
          data?.error || "Search failed",
        );
      }

      const data = await res.json();

      setEmails(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Search error:", err);
      alert("Search failed.");
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // SEND / SCHEDULE EMAIL
  // -----------------------------

  async function sendEmail() {
    // Basic validation
    if (!senderEmail || !subject || !body) {
      alert("Please fill all fields.");
      return;
    }

    // ==================================================
    // BULK CSV SCHEDULING
    // ==================================================

    if (csvRecipients.length > 0) {
      if (!sendLater) {
        alert(
          "CSV recipients must be scheduled using Send Later.",
        );
        return;
      }

      if (!scheduledAt) {
        alert("Choose a date and time.");
        return;
      }

      const selectedDate = new Date(scheduledAt);

      if (Number.isNaN(selectedDate.getTime())) {
        alert("Invalid date and time.");
        return;
      }

      if (selectedDate.getTime() <= Date.now()) {
        alert("Please choose a future date and time.");
        return;
      }

      try {
        setLoading(true);

        const res = await fetch(
          `${API}/api/emails/schedule-bulk`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              recipients: csvRecipients,
              senderEmail,
              subject,
              body,
              startTime: selectedDate.toISOString(),
              delayBetweenEmails,
              hourlyLimit,
            }),
          },
        );

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          alert(
            data?.error ||
              `Bulk scheduling failed (${res.status})`,
          );
          return;
        }

        alert(
          `${
            data?.emails?.length ||
            csvRecipients.length
          } emails scheduled successfully!`,
        );

        // Reset compose form
        setCompose(false);
        setTo("");
        setSubject("");
        setBody("");
        setScheduledAt("");
        setSendLater(false);
        setCsvRecipients([]);

        await loadEmails();
      } catch (err) {
        console.error(
          "Bulk scheduling error:",
          err,
        );

        alert(
          "Could not connect to backend. Make sure the backend server is running.",
        );
      } finally {
        setLoading(false);
      }

      return;
    }

    // ==================================================
    // SINGLE EMAIL
    // ==================================================

    if (!to) {
      alert("Please enter a recipient email.");
      return;
    }

    // Prevent accidentally sending the CSV status text
    if (to.includes("recipient") && to.includes("loaded")) {
      alert(
        "Please upload a valid CSV recipient list.",
      );
      return;
    }

    try {
      setLoading(true);

      const endpoint = sendLater
        ? "/api/emails/schedule"
        : "/api/emails/send";

      const payload: Record<string, string> = {
        recipientEmail: to,
        senderEmail,
        subject,
        body,
      };

      if (sendLater) {
        if (!scheduledAt) {
          alert("Choose a date and time.");
          return;
        }

        const selectedDate = new Date(scheduledAt);

        if (Number.isNaN(selectedDate.getTime())) {
          alert("Invalid date and time.");
          return;
        }

        if (selectedDate.getTime() <= Date.now()) {
          alert("Please choose a future date and time.");
          return;
        }

        payload.scheduledAt =
          selectedDate.toISOString();
      }

      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(
          data?.error ||
            `Request failed (${res.status})`,
        );
        return;
      }

      alert(
        sendLater
          ? "Email scheduled successfully!"
          : "Email sent successfully!",
      );

      // Reset form
      setCompose(false);
      setTo("");
      setSubject("");
      setBody("");
      setScheduledAt("");
      setSendLater(false);
      setCsvRecipients([]);

      await loadEmails();
    } catch (err) {
      console.error("Send email error:", err);

      alert(
        "Could not connect to backend. Make sure the backend server is running.",
      );
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // LOGIN PAGE
  // -----------------------------

  if (!loggedIn) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Login</h1>

          <button
            className="google-login"
            onClick={() => {
              alert(
                "Google OAuth will be connected next.",
              );
            }}
          >
            <span className="google-icon">G</span>
            Login with Google
          </button>

          <div className="login-divider">
            <span></span>
            <p>or sign up through email</p>
            <span></span>
          </div>

          <input
            className="login-input"
            type="email"
            placeholder="Email ID"
            value={loginEmail}
            onChange={(e) =>
              setLoginEmail(e.target.value)
            }
          />

          <input
            className="login-input"
            type="password"
            placeholder="Password"
            value={loginPassword}
            onChange={(e) =>
              setLoginPassword(e.target.value)
            }
          />

          <button
            className="login-submit"
            onClick={() => {
              if (!loginEmail || !loginPassword) {
                alert(
                  "Please enter email and password",
                );
                return;
              }

              setLoggedIn(true);
            }}
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------
  // COMPOSE PAGE
  // -----------------------------

  if (compose) {
    return (
      <div className="compose-page">
        <div className="compose-header">
          <button
            className="back-button"
            onClick={() => setCompose(false)}
          >
            <ArrowLeft size={27} />
            <span>Compose New Email</span>
          </button>

          <div className="compose-actions">
            <button
              className="icon-button"
              onClick={() =>
                fileRef.current?.click()
              }
              title="Attach / upload CSV"
            >
              <Paperclip size={24} />
            </button>

            <button
              className={`send-later-button ${
                sendLater ? "active" : ""
              }`}
              onClick={() =>
                setSendLater(!sendLater)
              }
            >
              <CalendarClock size={23} />
              {sendLater ? "Send Later" : "Send"}
            </button>

            <button
              className="send-button"
              onClick={sendEmail}
              disabled={loading}
            >
              {loading
                ? "Processing..."
                : sendLater
                  ? "Schedule"
                  : "Send"}
            </button>
          </div>
        </div>

        <div className="compose-content">
          {/* FROM */}

          <div className="compose-row">
            <label>From</label>

            <div className="from-select">
              {senderEmail}
              <ChevronDown size={18} />
            </div>
          </div>

          {/* TO */}

          <div className="compose-row">
            <label>To</label>

            <input
              value={to}
              onChange={(e) => {
                setTo(e.target.value);

                // If user manually edits the field,
                // clear CSV recipients.
                if (csvRecipients.length > 0) {
                  setCsvRecipients([]);
                }
              }}
              placeholder="recipient@example.com"
              disabled={csvRecipients.length > 0}
            />

            <button
              className="upload-list"
              onClick={() =>
                fileRef.current?.click()
              }
            >
              <Upload size={18} />
              Upload List
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];

                if (file) {
                  handleCSV(file);
                }

                // Allows selecting the same file again
                e.target.value = "";
              }}
            />
          </div>

          {/* SUBJECT */}

          <div className="compose-row">
            <label>Subject</label>

            <input
              value={subject}
              onChange={(e) =>
                setSubject(e.target.value)
              }
              placeholder="Subject"
            />
          </div>

          {/* DELAY + HOURLY LIMIT */}

          <div className="limits-row">
            <span>Delay between 2 emails</span>

            <input
              type="number"
              min="0"
              value={delayBetweenEmails / 1000}
              onChange={(e) => {
                const seconds = Number(
                  e.target.value,
                );

                setDelayBetweenEmails(
                  Math.max(0, seconds * 1000),
                );
              }}
            />

            <span>Hourly Limit</span>

            <input
              type="number"
              min="1"
              value={hourlyLimit}
              onChange={(e) => {
                const limit = Number(
                  e.target.value,
                );

                setHourlyLimit(
                  Math.max(1, limit),
                );
              }}
            />
          </div>

          {/* CSV INFO */}

          {csvRecipients.length > 0 && (
            <div className="csv-info">
              <strong>
                {csvRecipients.length} recipients
                loaded
              </strong>

              <button
                onClick={() => {
                  setCsvRecipients([]);
                  setTo("");
                }}
              >
                Clear
              </button>
            </div>
          )}

          {/* SCHEDULE */}

          {sendLater && (
            <div className="schedule-box">
              <h3>Send Later</h3>

              <label>Pick date & time</label>

              <input
                type="datetime-local"
                value={scheduledAt}
                min={new Date(
                  Date.now() + 60000,
                )
                  .toISOString()
                  .slice(0, 16)}
                onChange={(e) =>
                  setScheduledAt(e.target.value)
                }
              />
            </div>
          )}

          {/* BODY */}

          <div className="editor">
            <textarea
              value={body}
              onChange={(e) =>
                setBody(e.target.value)
              }
              placeholder="Type Your Reply..."
            />

            <div className="editor-toolbar">
              <span>↶</span>
              <span>↷</span>
              <span>|</span>
              <b>Tᵀ</b>
              <b>B</b>
              <i>I</i>
              <u>U</u>
              <span>☰</span>
              <span>1.</span>
              <span>•</span>
              <span>❝</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------
  // EMAIL DETAIL
  // -----------------------------

  if (selected) {
    return (
      <div className="email-detail">
        <div className="detail-header">
          <button
            onClick={() => setSelected(null)}
          >
            <ArrowLeft size={27} />
          </button>

          <h1>{selected.subject}</h1>

          <div>
            <Star size={22} />
            <Trash2 size={22} />
          </div>
        </div>

        <div className="message">
          <div className="avatar">A</div>

          <div className="message-content">
            <div className="message-title">
              <strong>
                {selected.senderEmail}
              </strong>

              <span>
                {new Date(
                  selected.sentAt ||
                    selected.scheduledAt ||
                    "",
                ).toLocaleString()}
              </span>
            </div>

            <p>
              to {selected.recipientEmail}
            </p>

            <div className="message-body">
              {selected.body}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------
  // MAIN DASHBOARD
  // -----------------------------

  return (
    <div className="app">
      {/* SIDEBAR */}

      <aside className="sidebar">
        <div className="logo-text">ONB</div>

        <div className="profile">
          <div className="profile-avatar">
            O
          </div>

          <div>
            <strong>Oliver Brown</strong>
            <small>
              oliver.brown@domain.io
            </small>
          </div>

          <ChevronDown size={18} />
        </div>

        <button
          className="compose-button"
          onClick={() => setCompose(true)}
        >
          Compose
        </button>

        <div className="section-title">
          CORE
        </div>

        {/* SCHEDULED */}

        <button
          className={`nav-item ${
            page === "scheduled"
              ? "selected"
              : ""
          }`}
          onClick={() => {
            setPage("scheduled");
            setSelected(null);
            setSearch("");
          }}
        >
          <Clock3 size={20} />

          <span>Scheduled</span>

          <b>
            {page === "scheduled"
              ? emails.length
              : ""}
          </b>
        </button>

        {/* SENT */}

        <button
          className={`nav-item ${
            page === "sent"
              ? "selected"
              : ""
          }`}
          onClick={() => {
            setPage("sent");
            setSelected(null);
            setSearch("");
          }}
        >
          <Send size={20} />

          <span>Sent</span>

          <b>
            {page === "sent"
              ? emails.length
              : ""}
          </b>
        </button>

        {/* LOGOUT */}

        <button
          className="logout-button"
          onClick={() => {
            setLoggedIn(false);
            setSelected(null);
          }}
        >
          Logout
        </button>
      </aside>

      {/* MAIN */}

      <main className="main-content">
        {/* SEARCH */}

        <div className="search-row">
          <div className="search-box">
            <Search size={20} />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearch();
                }
              }}
              placeholder="Search"
            />
          </div>

          <button
            onClick={handleSearch}
            className="filter-button"
            title="Search"
          >
            <Search size={20} />
          </button>

          <button
            onClick={loadEmails}
            className="refresh-button"
            title="Refresh"
          >
            <RefreshCw size={20} />
          </button>
        </div>

        {/* EMAIL LIST */}

        <div className="email-list">
          {loading ? (
            <div className="loading">
              Loading...
            </div>
          ) : emails.length === 0 ? (
            <div className="empty">
              <MailIcon />

              <h3>No emails</h3>

              <p>
                Your {page} emails will appear
                here.
              </p>
            </div>
          ) : (
            emails.map((email) => (
              <button
                className="email-row"
                key={email.id}
                onClick={() =>
                  setSelected(email)
                }
              >
                <div className="recipient">
                  To:{" "}
                  <strong>
                    {email.recipientEmail}
                  </strong>
                </div>

                {page === "scheduled" &&
                email.scheduledAt ? (
                  <div className="time-badge">
                    <Clock3 size={14} />

                    {new Date(
                      email.scheduledAt,
                    ).toLocaleString()}
                  </div>
                ) : (
                  <div className="sent-badge">
                    {email.status === "failed"
                      ? "Failed"
                      : "Sent"}
                  </div>
                )}

                <div className="subject">
                  <strong>
                    {email.subject}
                  </strong>

                  <span>
                    {" "}
                    -{" "}
                    {email.body?.slice(
                      0,
                      70,
                    ) || ""}
                  </span>
                </div>

                <Star
                  size={20}
                  className="star"
                  onClick={(e) =>
                    e.stopPropagation()
                  }
                />
              </button>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

// -----------------------------
// MAIL ICON
// -----------------------------

function MailIcon() {
  return <Send size={38} />;
}

export default App;