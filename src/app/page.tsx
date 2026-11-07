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
};

type SearchResult = {
  ticket_id: number;
  subject: string;
  customer_name: string;
  priority_name: string;
  status_name: string;
  score: number;
};

export default function Home() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  const fetchTickets = useCallback(async () => {
    const response = await fetch("/api/tickets");
    const data = (await response.json()) as {
      tickets?: Ticket[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || "Unable to load tickets");
    }
    return data.tickets ?? [];
  }, []);

  useEffect(() => {
    let active = true;

    fetchTickets()
      .then((items) => {
        if (active) {
          setTickets(items);
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

  async function load() {
    setLoading(true);
    setError("");
    try {
      setTickets(await fetchTickets());
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const breached = tickets.filter((ticket) => ticket.resolution_breached).length;
  const open = tickets.filter(
    (ticket) => !["Resolved", "Closed"].includes(ticket.status_name),
  ).length;

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
        <div className="card">
          <div className="muted">Total tickets</div>
          <div className="metric">{tickets.length}</div>
        </div>
        <div className="card">
          <div className="muted">Open tickets</div>
          <div className="metric">{open}</div>
        </div>
        <div className="card">
          <div className="muted">Resolution breaches</div>
          <div className="metric">{breached}</div>
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
          <h2>Ticket queue</h2>
          <p className="muted">Tenant-scoped operational worklist</p>
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
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.ticket_id}>
                      <td>#{ticket.ticket_id}</td>
                      <td>{ticket.subject}</td>
                      <td>{ticket.customer_name}</td>
                      <td>
                        <span className="pill">{ticket.priority_name}</span>
                      </td>
                      <td>
                        {ticket.status_name}
                        {ticket.resolution_breached ? " · Breached" : ""}
                      </td>
                      <td>{ticket.assignee_name || "Unassigned"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tickets.length === 0 && (
                <p className="empty">No tickets yet. Create one to start tracking support work.</p>
              )}
            </div>
          )}

          <hr />
          <h2>Semantic incident search</h2>
          <p className="muted">
            Find similar historical tickets by meaning, not exact keywords.
          </p>
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
                }}
                placeholder="e.g. VPN disconnects after login"
              />
            </label>
            <button className="primary" disabled={searching}>
              {searching ? "Searching…" : "Find similar tickets"}
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
