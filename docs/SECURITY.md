# Authentication and authorization

- Passwords are stored as bcrypt hashes; plaintext passwords are never stored or logged.
- Login verifies active user and active tenant, then issues an eight-hour HS256 JWT in an HttpOnly, SameSite=Lax cookie. Production cookies are Secure.
- API routes verify the signature and derive tenant/user/role from the signed token. Client-supplied tenant IDs are never trusted.
- Ticket creation is restricted to ADMIN and AGENT. Read APIs require authentication and always filter by session tenant.
- Database foreign keys additionally enforce same-tenant relationships.
- Configure a cryptographically random AUTH_SECRET of at least 32 bytes. Rotate it when compromised; revoke sessions by changing the secret.
- Create users through an administrator-controlled provisioning workflow or secure SQL seed process. The demo seed deliberately contains a placeholder password hash and cannot be used to log in until replaced with a real bcrypt hash.
