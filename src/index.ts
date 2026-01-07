interface Env {
  OPENROUTER_API_KEY: string;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
}

interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

const TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "create_worker",
      description: "Create a new Cloudflare Worker with the given name and JavaScript/TypeScript code. The worker will be deployed and accessible via a URL.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the worker (must be unique, lowercase, alphanumeric with hyphens)"
          },
          code: {
            type: "string",
            description: "The JavaScript or TypeScript code for the worker. Must export a default fetch handler."
          }
        },
        required: ["name", "code"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_worker",
      description: "Update an existing Cloudflare Worker with new code.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the existing worker to update"
          },
          code: {
            type: "string",
            description: "The new JavaScript or TypeScript code for the worker"
          }
        },
        required: ["name", "code"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "invoke_worker",
      description: "Invoke/call a Cloudflare Worker by name with an HTTP request.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the worker to invoke"
          },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
            description: "HTTP method to use"
          },
          path: {
            type: "string",
            description: "Path to request (e.g., '/' or '/api/data')"
          },
          body: {
            type: "string",
            description: "Optional request body (for POST/PUT/PATCH)"
          },
          headers: {
            type: "object",
            description: "Optional headers as key-value pairs"
          }
        },
        required: ["name", "method", "path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_workers",
      description: "List all Cloudflare Workers in the account.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_worker",
      description: "Get the source code of an existing Cloudflare Worker.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the worker to read"
          }
        },
        required: ["name"]
      }
    }
  }
];

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Worker Agent</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    h1 { color: #333; }
    textarea { width: 100%; height: 120px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; resize: vertical; }
    select, button { padding: 10px 16px; font-size: 14px; border-radius: 4px; }
    select { border: 1px solid #ccc; background: white; }
    button { background: #f38020; color: white; border: none; cursor: pointer; }
    button:hover { background: #e06d10; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .controls { display: flex; gap: 10px; margin: 10px 0; align-items: center; }
    #output { background: white; border: 1px solid #ccc; border-radius: 4px; padding: 15px; margin-top: 20px; white-space: pre-wrap; font-family: monospace; font-size: 13px; min-height: 200px; }
    .loading { color: #666; font-style: italic; }
    .error { color: #c00; }
  </style>
</head>
<body>
  <h1>🤖 Worker Agent</h1>
  <p>An AI agent that can create, update, read, and invoke Cloudflare Workers.</p>
  
  <textarea id="prompt" placeholder="Enter your prompt... e.g., 'Create a worker called my-api that returns the current time as JSON'"></textarea>
  
  <div class="controls">
    <select id="model">
      <option value="openai/gpt-4o">openai/gpt-4o</option>
      <option value="anthropic/claude-sonnet-4">anthropic/claude-sonnet-4</option>
      <option value="google/gemini-2.0-flash-001">google/gemini-2.0-flash-001</option>
      <option value="meta-llama/llama-3.3-70b-instruct">meta-llama/llama-3.3-70b-instruct</option>
    </select>
    <button id="run" onclick="runAgent()">Run</button>
  </div>
  
  <div id="output">Output will appear here...</div>

  <script>
    async function runAgent() {
      const prompt = document.getElementById('prompt').value.trim();
      const model = document.getElementById('model').value;
      const output = document.getElementById('output');
      const btn = document.getElementById('run');
      
      if (!prompt) { output.textContent = 'Please enter a prompt.'; return; }
      
      btn.disabled = true;
      output.className = 'loading';
      output.textContent = 'Running...';
      
      try {
        const res = await fetch('/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, model })
        });
        const data = await res.json();
        output.className = res.ok ? '' : 'error';
        output.textContent = data.error || data.result || JSON.stringify(data, null, 2);
      } catch (e) {
        output.className = 'error';
        output.textContent = 'Error: ' + e.message;
      } finally {
        btn.disabled = false;
      }
    }
    
    document.getElementById('prompt').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.metaKey) runAgent();
    });
  </script>
</body>
</html>`;

async function createWorker(env: Env, name: string, code: string): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${name}`;
  
  const formData = new FormData();
  const metadata = {
    main_module: "worker.js",
    compatibility_date: "2024-01-01"
  };
  
  formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  formData.append("worker.js", new Blob([code], { type: "application/javascript+module" }), "worker.js");

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${env.CLOUDFLARE_API_TOKEN}`
    },
    body: formData
  });

  const result = await response.json() as { success: boolean; errors?: Array<{ message: string }> };
  
  if (!result.success) {
    throw new Error(`Failed to create worker: ${JSON.stringify(result.errors)}`);
  }

  // Enable the workers.dev subdomain
  const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${name}/subdomain`;
  await fetch(subdomainUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ enabled: true })
  });

  return `Worker '${name}' created successfully. It will be available at https://${name}.<your-subdomain>.workers.dev`;
}

