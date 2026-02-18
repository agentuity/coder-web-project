import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react';
import { shadcnComponentDefinitions } from '@json-render/shadcn/catalog';
import { z } from 'zod';

const spacing = z.enum(['sm', 'md', 'lg']);
const align = z.enum(['start', 'center', 'end', 'stretch']);

export const catalog = defineCatalog(schema, {
  components: {
    /* ── shadcn components (from @json-render/shadcn) ─────────── */

    // Layout
    Card: shadcnComponentDefinitions.Card,
    Stack: shadcnComponentDefinitions.Stack,
    Grid: shadcnComponentDefinitions.Grid,
    Separator: shadcnComponentDefinitions.Separator,

    // Navigation
    Tabs: shadcnComponentDefinitions.Tabs,
    Accordion: shadcnComponentDefinitions.Accordion,
    Collapsible: shadcnComponentDefinitions.Collapsible,
    Pagination: shadcnComponentDefinitions.Pagination,

    // Overlay
    Dialog: shadcnComponentDefinitions.Dialog,
    Drawer: shadcnComponentDefinitions.Drawer,
    Tooltip: shadcnComponentDefinitions.Tooltip,
    Popover: shadcnComponentDefinitions.Popover,
    DropdownMenu: shadcnComponentDefinitions.DropdownMenu,

    // Content
    Heading: shadcnComponentDefinitions.Heading,
    Text: shadcnComponentDefinitions.Text,
    Image: shadcnComponentDefinitions.Image,
    Avatar: shadcnComponentDefinitions.Avatar,
    Badge: shadcnComponentDefinitions.Badge,
    Alert: shadcnComponentDefinitions.Alert,
    Carousel: shadcnComponentDefinitions.Carousel,
    Table: shadcnComponentDefinitions.Table,

    // Feedback
    Progress: shadcnComponentDefinitions.Progress,
    Skeleton: shadcnComponentDefinitions.Skeleton,
    Spinner: shadcnComponentDefinitions.Spinner,

    // Input
    Button: shadcnComponentDefinitions.Button,
    Link: shadcnComponentDefinitions.Link,
    Input: shadcnComponentDefinitions.Input,
    Textarea: shadcnComponentDefinitions.Textarea,
    Select: shadcnComponentDefinitions.Select,
    Checkbox: shadcnComponentDefinitions.Checkbox,
    Radio: shadcnComponentDefinitions.Radio,
    Switch: shadcnComponentDefinitions.Switch,
    Slider: shadcnComponentDefinitions.Slider,
    Toggle: shadcnComponentDefinitions.Toggle,
    ToggleGroup: shadcnComponentDefinitions.ToggleGroup,
    ButtonGroup: shadcnComponentDefinitions.ButtonGroup,

    /* ── Custom components (no shadcn equivalent) ─────────────── */

    Metric: {
      props: z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        change: z.string().optional(),
        trend: z.enum(['up', 'down', 'neutral']).optional(),
        className: z.string().optional(),
      }),
      description: 'Key metric',
    },
    Chart: {
      props: z.object({
        type: z.enum(['bar', 'line', 'pie']),
        data: z.array(z.union([z.number(), z.record(z.string(), z.unknown())])),
        xKey: z.string().optional(),
        yKey: z.string().optional(),
        className: z.string().optional(),
      }),
      description: 'Data chart',
    },
    Form: {
      props: z.object({
        title: z.string().optional(),
        className: z.string().optional(),
      }),
      slots: ['default'],
      description: 'Form container',
    },
    Row: {
      props: z.object({
        gap: spacing.optional(),
        align: align.optional(),
        className: z.string().optional(),
      }),
      slots: ['default'],
      description: 'Horizontal layout',
    },
    Column: {
      props: z.object({
        gap: spacing.optional(),
        align: align.optional(),
        className: z.string().optional(),
      }),
      slots: ['default'],
      description: 'Vertical layout',
    },
    Code: {
      props: z.object({
        language: z.string().optional(),
        content: z.string(),
        className: z.string().optional(),
      }),
      description: 'Code block',
    },

    /* ── Phase 2: Landing page components ────────────────────────── */

    Hero: {
      props: z.object({
        headline: z.string(),
        subheadline: z.string().optional(),
        backgroundImage: z.string().optional(),
        backgroundGradient: z.enum(['none', 'blue', 'purple', 'green', 'orange', 'dark']).optional(),
        align: z.enum(['left', 'center']).optional(),
        className: z.string().optional(),
      }),
      slots: ['default'],
      description: 'Primary landing page header section with headline, subheadline, and CTA slot',
    },
    Section: {
      props: z.object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        background: z.enum(['default', 'muted', 'primary', 'dark']).optional(),
        padding: z.enum(['sm', 'md', 'lg', 'xl']).optional(),
        className: z.string().optional(),
      }),
      slots: ['default'],
      description: 'Full-width content section with background and padding',
    },
    Container: {
      props: z.object({
        maxWidth: z.enum(['sm', 'md', 'lg', 'xl', 'full']).optional(),
        className: z.string().optional(),
      }),
      slots: ['default'],
      description: 'Max-width centered wrapper',
    },
    Navbar: {
      props: z.object({
        logo: z.string().optional(),
        logoSrc: z.string().optional(),
        links: z.array(z.object({ label: z.string(), href: z.string() })).optional(),
        ctaLabel: z.string().optional(),
        ctaHref: z.string().optional(),
        className: z.string().optional(),
      }),
      description: 'Site navigation header with logo, links, and optional CTA',
    },
    Footer: {
      props: z.object({
        logo: z.string().optional(),
        copyright: z.string().optional(),
        columns: z.array(z.object({
          title: z.string(),
          links: z.array(z.object({ label: z.string(), href: z.string() })),
        })).optional(),
        className: z.string().optional(),
      }),
      description: 'Multi-column footer with link columns and copyright',
    },
    Feature: {
      props: z.object({
        icon: z.string().optional(),
        title: z.string(),
        description: z.string().optional(),
        className: z.string().optional(),
      }),
      description: 'Icon + title + description block for feature grids',
    },
    Testimonial: {
      props: z.object({
        quote: z.string(),
        author: z.string(),
        role: z.string().optional(),
        avatarSrc: z.string().optional(),
        className: z.string().optional(),
      }),
      description: 'Social proof block with quote, author, and avatar',
    },
    PricingCard: {
      props: z.object({
        tier: z.string(),
        price: z.string(),
        description: z.string().optional(),
        features: z.array(z.string()),
        ctaLabel: z.string().optional(),
        highlighted: z.boolean().optional(),
        className: z.string().optional(),
      }),
      description: 'Pricing tier card with features list and CTA',
    },
    CTA: {
      props: z.object({
        headline: z.string(),
        description: z.string().optional(),
        className: z.string().optional(),
      }),
      slots: ['default'],
      description: 'Call-to-action banner with headline, description, and button slot',
    },
    Spacer: {
      props: z.object({
        size: z.enum(['sm', 'md', 'lg', 'xl']).optional(),
        className: z.string().optional(),
      }),
      description: 'Controlled vertical spacing',
    },

    /* ── Phase 3: Rich integrations ─────────────────────────────── */

    Map: {
      props: z.object({
        center: z.tuple([z.number(), z.number()]).optional(),
        zoom: z.number().optional(),
        markers: z.array(z.object({
          longitude: z.number(),
          latitude: z.number(),
          label: z.string().optional(),
          popup: z.string().optional(),
        })).optional(),
        route: z.array(z.tuple([z.number(), z.number()])).optional(),
        height: z.string().optional(),
        markersPath: z.string().optional(),
        labelPath: z.string().optional(),
        interactive: z.boolean().optional(),
        className: z.string().optional(),
      }),
      description: 'Interactive map with markers, popups, and routes (MapLibre, no API key needed). Use markersPath to read markers from state and interactive to allow click-to-add. Use labelPath to read marker label from state when adding interactively.',
    },
    AutoForm: {
      props: z.object({
        schema: z.record(z.string(), z.object({
          type: z.enum(['string', 'number', 'boolean', 'select']),
          label: z.string().optional(),
          description: z.string().optional(),
          required: z.boolean().optional(),
          placeholder: z.string().optional(),
          options: z.array(z.object({
            value: z.string(),
            label: z.string(),
          })).optional(),
          min: z.number().optional(),
          max: z.number().optional(),
          minLength: z.number().optional(),
          maxLength: z.number().optional(),
          default: z.union([z.string(), z.number(), z.boolean()]).optional(),
        })),
        title: z.string().optional(),
        submitLabel: z.string().optional(),
        className: z.string().optional(),
      }),
      description: 'Auto-generated form from a JSON field schema — describe fields and types, form is built automatically',
    },

    /* ── Primitive components ─────────────────────────────────────── */

    Box: {
      props: z.object({
        className: z.string().optional(),
      }),
      slots: ['default'],
      description: 'Generic container — use className for any Tailwind styling',
    },
    Flex: {
      props: z.object({
        direction: z.enum(['row', 'col', 'row-reverse', 'col-reverse']).optional(),
        wrap: z.boolean().optional(),
        justify: z.enum(['start', 'center', 'end', 'between', 'around', 'evenly']).optional(),
        items: z.enum(['start', 'center', 'end', 'stretch', 'baseline']).optional(),
        gap: z.enum(['sm', 'md', 'lg']).optional(),
        className: z.string().optional(),
      }),
      slots: ['default'],
      description: 'Flexbox layout container with full control over direction, alignment, and distribution',
    },
    Paragraph: {
      props: z.object({
        content: z.string(),
        className: z.string().optional(),
      }),
      description: 'Paragraph text block for body content',
    },
    List: {
      props: z.object({
        items: z.array(z.string()),
        ordered: z.boolean().optional(),
        className: z.string().optional(),
      }),
      description: 'Ordered or unordered list',
    },
    JSXPreview: {
      props: z.object({
        jsx: z.string(),
        title: z.string().optional(),
        className: z.string().optional(),
      }),
      description: 'Render JSX strings dynamically for AI-generated UI previews',
    },
    HtmlViewer: {
      props: z.object({
        html: z.string(),
        title: z.string().optional(),
        height: z.string().optional(),
        className: z.string().optional(),
      }),
      description: 'Sandboxed HTML viewer for rendering HTML content',
    },
    Mermaid: {
      props: z.object({
        code: z.string(),
        theme: z.enum(['light', 'dark']).optional(),
        className: z.string().optional(),
      }),
      description: 'Render Mermaid diagrams (flowcharts, sequence, state, class, ER) as SVG',
    },
  },
  actions: {
    navigate: {
      params: z.object({
        url: z.string(),
      }),
      description: 'Navigate to URL',
    },
    submit: {
      params: z.object({
        formId: z.string().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      }),
      description: 'Submit form data',
    },
    action: {
      params: z.object({
        name: z.string().optional(),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
      description: 'Generic action',
    },
  },
});
