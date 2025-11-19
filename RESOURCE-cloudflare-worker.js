// Copy this code into your Cloudflare Worker script

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      // allow common headers clients may send
      "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
      "Content-Type": "application/json",
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const apiKey = env.OPENAI_API_KEY; // Make sure to name your secret OPENAI_API_KEY in the Cloudflare Workers dashboard
    // Read the raw body text first so we can return it on parse errors (helps debugging)
    const bodyText = await request.text();

    // If body is empty, return headers and method so we can see what the client sent
    if (!bodyText) {
      const hdrs = Object.fromEntries(
        request.headers.entries ? request.headers.entries() : []
      );
      return new Response(
        JSON.stringify({
          error: "Empty body received",
          method: request.method,
          headers: hdrs,
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    let userInput;
    try {
      userInput = JSON.parse(bodyText);
    } catch (err) {
      // Return the raw body (truncated) to help debug what the client actually sent
      const raw = bodyText
        ? bodyText.length > 1000
          ? bodyText.slice(0, 1000) + "... (truncated)"
          : bodyText
        : "";
      return new Response(JSON.stringify({ error: "Invalid JSON body", raw }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Determine whether the client requested the newer `gpt-5-search` model (or similar)
    // and route to the Responses API. For backwards-compatibility we still support
    // the older chat/completions flow when a chat-style payload is provided.
    const wantsResponsesAPI =
      (userInput.model && String(userInput.model).includes("gpt-5-search")) ||
      false;

    let apiUrl = "https://api.openai.com/v1/chat/completions";
    let forwardBody = null;

    if (wantsResponsesAPI) {
      // Use the Responses API endpoint for gpt-5-search.
      apiUrl = "https://api.openai.com/v1/responses";

      // The Responses API expects an `input` (string or array). If the client
      // sent `messages` (chat-style), we conservatively concatenate them into
      // a single `input` string so the model receives the conversation context.
      let input = "";
      if (userInput.input) {
        input = userInput.input;
      } else if (userInput.messages && Array.isArray(userInput.messages)) {
        input = userInput.messages
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n\n");
      } else if (userInput.prompt) {
        input = userInput.prompt;
      } else if (userInput.query) {
        input = userInput.query;
      } else {
        // fallback to raw text of body for debugging if nothing else provided
        input = bodyText;
      }

      forwardBody = {
        model: userInput.model,
        input: input,
        // map common optional params if provided by the client
        temperature: userInput.temperature ?? 0.7,
        max_output_tokens: userInput.max_tokens ?? 300,
      };
    } else {
      // legacy chat/completions forwarding (keeps previous behavior)
      apiUrl = "https://api.openai.com/v1/chat/completions";
      forwardBody = {
        model: userInput.model || "gpt-4o",
        messages: userInput.messages,
        max_tokens: userInput.max_tokens ?? 300,
        temperature: userInput.temperature ?? 0.7,
      };
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(forwardBody),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), { headers: corsHeaders });
  },
};
