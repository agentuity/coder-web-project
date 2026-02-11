import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react';
import { z } from 'zod';

const spacing = z.enum(['sm', 'md', 'lg']);
const align = z.enum(['start', 'center', 'end', 'stretch']);

export const catalog = defineCatalog(schema, {
  components: {
    Card: {
      props: z.object({
        title: z.string(),
        description: z.string().optional(),
        padding: spacing.optional(),
      }),
      slots: ['default'],
      description: 'Container card for grouping content',
    },
    Text: {
      props: z.object({
        content: z.string(),
        variant: z.enum(['heading', 'subheading', 'body', 'caption']).optional(),
      }),
      description: 'Text display',
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(['primary', 'secondary', 'outline', 'ghost']).optional(),
        action: z.string().optional(),
      }),
      description: 'Clickable button',
    },
    Table: {
      props: z.object({
        columns: z.array(z.object({
          key: z.string(),
          label: z.string(),
        })),
        rows: z.array(z.record(z.string(), z.unknown())),
      }),
      description: 'Data table',
    },
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        change: z.string().optional(),
        trend: z.enum(['up', 'down', 'neutral']).optional(),
      }),
      description: 'Key metric',
    },
    Chart: {
      props: z.object({
        type: z.enum(['bar', 'line', 'pie']),
        data: z.array(z.union([z.number(), z.record(z.string(), z.unknown())])),
        xKey: z.string().optional(),
        yKey: z.string().optional(),
      }),
      description: 'Data chart',
    },
    Form: {
      props: z.object({
        title: z.string().optional(),
      }),
      slots: ['default'],
      description: 'Form container',
    },
    Input: {
      props: z.object({
        label: z.string(),
        placeholder: z.string().optional(),
        type: z.enum(['text', 'email', 'number', 'password']).optional(),
      }),
      description: 'Text input',
    },
    Select: {
      props: z.object({
        label: z.string(),
        options: z.array(z.object({
          value: z.string(),
          label: z.string(),
        })),
      }),
      description: 'Dropdown select',
    },
    Image: {
      props: z.object({
        src: z.string(),
        alt: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
      }),
      description: 'Image display',
    },
    Badge: {
      props: z.object({
        text: z.string(),
        variant: z.enum(['default', 'success', 'warning', 'error', 'info']).optional(),
      }),
      description: 'Status badge',
    },
    Alert: {
      props: z.object({
        message: z.string(),
        variant: z.enum(['info', 'success', 'warning', 'error']).optional(),
        title: z.string().optional(),
      }),
      description: 'Alert block',
    },
    Row: {
      props: z.object({
        gap: spacing.optional(),
        align: align.optional(),
      }),
      slots: ['default'],
      description: 'Horizontal layout',
    },
    Column: {
      props: z.object({
        gap: spacing.optional(),
        align: align.optional(),
      }),
      slots: ['default'],
      description: 'Vertical layout',
    },
    Stack: {
      props: z.object({
        gap: spacing.optional(),
        direction: z.enum(['horizontal', 'vertical']).optional(),
      }),
      slots: ['default'],
      description: 'Stacked layout',
    },
    Divider: {
      props: z.object({}),
      description: 'Visual separator',
    },
    Link: {
      props: z.object({
        href: z.string(),
        label: z.string(),
        external: z.boolean().optional(),
      }),
      description: 'Navigation link',
    },
    Code: {
      props: z.object({
        language: z.string().optional(),
        content: z.string(),
      }),
      description: 'Code block',
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
