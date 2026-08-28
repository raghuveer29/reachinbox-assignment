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
  const [page, setPage] = useState<"scheduled" | "sent">("scheduled");
  const [emails, setEmails] = useState<Email[]>([]);
  const [selected, setSelected] = useState<Email | null>(null);
  const [compose, setCompose] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [loggedIn, setLoggedIn] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [to, setTo] = useState("");
  const [senderEmail, setSenderEmail] = useState("brice59@ethereal.email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sendLater, setSendLater] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  async function loadEmails() {
    setLoading(true);

    try {
      const endpoint =
        page === "scheduled"
          ? "/api/emails/scheduled"
          : "/api/emails/sent";

      const res = await fetch(`${API}${endpoint}`);
      const data = await res.json();

      setEmails(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmails();
  }, [page]);

  async function handleSearch() {
    if (!search.trim()) {
      loadEmails();
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `${API}/api/emails/search?q=${encodeURIComponent(search)}`,
      );

      const data = await res.json();
      setEmails(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function sendEmail() {
    if (!to || !senderEmail || !subject || !body) {
      alert("Please fill all fields.");
      return;
    }

    try {
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

        payload.scheduledAt = new Date(scheduledAt).toISOString();
      }

      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Request failed");
        return;
      }

      alert(sendLater ? "Email scheduled!" : "Email sent!");

      setCompose(false);
      setTo("");
      setSubject("");
      setBody("");
      setScheduledAt("");
      setSendLater(false);

      loadEmails();
    } catch (err) {
      console.error(err);
      alert("Could not connect to backend.");
    }
  }

  function handleCSV(file: File) {
    const reader = new FileReader();

    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text.split(/\r?\n/).filter(Boolean);

      if (lines.length < 2) {
        alert("CSV is empty.");
        return;
      }

      const recipients = lines
        .slice(1)
        .map((line) => line.split(",")[0]?.trim())
        .filter(Boolean);

      setTo(recipients.join(", "));
      alert(`${recipients.length} recipients loaded.`);
    };

    reader.readAsText(file);
  }
   if (!loggedIn) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Login</h1>

          <button
            className="google-login"
            onClick={() => setLoggedIn(true)}
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
            onChange={(e) => setLoginEmail(e.target.value)}
          />

          <input
            className="login-input"
            type="password"
            placeholder="Password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
          />

          <button
            className="login-submit"
            onClick={() => {
              if (!loginEmail || !loginPassword) {
                alert("Please enter email and password");
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
            <Paperclip size={24} />

            <button
              className={`send-later-button ${
                sendLater ? "active" : ""
              }`}
              onClick={() => setSendLater(!sendLater)}
            >
              <CalendarClock size={23} />
              {sendLater ? "Send Later" : "Send"}
            </button>

            <button className="send-button" onClick={sendEmail}>
              {sendLater ? "Schedule" : "Send"}
            </button>
          </div>
        </div>

        <div className="compose-content">
          <div className="compose-row">
            <label>From</label>

            <div className="from-select">
              {senderEmail}
              <ChevronDown size={18} />
            </div>
          </div>

          <div className="compose-row">
            <label>To</label>

            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
            />

            <button
              className="upload-list"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={18} />
              Upload List
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              hidden
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleCSV(e.target.files[0]);
                }
              }}
            />
          </div>

          <div className="compose-row">
            <label>Subject</label>

            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
            />
          </div>

          <div className="limits-row">
            <span>Delay between 2 emails</span>
            <input placeholder="00" />

            <span>Hourly Limit</span>
            <input placeholder="00" />
          </div>

          {sendLater && (
            <div className="schedule-box">
              <h3>Send Later</h3>

              <label>Pick date & time</label>

              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          )}

          <div className="editor">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
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

  if (selected) {
    return (
      <div className="email-detail">
        <div className="detail-header">
          <button onClick={() => setSelected(null)}>
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
              <strong>{selected.senderEmail}</strong>
              <span>
                {new Date(
                  selected.sentAt || selected.scheduledAt || "",
                ).toLocaleString()}
              </span>
            </div>

            <p>to {selected.recipientEmail}</p>

            <div className="message-body">
              {selected.body}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo-text">ONB</div>

        <div className="profile">
          <div className="profile-avatar">O</div>

          <div>
            <strong>Oliver Brown</strong>
            <small>oliver.brown@domain.io</small>
          </div>

          <ChevronDown size={18} />
        </div>

        <button
          className="compose-button"
          onClick={() => setCompose(true)}
        >
          Compose
        </button>

        <div className="section-title">CORE</div>

        <button
          className={`nav-item ${
            page === "scheduled" ? "selected" : ""
          }`}
          onClick={() => {
            setPage("scheduled");
            setSelected(null);
          }}
        >
          <Clock3 size={20} />
          <span>Scheduled</span>
          <b>{page === "scheduled" ? emails.length : ""}</b>
        </button>

        <button
          className={`nav-item ${
            page === "sent" ? "selected" : ""
          }`}
          onClick={() => {
            setPage("sent");
            setSelected(null);
          }}
        >
          <Send size={20} />
          <span>Sent</span>
          <b>{page === "sent" ? emails.length : ""}</b>
        </button>
      </aside>

      <main className="main-content">
        <div className="search-row">
          <div className="search-box">
            <Search size={20} />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder="Search"
            />
          </div>

          <button onClick={handleSearch} className="filter-button">
            <Search size={20} />
          </button>

          <button onClick={loadEmails} className="refresh-button">
            <RefreshCw size={20} />
          </button>
        </div>

        <div className="email-list">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : emails.length === 0 ? (
            <div className="empty">
              <MailIcon />
              <h3>No emails</h3>
              <p>Your {page} emails will appear here.</p>
            </div>
          ) : (
            emails.map((email) => (
              <button
                className="email-row"
                key={email.id}
                onClick={() => setSelected(email)}
              >
                <div className="recipient">
                  To: <strong>{email.recipientEmail}</strong>
                </div>

                {page === "scheduled" && email.scheduledAt ? (
                  <div className="time-badge">
                    <Clock3 size={14} />
                    {new Date(
                      email.scheduledAt,
                    ).toLocaleString()}
                  </div>
                ) : (
                  <div className="sent-badge">Sent</div>
                )}

                <div className="subject">
                  <strong>{email.subject}</strong>
                  <span>
                    {" "}
                    - {email.body?.slice(0, 70) || ""}
                  </span>
                </div>

                <Star
                  size={20}
                  className="star"
                  onClick={(e) => e.stopPropagation()}
                />
              </button>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

function MailIcon() {
  return <Send size={38} />;
}

export default App;