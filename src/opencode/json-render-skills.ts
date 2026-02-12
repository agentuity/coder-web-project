/**
 * Inline skill content for json-render and ui_spec instructions.
 * These are injected into every sandbox so the OpenCode agent knows how
 * to generate json-render specs and output ui_spec code fences.
 *
 * Backticks in the markdown are escaped as \` inside template literals.
 */

export const JSON_RENDER_CORE_SKILL = `---
name: json-render-core
description: Core package for defining schemas, catalogs, and AI prompt generation for json-render. Use when working with @json-render/core, defining schemas, creating catalogs, or building JSON specs for UI/video generation.
---

# @json-render/core

Core package for schema definition, catalog creation, and spec streaming.

## Key Concepts

- **Schema**: Defines the structure of specs and catalogs (use \`defineSchema\`)
- **Catalog**: Maps component/action names to their definitions (use \`defineCatalog\`)
- **Spec**: JSON output from AI that conforms to the schema
- **SpecStream**: JSONL streaming format for progressive spec building

## Defining a Schema

\`\`\`typescript
import { defineSchema } from "@json-render/core";

export const schema = defineSchema((s) => ({
  spec: s.object({
    // Define spec structure
  }),
  catalog: s.object({
    components: s.map({
      props: s.zod(),
      description: s.string(),
    }),
  }),
}), {
  promptTemplate: myPromptTemplate, // Optional custom AI prompt
});
\`\`\`

## Creating a Catalog

\`\`\`typescript
import { defineCatalog } from "@json-render/core";
import { schema } from "./schema";
import { z } from "zod";

export const catalog = defineCatalog(schema, {
  components: {
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["primary", "secondary"]).nullable(),
      }),
      description: "Clickable button component",
    },
  },
});
\`\`\`

## Generating AI Prompts

\`\`\`typescript
const systemPrompt = catalog.prompt(); // Uses schema's promptTemplate
const systemPrompt = catalog.prompt({ customRules: ["Rule 1", "Rule 2"] });
\`\`\`

## SpecStream Utilities

For streaming AI responses (JSONL patches):

\`\`\`typescript
import { createSpecStreamCompiler } from "@json-render/core";

const compiler = createSpecStreamCompiler<MySpec>();

// Process streaming chunks
const { result, newPatches } = compiler.push(chunk);

// Get final result
const finalSpec = compiler.getResult();
\`\`\`

## Dynamic Prop Expressions

Any prop value can be a dynamic expression resolved at render time:

- **\`{ "$path": "/state/key" }\`** - reads a value from the state model
- **\`{ "$cond": <condition>, "$then": <value>, "$else": <value> }\`** - evaluates a visibility condition and picks a branch

\`$cond\` uses the same syntax as visibility conditions (\`eq\`, \`neq\`, \`path\`, \`and\`, \`or\`, \`not\`). \`$then\` and \`$else\` can themselves be expressions (recursive).

\`\`\`json
{
  "color": {
    "$cond": { "eq": [{ "path": "/activeTab" }, "home"] },
    "$then": "#007AFF",
    "$else": "#8E8E93"
  }
}
\`\`\`

\`\`\`typescript
import { resolvePropValue, resolveElementProps } from "@json-render/core";

const resolved = resolveElementProps(element.props, { stateModel: myState });
\`\`\`

## User Prompt Builder

Build structured user prompts with optional spec refinement and state context:

\`\`\`typescript
import { buildUserPrompt } from "@json-render/core";

// Fresh generation
buildUserPrompt({ prompt: "create a todo app" });

// Refinement (patch-only mode)
buildUserPrompt({ prompt: "add a toggle", currentSpec: spec });

// With runtime state
buildUserPrompt({ prompt: "show data", state: { todos: [] } });
\`\`\`

## Spec Validation

Validate spec structure and auto-fix common issues:

\`\`\`typescript
import { validateSpec, autoFixSpec } from "@json-render/core";

const { valid, issues } = validateSpec(spec, catalog);
const fixed = autoFixSpec(spec);
\`\`\`

## Key Exports

| Export | Purpose |
|--------|---------|
| \`defineSchema\` | Create a new schema |
| \`defineCatalog\` | Create a catalog from schema |
| \`resolvePropValue\` | Resolve a single prop expression against data |
| \`resolveElementProps\` | Resolve all prop expressions in an element |
| \`buildUserPrompt\` | Build user prompts with refinement and state context |
| \`validateSpec\` | Validate spec structure |
| \`autoFixSpec\` | Auto-fix common spec issues |
| \`createSpecStreamCompiler\` | Stream JSONL patches into spec |
| \`parseSpecStreamLine\` | Parse single JSONL line |
| \`applySpecStreamPatch\` | Apply patch to object |`;

