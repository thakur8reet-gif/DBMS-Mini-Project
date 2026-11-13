"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Ticket = {
  ticket_id: number;
  subject: string;
  customer_name: string;
  priority_name: string;
  status_name: string;
  assignee_name: string | null;
  created_at: string;
  resolution_breached: boolean;
  escalated: boolean;
};

type SearchResult = {
  ticket_id: number;
  subject: string;
  customer_name: string;
  priority_name: string;
  status_name: string;
  score: number;
};

type QueueFilter = "all" | "open" | "breached";

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("resolv") || normalized.includes("clos")) return "complete";
  if (normalized.includes("progress")) return "active";
  return "waiting";
}

export default function Home() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [canReindex, setCanReindex] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [query, setQuery] = useState("");
  const [semanticConfigured, setSemanticConfigured] = useState<boolean | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");

  const fetchTickets = useCallback(async () => {
    const response = await fetch("/api/tickets");
    const data = (await response.json()) as {
      tickets?: Ticket[];
      role?: string;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || "Unable to load tickets");
    }
    return { tickets: data.tickets ?? [], role: data.role };
  }, []);

  useEffect(() => {
    let active = true;

    fetchTickets()
      .then(({ tickets: items, role }) => {
        if (active) {
          setTickets(items);
          setCanReindex(role === "ADMIN");
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Request failed");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchTickets]);

  useEffect(() => {
    const runBackgroundWork = () => {
      void fetch("/api/worker/tick", { method: "POST" }).catch(() => {});
    };
    runBackgroundWork();
    const timer = window.setInterval(runBackgroundWork, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("/api/search", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { configured?: boolean }) => setSemanticConfigured(data.configured === true))
      .catch(() => setSemanticConfigured(false));
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchTickets();
      setTickets(data.tickets);
      setCanReindex(data.role === "ADMIN");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setCreating(true);
    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          description,
          customerEmail: customerEmail || undefined,
          category: "Technical Support",
          priority: "High",
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Ticket creation failed");
      }
      setSubject("");
      setDescription("");
      setCustomerEmail("");
      await load();
      setNotice("Ticket created and added to the queue.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
    } finally {
      setCreating(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError("");
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 5 }),
      });
      const data = (await response.json()) as {
        results?: SearchResult[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Search failed");
      }
      setResults(data.results ?? []);
      setHasSearched(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function reindexTickets() {
    setReindexing(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/worker/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reindexAll: true }),
      });
      const data = (await response.json()) as {
        indexed?: number;
        requeued?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Unable to reindex tickets");
      setNotice(`Search index refreshed: ${data.indexed ?? 0} of ${data.requeued ?? 0} tickets indexed.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reindex tickets");
    } finally {
      setReindexing(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const breached = tickets.filter((ticket) => ticket.resolution_breached).length;
  const open = tickets.filter(
    (ticket) => !["Resolved", "Closed"].includes(ticket.status_name),
  ).length;
  const visibleTickets = tickets.filter((ticket) => {
    if (queueFilter === "open") return !["Resolved", "Closed"].includes(ticket.status_name);
    if (queueFilter === "breached") return ticket.resolution_breached;
    return true;
  });

  return (
    <main className="shell">
      <header className="top">
        <div>
          <div className="brand">
            ResolveIQ <span className="pill">SLA Intelligence</span>
          </div>
          <div className="muted">Support operations overview</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="primary" type="button" onClick={load}>
            Refresh data
          </button>
          <button className="primary" type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <section className="grid" aria-label="Ticket summary">
        <div className="card stat-card stat-total">
          <div className="stat-label">Total tickets</div>
          <div className="metric">{tickets.length}</div>
          <div className="stat-note">Across this workspace</div>
        </div>
        <div className="card stat-card stat-open">
          <div className="stat-label">Open tickets</div>
          <div className="metric">{open}</div>
          <div className="stat-note">Awaiting resolution</div>
        </div>
        <div className="card stat-card stat-breached">
          <div className="stat-label">Resolution breaches</div>
          <div className="metric">{breached}</div>
          <div className="stat-note">Past the SLA target</div>
        </div>
      </section>

      {error && (
        <p className="error" role="alert">
          {error} · <Link href="/login">Sign in</Link>
        </p>
      )}
      {notice && <p className="success" role="status">{notice}</p>}

      <section className="layout">
        <div className="card">
          <div className="section-heading">
            <div>
              <h2>Ticket queue</h2>
              <p className="muted">Your team’s current support workload</p>
            </div>
            <span className="queue-count">{visibleTickets.length} shown</span>
          </div>
          <div className="queue-filters" role="group" aria-label="Filter ticket queue">
            {(["all", "open", "breached"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                className={`filter-button ${queueFilter === filter ? "selected" : ""}`}
                aria-pressed={queueFilter === filter}
                onClick={() => setQueueFilter(filter)}
              >
                {filter === "all" ? "All tickets" : filter === "open" ? "Open" : "Breached"}
                <span>{filter === "all" ? tickets.length : filter === "open" ? open : breached}</span>
              </button>
            ))}
          </div>
          {loading ? (
            <p className="empty" role="status">Loading tickets…</p>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Subject</th>
                    <th>Customer</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTickets.map((ticket) => (
                    <tr key={ticket.ticket_id}>
                      <td>#{ticket.ticket_id}</td>
                      <td>{ticket.subject}</td>
                      <td>{ticket.customer_name}</td>
                      <td><span className={`priority-pill priority-${ticket.priority_name.toLowerCase()}`}>{ticket.priority_name}</span></td>
                      <td>
                        <span className={`status-pill ${ticket.resolution_breached ? "breached" : statusTone(ticket.status_name)}`}>
                          {ticket.resolution_breached ? "SLA breached" : ticket.status_name}
                        </span>
                        {ticket.escalated && <span className="escalation-pill">Escalated</span>}
                      </td>
                      <td>{ticket.assignee_name || "Unassigned"}</td>
                      <td>{new Date(ticket.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleTickets.length === 0 && (
                <p className="empty">
                  {tickets.length === 0
                    ? "No tickets yet. Create one to start tracking support work."
                    : "No tickets match this filter."}
                </p>
              )}
            </div>
          )}

          <hr />
          <h2>Semantic incident search</h2>
          <p className="muted">
            {semanticConfigured === false
              ? "Semantic search is not configured or reachable on this deployment."
              : semanticConfigured === null
                ? "Checking semantic search availability…"
                : "Search service is reachable. Find similar historical tickets by meaning, not exact keywords."}
          </p>
          {canReindex && semanticConfigured === true && (
            <div style={{ marginBottom: 16 }}>
              <button
                className="secondary"
                type="button"
                onClick={reindexTickets}
                disabled={reindexing}
              >
                {reindexing ? "Refreshing search index…" : "Refresh search index"}
              </button>
            </div>
          )}
          <form onSubmit={search}>
            <label className="field">
              Describe the issue
              <input
                required
                minLength={3}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHasSearched(false);
                  setResults([]);
                }}
                placeholder="e.g. VPN disconnects after login"
              />
            </label>
            <button className="primary" disabled={searching || semanticConfigured !== true}>
              {searching ? "Searching…" : semanticConfigured === true ? "Find similar tickets" : "Search unavailable"}
            </button>
          </form>
          {results.map((result) => (
            <div
              key={result.ticket_id}
              className="search-result"
            >
              <b>
                #{result.ticket_id} · {result.subject}
              </b>
              <div className="muted">
                {result.customer_name} · {result.priority_name} ·{" "}
                {result.status_name} · similarity {result.score.toFixed(3)}
              </div>
            </div>
          ))}
          {hasSearched && !searching && results.length === 0 && (
            <p className="empty">No similar tickets found for this search.</p>
          )}
        </div>

        <form className="card" onSubmit={create}>
          <h2>Create ticket</h2>
          <p className="muted">
            Ticket and SLA tracking are created atomically.
          </p>
          <label className="field">
            Subject
            <input
              required
              minLength={4}
              maxLength={200}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>
          <label className="field">
            Description
            <textarea
              required
              minLength={10}
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="field">
            Customer email (optional)
            <input
              type="email"
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
              placeholder="Defaults to your signed-in email"
            />
          </label>
          <button className="primary" type="submit" disabled={creating}>
            {creating ? "Creating ticket…" : "Create ticket"}
          </button>
        </form>
      </section>
    </main>
  );
}