async function updateWorker(env: Env, name: string, code: string): Promise<string> {
  return createWorker(env, name, code);
}

async function getWorker(env: Env, name: string): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${name}/content`;
  
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${env.CLOUDFLARE_API_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get worker: ${response.status} ${response.statusText}`);
  }

  const code = await response.text();
  return `Source code for '${name}':\n\n${code}`;
}

async function invokeWorker(env: Env, name: string, method: string, path: string, body?: string, headers?: Record<string, string>): Promise<string> {
  const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/subdomain`;
  const subdomainResponse = await fetch(subdomainUrl, {
    headers: {
      "Authorization": `Bearer ${env.CLOUDFLARE_API_TOKEN}`
    }
  });
  const subdomainResult = await subdomainResponse.json() as { result?: { subdomain: string } };
  const subdomain = subdomainResult.result?.subdomain;

  if (!subdomain) {
    throw new Error("Could not determine workers.dev subdomain");
  }

  const workerUrl = `https://${name}.${subdomain}.workers.dev${path}`;
  
  const response = await fetch(workerUrl, {
    method,
    headers: headers || {},
    body: body && ["POST", "PUT", "PATCH"].includes(method) ? body : undefined
  });

  const responseText = await response.text();
  return `Status: ${response.status}\nHeaders: ${JSON.stringify(Object.fromEntries(response.headers))}\nBody: ${responseText}`;
}

async function listWorkers(env: Env): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts`;
  
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${env.CLOUDFLARE_API_TOKEN}`
    }
  });

  const result = await response.json() as { success: boolean; result?: Array<{ id: string; modified_on: string }>; errors?: Array<{ message: string }> };
  
  if (!result.success) {
    throw new Error(`Failed to list workers: ${JSON.stringify(result.errors)}`);
  }

  const workers = result.result || [];
  if (workers.length === 0) {
    return "No workers found.";
  }

  return `Workers:\n${workers.map(w => `- ${w.id} (modified: ${w.modified_on})`).join("\n")}`;
}

async function executeToolCall(env: Env, toolCall: ToolCall): Promise<string> {
  const args = JSON.parse(toolCall.function.arguments);
  
  try {
    switch (toolCall.function.name) {
      case "create_worker":
        return await createWorker(env, args.name, args.code);
      case "update_worker":
        return await updateWorker(env, args.name, args.code);
      case "get_worker":
        return await getWorker(env, args.name);
      case "invoke_worker":
        return await invokeWorker(env, args.name, args.method, args.path, args.body, args.headers);
      case "list_workers":
        return await listWorkers(env);
      default:
        return `Unknown tool: ${toolCall.function.name}`;
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function chat(env: Env, messages: Message[], model: string): Promise<{ message: Message; usage?: object }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://worker-agent.workers.dev",
      "X-Title": "Worker Agent"
    },
    body: JSON.stringify({
      model,
      messages,
      tools: TOOLS,
      tool_choice: "auto"
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${error}`);
  }

  const result = await response.json() as { choices: Array<{ message: Message }>; usage?: object };
  return { message: result.choices[0].message, usage: result.usage };
}

async function runAgent(env: Env, prompt: string, model: string): Promise<{ result: string; messages: Message[] }> {
  const systemPrompt = `You are an AI agent that can create, update, invoke, and manage Cloudflare Workers.

When creating workers, write valid JavaScript/TypeScript code that exports a default fetch handler. Example:

export default {
  async fetch(request, env, ctx) {
    return new Response("Hello World!");
  }
};

You can create workers to solve tasks, invoke them to test, and update them if there are issues.
You can also read the source code of existing workers using get_worker.
Be concise and efficient. After completing the task, provide a clear summary of what was accomplished.`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt }
  ];

  const maxIterations = 20;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    
    const { message } = await chat(env, messages, model);
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return { result: message.content || "", messages };
    }

    for (const toolCall of message.tool_calls) {
      const result = await executeToolCall(env, toolCall);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result
      });
    }
  }

  return { result: "Max iterations reached", messages };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(HTML_PAGE, {
        headers: { "Content-Type": "text/html" }
      });
    }

    if (url.pathname === "/run" && request.method === "POST") {
      try {
        const body = await request.json() as { prompt?: string; model?: string };
        const prompt = body.prompt;
        const model = body.model || "openai/gpt-4o";

        if (!prompt) {
          return new Response(JSON.stringify({ error: "Missing 'prompt' in request body" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const { result, messages } = await runAgent(env, prompt, model);

        return new Response(JSON.stringify({ result, messages }, null, 2), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ 
          error: error instanceof Error ? error.message : String(error) 
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  }
};
