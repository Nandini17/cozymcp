import express from "express";
import cors from "cors";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";

const MENU_API = "https://cozycrumbsbakery-1.vercel.app/api/menu";
const RESOURCE_URI = "ui://cozy-crumbs/menu.html";

const server = new McpServer({
  name: "cozy-crumbs-bakery",
  version: "1.0.0",
});

registerAppResource(
  server,
  "menu-ui",
  RESOURCE_URI,
  { mimeType: RESOURCE_MIME_TYPE },
  async () => ({
    contents: [
      {
        uri: RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Cozy Crumbs Menu</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 16px; background: #fffaf5; margin: 0; }
      .title { font-size: 24px; font-weight: 700; margin-bottom: 16px; }
      .section { margin-bottom: 28px; }
      .section h2 { margin-bottom: 12px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
      .card { border: 1px solid #e7ddd2; border-radius: 14px; padding: 12px; background: white; }
      img { width: 100%; height: 140px; object-fit: cover; border-radius: 10px; }
      .name { font-weight: 600; margin-top: 8px; }
      .price { color: #555; margin-top: 4px; }
      .note { color: #777; font-size: 13px; margin-top: 4px; }
      .error { color: #b00020; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div id="app">Loading menu…</div>
    <script>
      (function () {
        var root = document.getElementById("app");

        function renderError(message) {
          root.innerHTML = '<div class="error">' + message + '</div>';
        }

        function renderMenu(data) {
          if (!data || !data.categories) {
            renderError("No structured content received.");
            return;
          }

          root.innerHTML =
            '<div class="title">' + (data.storeName || "Cozy Crumbs Bakery") + '</div>' +
            data.categories.map(function (category) {
              return (
                '<div class="section">' +
                  '<h2>' + category.name + '</h2>' +
                  '<div class="grid">' +
                    category.items.map(function (item) {
                      return (
                        '<div class="card">' +
                          '<img src="' + item.fullImageUrl + '" alt="' + item.name + '" />' +
                          '<div class="name">' + item.name + '</div>' +
                          '<div class="price">$' + Number(item.price).toFixed(2) + '</div>' +
                          (item.note ? '<div class="note">' + item.note + '</div>' : '') +
                        '</div>'
                      );
                    }).join('') +
                  '</div>' +
                '</div>'
              );
            }).join('');
        }

        if (!window.openai) {
          renderError("window.openai is not available.");
          return;
        }

        if (!window.openai.onStructuredContent) {
          renderError("window.openai.onStructuredContent is not available.");
          return;
        }

        window.openai.onStructuredContent(function (data) {
          try {
            renderMenu(data);
          } catch (err) {
            renderError("Widget render failed: " + err.message);
          }
        });
      })();
    </script>
  </body>
</html>`,
        _meta: {
          ui: {
            prefersBorder: true,
            domain: "https://cozymcp.onrender.com",
            csp: {
              connectDomains: [
                "https://cozymcp.onrender.com",
                "https://cozycrumbsbakery-1.vercel.app"
              ],
              resourceDomains: [
                "https://res.cloudinary.com"
              ]
            }
          }
        }
      }
    ]
  })
);

registerAppTool(
  server,
  "get_menu",
  {
    title: "Get bakery menu",
    description: "Returns the Cozy Crumbs Bakery menu.",
    inputSchema: {
      category: z
        .string()
        .optional()
        .describe("Optional category like Cookies, Cakes and Cupcakes, or Brownies and More"),
    },
    _meta: {
      ui: {
        resourceUri: RESOURCE_URI,
      },
    },
  },
  async ({ category }) => {
    const res = await fetch(MENU_API);
    if (!res.ok) {
      throw new Error("Menu API failed with " + res.status);
    }

    const menu = await res.json();

    let categories = menu.categories;
    if (category) {
      const wanted = category.trim().toLowerCase();
      categories = categories.filter(function (c) {
        return c.name.toLowerCase() === wanted;
      });
    }

    const normalized = {
      storeName: menu.storeName,
      categories: categories.map(function (c) {
        return {
          name: c.name,
          items: c.items.map(function (item) {
            return {
              ...item,
              fullImageUrl: menu.imageBaseUrl + item.image,
            };
          }),
        };
      }),
    };

    return {
      content: [
        {
          type: "text",
          text:
            "Returned " +
            normalized.categories.length +
            " category group(s) from " +
            normalized.storeName +
            ".",
        },
      ],
      structuredContent: normalized,
    };
  }
);

const app = express();
app.use(cors());
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log("Cozy Crumbs MCP server listening on http://localhost:" + port + "/mcp");
});
