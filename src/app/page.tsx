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
  response_due_at?: string;
  resolution_due_at?: string;
  response_breached?: boolean;
  resolution_breached: boolean;
  escalated: boolean;
};

type TicketDetail = {
  ticket_id: number; subject: string; description: string; customer_name: string;
  priority_name: string; status_id: number; status_name: string; assignee_name: string | null;
  assigned_to: number | null; created_at: string; response_due_at: string; resolution_due_at: string;
  first_response_at: string | null; response_breached: boolean; resolution_breached: boolean;
  resolved_at: string | null; closed_at: string | null;
};
type TicketStatus = { status_id: number; name: string; is_closed_status: boolean };
type Agent = { user_id: number; name: string; role_name: string };
type HistoryItem = { activity_id: number; event_type: string; previous_value: string | null; new_value: string | null; detail: string | null; created_at: string; actor_name: string | null };
type CommentItem = { comment_id: number; comment_text: string; is_internal: boolean; created_at: string; author_name: string | null };

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
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [ticketStatuses, setTicketStatuses] = useState<TicketStatus[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activity, setActivity] = useState<HistoryItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [queueQuery, setQueueQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [commentText, setCommentText] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [clock, setClock] = useState(0);

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
    const updateClock = () => setClock(Date.now());
    updateClock();
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
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

  async function openTicket(ticketId: number) {
    setDetailLoading(true);
    setSelectedTicket(null);
    try {
      const response = await fetch(`/api/tickets/${ticketId}`, { cache: "no-store" });
      const data = await response.json() as { ticket?: TicketDetail; statuses?: TicketStatus[]; agents?: Agent[]; activity?: HistoryItem[]; comments?: CommentItem[]; error?: string };
      if (!response.ok || !data.ticket) throw new Error(data.error || "Unable to load ticket");
      setSelectedTicket(data.ticket);
      setTicketStatuses(data.statuses ?? []);
      setAgents(data.agents ?? []);
      setActivity(data.activity ?? []);
      setComments(data.comments ?? []);
      setCommentText("");
      setInternalNote(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load ticket");
    } finally {
      setDetailLoading(false);
    }
  }

  async function updateTicket(values: { statusId?: number; assigneeId?: number | null; comment?: string; internal?: boolean }) {
    if (!selectedTicket) return;
    setSavingTicket(true);
    setError("");
    try {
      const response = await fetch(`/api/tickets/${selectedTicket.ticket_id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Ticket update failed");
      await Promise.all([openTicket(selectedTicket.ticket_id), load()]);
      setNotice(values.comment ? (values.internal ? "Internal note added to the ticket." : "Reply added to the ticket.") : "Ticket updated and activity recorded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ticket update failed");
    } finally {
      setSavingTicket(false);
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
    if (queueFilter === "breached" && !ticket.resolution_breached) return false;
    if (statusFilter !== "all" && ticket.status_name !== statusFilter) return false;
    if (priorityFilter !== "all" && ticket.priority_name !== priorityFilter) return false;
    const searchText = `${ticket.ticket_id} ${ticket.subject} ${ticket.customer_name} ${ticket.assignee_name ?? ""}`.toLowerCase();
    return searchText.includes(queueQuery.trim().toLowerCase());
  });
  const statusCounts = tickets.reduce<Record<string, number>>((counts, ticket) => {
    counts[ticket.status_name] = (counts[ticket.status_name] ?? 0) + 1;
    return counts;
  }, {});

  function remainingTime(deadline?: string) {
    if (!deadline) return "—";
    if (!clock) return "Calculating…";
    const minutes = Math.ceil((new Date(deadline).getTime() - clock) / 60_000);
    if (minutes < 0) return `${Math.abs(minutes)}m overdue`;
    if (minutes < 60) return `${minutes}m left`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m left`;
  }

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

      <section className="card workload-card" aria-label="Ticket status breakdown">
        <div className="section-heading"><div><h2>Workload by status</h2><p className="muted">A live view of how work moves through the queue</p></div></div>
        <div className="workload-bars">
          {Object.entries(statusCounts).length === 0 ? <span className="muted">No ticket activity yet</span> : Object.entries(statusCounts).map(([name, count]) => (
            <div className="workload-row" key={name}>
              <span>{name}</span><div className="workload-track"><i style={{ width: `${Math.max(8, count / tickets.length * 100)}%` }} /></div><b>{count}</b>
            </div>
          ))}
        </div>
        <p className="workflow-hint">Typical flow: <b>Open → In Progress → Resolved → Closed</b>. Reopened tickets return to the active queue and keep their full history.</p>
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
          <div className="queue-tools">
            <input aria-label="Search queue" placeholder="Find by ticket, subject, customer, or assignee" value={queueQuery} onChange={(event) => setQueueQuery(event.target.value)} />
            <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Every status</option>{[...new Set(tickets.map((ticket) => ticket.status_name))].map((status) => <option key={status}>{status}</option>)}</select>
            <select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">Every priority</option>{[...new Set(tickets.map((ticket) => ticket.priority_name))].map((priority) => <option key={priority}>{priority}</option>)}</select>
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
                    <th>SLA target</th>
                    <th>Details</th>
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
                      <td><span className={ticket.resolution_breached ? "sla-time overdue" : "sla-time"}>{ticket.resolution_breached ? "Overdue" : remainingTime(ticket.resolution_due_at)}</span></td>
                      <td><button className="text-button" type="button" onClick={() => void openTicket(ticket.ticket_id)}>Open ticket</button></td>
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

          {detailLoading && <p className="empty" role="status">Loading ticket details…</p>}
          {selectedTicket && <section className="ticket-detail" aria-label={`Ticket ${selectedTicket.ticket_id} details`}>
            <div className="detail-header"><div><span className="eyebrow">TICKET #{selectedTicket.ticket_id}</span><h2>{selectedTicket.subject}</h2><p className="muted">{selectedTicket.customer_name} · {selectedTicket.priority_name} priority</p></div><button className="secondary" type="button" onClick={() => setSelectedTicket(null)}>Close details</button></div>
            <p className="ticket-description">{selectedTicket.description}</p>
            <div className="sla-grid">
              <div><span>First response</span><b className={selectedTicket.response_breached ? "overdue" : ""}>{selectedTicket.first_response_at ? `Met ${new Date(selectedTicket.first_response_at).toLocaleString()}` : selectedTicket.response_breached ? "Overdue" : remainingTime(selectedTicket.response_due_at)}</b></div>
              <div><span>Resolution target</span><b className={selectedTicket.resolution_breached ? "overdue" : ""}>{selectedTicket.resolved_at ? `Resolved ${new Date(selectedTicket.resolved_at).toLocaleString()}` : selectedTicket.resolution_breached ? "Overdue" : remainingTime(selectedTicket.resolution_due_at)}</b></div>
            </div>
            <div className="detail-controls">
              <label className="field">Status<select value={selectedTicket.status_id} disabled={savingTicket} onChange={(event) => void updateTicket({ statusId: Number(event.target.value) })}>{ticketStatuses.map((status) => <option key={status.status_id} value={status.status_id}>{status.name}</option>)}</select></label>
              <label className="field">Assigned agent<select value={selectedTicket.assigned_to ?? ""} disabled={savingTicket} onChange={(event) => void updateTicket({ assigneeId: event.target.value ? Number(event.target.value) : null })}><option value="">Unassigned</option>{agents.map((agent) => <option key={agent.user_id} value={agent.user_id}>{agent.name} · {agent.role_name.toLowerCase()}</option>)}</select></label>
            </div>
            <div className="detail-columns">
              <div><h3>Conversation</h3><form onSubmit={(event) => { event.preventDefault(); if (commentText.trim()) void updateTicket({ comment: commentText, internal: internalNote }); }}>
                <label className="field">Add a reply or note<textarea rows={3} maxLength={5000} value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Share an update with the team…" /></label>
                <label className="check-field"><input type="checkbox" checked={internalNote} onChange={(event) => setInternalNote(event.target.checked)} /> Internal note (team only)</label>
                <button className="primary" disabled={savingTicket || !commentText.trim()}>{savingTicket ? "Saving…" : internalNote ? "Add internal note" : "Add reply"}</button>
              </form><div className="timeline">{comments.map((comment) => <article className="timeline-item" key={comment.comment_id}><span className="timeline-dot" /><div><b>{comment.author_name || "Team member"} {comment.is_internal && <em>Internal</em>}</b><p>{comment.comment_text}</p><small>{new Date(comment.created_at).toLocaleString()}</small></div></article>)}{comments.length === 0 && <p className="muted">No replies yet.</p>}</div></div>
              <div><h3>Activity history</h3><div className="timeline">{activity.map((item) => <article className="timeline-item" key={item.activity_id}><span className="timeline-dot" /><div><b>{item.event_type === "STATUS_CHANGED" ? `Status: ${item.previous_value} → ${item.new_value}` : item.event_type === "ASSIGNED" ? `Assignment: ${item.previous_value} → ${item.new_value}` : item.detail}</b><small>{item.actor_name || "Team member"} · {new Date(item.created_at).toLocaleString()}</small></div></article>)}{activity.length === 0 && <p className="muted">Ticket changes will appear here.</p>}</div></div>
            </div>
          </section>}

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
