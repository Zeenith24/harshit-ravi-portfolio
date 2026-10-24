import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const categories = ['ml', 'design', 'data', 'marketing'] as const;

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    // text shown in the pixel window's title bar, e.g. "smart_mirror.py"
    window: z.string(),
    // key of a sprite defined in public/js/sprites.js
    sprite: z.string(),
    spriteLabel: z.string(),
    category: z.enum(categories),
    // highlighted tag, e.g. "98% accuracy"
    hot: z.string(),
    tags: z.array(z.string()).default([]),
    // live demo URL, shown as a "Live" button
    link: z.string().url().optional(),
    // repo URL; when set, the whole card links to it
    github: z.string().url().optional(),
    // design file URL; used as the card link when there is no repo
    figma: z.string().url().optional(),
    // wide cards span the full row (use for the featured project)
    wide: z.boolean().default(false),
    // lower numbers appear first
    order: z.number(),
    draft: z.boolean().default(false),
  }),
});

const experience = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/experience' }),
  schema: z.object({
    role: z.string(),
    company: z.string(),
    location: z.string().optional(),
    // free text shown above the role, e.g. "Jan 2026 – Mar 2026 · Remote"
    period: z.string(),
    // used only for sorting, newest first
    start: z.coerce.date(),
    type: z.enum(['internship', 'job', 'freelance', 'volunteer']).default('internship'),
    bullets: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects, experience };