export const JSON_RENDER_REACT_SKILL = `---
name: json-render-react
description: React renderer for json-render that turns JSON specs into React components. Use when working with @json-render/react, building React UIs from JSON, creating component catalogs, or rendering AI-generated specs.
---

# @json-render/react

React renderer that converts JSON specs into React component trees.

## Quick Start

\`\`\`typescript
import { defineRegistry, Renderer } from "@json-render/react";
import { catalog } from "./catalog";

const { registry } = defineRegistry(catalog, {
  components: {
    Card: ({ props, children }) => <div>{props.title}{children}</div>,
  },
});

function App({ spec }) {
  return <Renderer spec={spec} registry={registry} />;
}
\`\`\`

## Creating a Catalog

\`\`\`typescript
import { defineCatalog } from "@json-render/core";
import { schema, defineRegistry } from "@json-render/react";
import { z } from "zod";

// Create catalog with props schemas
export const catalog = defineCatalog(schema, {
  components: {
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["primary", "secondary"]).nullable(),
      }),
      description: "Clickable button",
    },
    Card: {
      props: z.object({ title: z.string() }),
      description: "Card container with title",
    },
  },
});

// Define component implementations with type-safe props
const { registry } = defineRegistry(catalog, {
  components: {
    Button: ({ props }) => (
      <button className={props.variant}>{props.label}</button>
    ),
    Card: ({ props, children }) => (
      <div className="card">
        <h2>{props.title}</h2>
        {children}
      </div>
    ),
  },
});
\`\`\`

## Spec Structure (Element Tree)

The React schema uses an element tree format:

\`\`\`json
{
  "root": {
    "type": "Card",
    "props": { "title": "Hello" },
    "children": [
      { "type": "Button", "props": { "label": "Click me" } }
    ]
  }
}
\`\`\`

## Providers

| Provider | Purpose |
|----------|---------|
| \`StateProvider\` | Share state across components (JSON Pointer paths) |
| \`ActionProvider\` | Handle actions dispatched via the event system |
| \`VisibilityProvider\` | Enable conditional rendering based on state |
| \`ValidationProvider\` | Form field validation |

## Dynamic Prop Expressions

Any prop value can be a data-driven expression resolved by the renderer before components receive props:

- **\`{ "$path": "/state/key" }\`** - reads from data model
- **\`{ "$cond": <condition>, "$then": <value>, "$else": <value> }\`** - conditional value

\`\`\`json
{
  "color": {
    "$cond": { "eq": [{ "path": "/status" }, "active"] },
    "$then": "green",
    "$else": "gray"
  }
}
\`\`\`

Components receive already-resolved props. No changes needed to component implementations.

## Event System

Components use \`emit\` to fire named events. The element's \`on\` field maps events to action bindings:

\`\`\`tsx
// Component emits a named event
Button: ({ props, emit }) => (
  <button onClick={() => emit?.("press")}>{props.label}</button>
),
\`\`\`

\`\`\`json
{
  "type": "Button",
  "props": { "label": "Submit" },
  "on": { "press": { "action": "submit" } }
}
\`\`\`

## Built-in Actions

The \`setState\` action is handled automatically by \`ActionProvider\` and updates the state model directly, which re-evaluates visibility conditions and dynamic prop expressions:

\`\`\`json
{ "action": "setState", "actionParams": { "path": "/activeTab", "value": "home" } }
\`\`\`

## Key Exports

| Export | Purpose |
|--------|---------|
| \`defineRegistry\` | Create a type-safe component registry from a catalog |
| \`Renderer\` | Render a spec using a registry |
| \`schema\` | Element tree schema |
| \`useStateStore\` | Access state context |
| \`useStateValue\` | Get single value from state |
| \`useStateBinding\` | Two-way state binding |
| \`useActions\` | Access actions context |
| \`useAction\` | Get a single action dispatch function |
| \`useUIStream\` | Stream specs from an API endpoint |`;

