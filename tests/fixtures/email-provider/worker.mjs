const messages = [];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ statut: "operationnel" });
    }
    if (request.method === "GET" && url.pathname === "/__test/emails") {
      return Response.json(messages);
    }
    if (request.method !== "POST" || url.pathname !== "/emails"
      || request.headers.get("Authorization") !== "Bearer cle-test-locale-sigad") {
      return Response.json({}, { status: 401 });
    }
    let message;
    try {
      message = await request.json();
    } catch {
      return Response.json({}, { status: 400 });
    }
    if (typeof message !== "object" || message === null
      || typeof message.from !== "string" || !Array.isArray(message.to)
      || typeof message.subject !== "string" || typeof message.text !== "string"
      || typeof message.html !== "string") {
      return Response.json({}, { status: 400 });
    }
    messages.push(message);
    return Response.json({ id: "envoi-test-local" });
  },
};