export const UI_SPEC_INSTRUCTIONS = `# Inline UI Rendering

You can render rich interactive UI components directly in the chat by outputting a fenced code block with the language tag \`ui_spec\`.

## How It Works

Output a JSON object inside a \`\`\`ui_spec code fence. The system detects it and renders it as an interactive component tree.

Example:

\`\`\`ui_spec
{
  "root": "card-1",
  "elements": {
    "card-1": {
      "type": "Card",
      "props": { "title": "Dashboard" },
      "children": ["metric-row"]
    },
    "metric-row": {
      "type": "Row",
      "props": { "gap": "md" },
      "children": ["metric-1", "metric-2"]
    },
    "metric-1": {
      "type": "Metric",
      "props": { "label": "Revenue", "value": "$12,345", "change": "+12%", "trend": "up" }
    },
    "metric-2": {
      "type": "Metric",
      "props": { "label": "Users", "value": "1,234", "change": "+5%", "trend": "up" }
    }
  }
}
\`\`\`

## Spec Format

The spec follows the @json-render/react flat element tree format:

- **root**: A string key pointing to the root element in the elements map
- **elements**: A flat map of all elements, keyed by unique IDs (e.g. "card-1", "row-1", "metric-1")
- Each element has:
  - \`type\` — Component name from the catalog
  - \`props\` — Component properties
  - \`children\` — Array of string keys referencing child elements (optional, omit for leaf nodes)

Key rules:
- Every element referenced in a \`children\` array MUST exist in the \`elements\` map
- Use descriptive, unique keys (e.g. "header-card", "sales-chart", "submit-btn")
- Layout components (Box, Flex, Row, Column, Stack, Card, Form, Section, Container, Grid, Hero, CTA) use \`children\` to nest other elements
- Leaf components (Text, Heading, Paragraph, List, Metric, Chart, Button, Feature, Testimonial, PricingCard, etc.) typically have no children

## Available Components

### Primitive Components

| Component | Key Props | Description |
|-----------|-----------|-------------|
| Box | className? | Generic container — use className for any Tailwind styling |
| Flex | direction? (row/col/row-reverse/col-reverse), wrap?, justify? (start/center/end/between/around/evenly), items? (start/center/end/stretch/baseline), gap? (sm/md/lg), className? | Flexbox layout container with full control |
| Heading | level? (1-6, default 2), content, className? | Semantic heading (h1-h6) for page and section titles |
| Paragraph | content, className? | Paragraph text block for body content |
| List | items [], ordered?, className? | Ordered or unordered list |

### Data & Content Components

| Component | Key Props | Description |
|-----------|-----------|-------------|
| Card | title, description?, padding? (sm/md/lg) | Container card for grouping content |
| Text | content, variant? (heading/subheading/body/caption) | Text display |
| Button | label, variant? (primary/secondary/outline/ghost), action? | Clickable button |
| Table | columns [{key,label}], rows [{key:value}] | Data table |
| Metric | label, value, change?, trend? (up/down/neutral) | Key metric display |
| Chart | type (bar/line/pie), data, xKey?, yKey? | Data visualization |
| Image | src, alt?, width?, height? | Image display |
| Badge | text, variant? (default/success/warning/error/info) | Status badge |
| Alert | message, variant? (info/success/warning/error), title? | Alert block |
| Link | href, label, external? | Navigation link |
| Code | language?, content | Code block |
| Divider | (none) | Visual separator |
| Avatar | src?, alt?, fallback?, size? (sm/md/lg) | Circular avatar image with fallback initials |

### Form Components

| Component | Key Props | Description |
|-----------|-----------|-------------|
| Form | title? | Form container (uses children) |
| Input | label, placeholder?, type? (text/email/number/password) | Text input field |
| Select | label, options [{value,label}] | Dropdown select |

### Layout Components

| Component | Key Props | Description |
|-----------|-----------|-------------|
| Row | gap? (sm/md/lg), align? (start/center/end/stretch) | Horizontal layout |
| Column | gap? (sm/md/lg), align? (start/center/end/stretch) | Vertical layout |
| Stack | gap? (sm/md/lg), direction? (horizontal/vertical) | Stacked layout |
| Section | title?, subtitle?, background? (default/muted/primary/dark), padding? (sm/md/lg/xl) | Full-width content section with background and padding |
| Container | maxWidth? (sm/md/lg/xl/full) | Max-width centered wrapper |
| Grid | columns? (1-4), gap? (sm/md/lg) | Responsive CSS grid layout |
| Spacer | size? (sm/md/lg/xl) | Controlled vertical spacing |

### Page-Level Components

| Component | Key Props | Description |
|-----------|-----------|-------------|
| Hero | headline, subheadline?, backgroundGradient? (none/blue/purple/green/orange/dark), backgroundImage?, align? (left/center) | Primary header section with headline and CTA slot |
| Navbar | logo?, logoSrc?, links? [{label,href}], ctaLabel?, ctaHref? | Site navigation bar with logo, links, and optional CTA |
| Footer | logo?, copyright?, columns? [{title, links: [{label,href}]}] | Multi-column footer with link groups and copyright |
| Feature | icon?, title, description? | Feature block (icon + title + description) for feature grids |
| Testimonial | quote, author, role?, avatarSrc? | Social proof block with quote, author, role, and avatar |
| PricingCard | tier, price, description?, features [], ctaLabel?, highlighted? | Pricing tier card with feature list and CTA |
| CTA | headline, description? | Call-to-action banner with headline, description, and button slot |
| Accordion | items [{title, content}] | Collapsible content sections for FAQ or details |

**Note:** All components accept an optional \`className\` prop for custom Tailwind CSS overrides.

## Composition Recipes

**IMPORTANT:** Match your component choices to the user's intent. ui_spec is a general-purpose generative UI system — landing pages are ONE use case among many.

### Dashboard

For data-heavy, analytical UIs:

\`\`\`
Card → Row(Metric×3-4) → Row(Chart + Table) → Table
\`\`\`

\`\`\`ui_spec
{
  "root": "dashboard",
  "elements": {
    "dashboard": {
      "type": "Column",
      "props": { "gap": "md" },
      "children": ["title", "metrics-row", "charts-row", "data-table"]
    },
    "title": { "type": "Heading", "props": { "level": "2", "content": "Sales Dashboard" } },
    "metrics-row": {
      "type": "Grid",
      "props": { "columns": 4, "gap": "md" },
      "children": ["m1", "m2", "m3", "m4"]
    },
    "m1": { "type": "Metric", "props": { "label": "Revenue", "value": "$48,200", "change": "+12%", "trend": "up" } },
    "m2": { "type": "Metric", "props": { "label": "Orders", "value": "1,234", "change": "+5%", "trend": "up" } },
    "m3": { "type": "Metric", "props": { "label": "Customers", "value": "892", "change": "-2%", "trend": "down" } },
    "m4": { "type": "Metric", "props": { "label": "Avg Order", "value": "$39.10", "change": "+8%", "trend": "up" } },
    "charts-row": {
      "type": "Grid",
      "props": { "columns": 2, "gap": "md" },
      "children": ["chart-card", "pie-card"]
    },
    "chart-card": {
      "type": "Card",
      "props": { "title": "Revenue Over Time" },
      "children": ["line-chart"]
    },
    "line-chart": { "type": "Chart", "props": { "type": "line", "data": [{"month": "Jan", "revenue": 3200}, {"month": "Feb", "revenue": 4100}, {"month": "Mar", "revenue": 3800}], "xKey": "month", "yKey": "revenue" } },
    "pie-card": {
      "type": "Card",
      "props": { "title": "Sales by Category" },
      "children": ["pie-chart"]
    },
    "pie-chart": { "type": "Chart", "props": { "type": "pie", "data": [{"label": "Electronics", "value": 42}, {"label": "Clothing", "value": 28}, {"label": "Books", "value": 30}] } },
    "data-table": {
      "type": "Card",
      "props": { "title": "Recent Orders" },
      "children": ["orders-table"]
    },
    "orders-table": { "type": "Table", "props": { "columns": [{"key": "id", "label": "Order"}, {"key": "customer", "label": "Customer"}, {"key": "amount", "label": "Amount"}, {"key": "status", "label": "Status"}], "rows": [{"id": "#1001", "customer": "Alice", "amount": "$120", "status": "Shipped"}, {"id": "#1002", "customer": "Bob", "amount": "$85", "status": "Pending"}] } }
  }
}
\`\`\`

### Form

For user input screens:

\`\`\`
Form(title) → Input fields → Select fields → Button(submit)
\`\`\`

\`\`\`ui_spec
{
  "root": "signup-form",
  "elements": {
    "signup-form": {
      "type": "Card",
      "props": { "title": "Create Account" },
      "children": ["form"]
    },
    "form": {
      "type": "Form",
      "props": { "title": "" },
      "children": ["name-row", "email", "password", "role", "submit"]
    },
    "name-row": {
      "type": "Row",
      "props": { "gap": "md" },
      "children": ["first-name", "last-name"]
    },
    "first-name": { "type": "Input", "props": { "label": "First Name", "placeholder": "Jane" } },
    "last-name": { "type": "Input", "props": { "label": "Last Name", "placeholder": "Doe" } },
    "email": { "type": "Input", "props": { "label": "Email", "type": "email", "placeholder": "jane@example.com" } },
    "password": { "type": "Input", "props": { "label": "Password", "type": "password", "placeholder": "At least 8 characters" } },
    "role": { "type": "Select", "props": { "label": "Role", "options": [{"value": "dev", "label": "Developer"}, {"value": "designer", "label": "Designer"}, {"value": "pm", "label": "Product Manager"}] } },
    "submit": { "type": "Button", "props": { "label": "Create Account", "variant": "primary", "action": "submit" } }
  }
}
\`\`\`

### Status Page

For displaying system status, project health, or operational overview:

\`\`\`
Heading → Alert → Grid(Card(Badge + Metric)) → Table
\`\`\`

\`\`\`ui_spec
{
  "root": "status",
  "elements": {
    "status": {
      "type": "Column",
      "props": { "gap": "md" },
      "children": ["title", "alert", "services-grid"]
    },
    "title": { "type": "Heading", "props": { "level": "2", "content": "System Status" } },
    "alert": { "type": "Alert", "props": { "variant": "success", "title": "All Systems Operational", "message": "All services are running normally. Last checked 2 minutes ago." } },
    "services-grid": {
      "type": "Grid",
      "props": { "columns": 3, "gap": "md" },
      "children": ["svc-api", "svc-db", "svc-cdn"]
    },
    "svc-api": {
      "type": "Card",
      "props": { "title": "API" },
      "children": ["api-badge", "api-metric"]
    },
    "api-badge": { "type": "Badge", "props": { "text": "Operational", "variant": "success" } },
    "api-metric": { "type": "Metric", "props": { "label": "Uptime", "value": "99.98%", "trend": "up" } },
    "svc-db": {
      "type": "Card",
      "props": { "title": "Database" },
      "children": ["db-badge", "db-metric"]
    },
    "db-badge": { "type": "Badge", "props": { "text": "Operational", "variant": "success" } },
    "db-metric": { "type": "Metric", "props": { "label": "Uptime", "value": "99.99%", "trend": "up" } },
    "svc-cdn": {
      "type": "Card",
      "props": { "title": "CDN" },
      "children": ["cdn-badge", "cdn-metric"]
    },
    "cdn-badge": { "type": "Badge", "props": { "text": "Degraded", "variant": "warning" } },
    "cdn-metric": { "type": "Metric", "props": { "label": "Uptime", "value": "98.5%", "change": "-1.2%", "trend": "down" } }
  }
}
\`\`\`

### Data Visualization

For presenting charts, tables, and data analysis:

\`\`\`
Column → Chart + Table combination
\`\`\`

### Content / Documentation

For structured text content, articles, or documentation-like layouts:

\`\`\`
Column → Heading → Paragraph → List → Divider → ...
\`\`\`

### Landing Page

For marketing or product pages — use ONLY when the user requests a landing page, website, or marketing page:

\`\`\`
Navbar → Hero → Section(Grid(Feature×3-6)) → Section(Testimonial grid) → Section(PricingCard grid) → Accordion → CTA → Footer
\`\`\`

Use \`Column\` as root, \`Section\` for each content block, \`Container\` inside to constrain width, and alternate \`background\` variants for visual contrast.

## Layout Guidance

- Use \`Box\` or \`Flex\` as low-level building blocks when Row/Column/Grid don't fit
- Use \`Flex\` with \`justify\`, \`items\`, and \`direction\` for precise layout control
- Use \`Card\` as the top-level wrapper for dashboard-style and data-focused UIs
- Use \`Column\` as the top-level wrapper for full-page layouts
- Use \`Row\` and \`Column\` for simple horizontal/vertical arrangements
- Use \`Grid\` for responsive multi-column layouts — single column on mobile, multi-column on desktop
- Use \`Container\` inside \`Section\` to constrain content width
- Use \`Spacer\` for consistent vertical rhythm between sections
- Use \`Heading\` and \`Paragraph\` for semantic text content (prefer over \`Text\` for headings)
- For landing pages: \`Section\` with different \`background\` variants creates visual contrast

## Design Best Practices

- **Match the UI to the intent** — a data question gets Metrics/Charts/Tables, a form request gets Form/Input/Select, a status display gets Cards/Badges/Alerts
- All components accept \`className\` for custom Tailwind CSS overrides when defaults aren't enough
- Chart data can be simple numbers [1,2,3] or objects [{label:"A", value:10}]
- Components automatically use the app's theme (dark/light mode)
- Use \`Box\` with \`className\` when you need a container with completely custom styling
- For landing pages specifically: alternate \`Section\` backgrounds, use \`Grid\` columns of 3 for features, use \`highlighted: true\` on one \`PricingCard\`

## When to Use

Use ui_spec whenever the response benefits from visual formatting over plain text. Match the component choice to the user's intent:

- **Data display**: Tables, Charts, Metrics — "show me the data", "visualize this", "compare these numbers"
- **Dashboards**: Card grids with Metrics, Charts, Tables — "show a dashboard", "overview of metrics"
- **Forms**: Form, Input, Select, Button — "build a form", "create a signup page", "user input"
- **Status / monitoring**: Cards, Badges, Alerts, Metrics — "show project status", "system health"
- **Content / documentation**: Heading, Paragraph, List, Code — "explain this", "show the steps"
- **Landing / marketing pages**: Navbar, Hero, Feature, PricingCard, Footer — "create a landing page", "product page"
- **General composition**: Box, Flex, Grid — custom layouts that don't fit standard patterns
- Prefer ui_spec over plain markdown tables when the data would benefit from visual formatting

## Tips

- **Do NOT default to landing page components** — only use Navbar/Hero/Footer/Feature/Testimonial/PricingCard/CTA when the user explicitly asks for a landing page, website, or marketing page
- For dashboards: start with Card or Column as root, use Grid for metric rows
- For forms: wrap fields in Form, use Row for side-by-side inputs
- For data: combine Chart + Table in a Grid for comprehensive views
- For status: pair Badge with Metric inside Card for each service/item
- For text content: use Heading + Paragraph + List for readable document-style output
- Use \`Box\` when you just need a styled wrapper with no layout opinion
- Use \`Flex\` when Row/Column constraints aren't enough (e.g. \`justify: "between"\`, \`wrap: true\`)
- Keep element keys descriptive and unique within the spec

Refer to the json-render-core and json-render-react skills for the full API reference including dynamic prop expressions, state management, actions, and event handling.`;
