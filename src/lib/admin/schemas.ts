import { contactFormSchema } from '@/lib/validations';
import { faqItems } from '@/data/faq';
import { pricingTiers } from '@/data/pricing';
import { portfolioProjects } from '@/data/projects';
import { isSafeProjectMediaUrl } from '@/lib/project-media';
import { z } from 'zod';
import {
  inquiryEmailStatuses,
  inquiryStatuses,
  type AdminContent,
} from './types';
export const tokenHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const timestampSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const revisionSchema = tokenHashSchema;
export const staffNameSchema = z.string().trim().min(1).max(100).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Use a name without control characters.');
export const staffEmailSchema = z.string().trim().toLowerCase().max(254).email();
export const passwordHashSchema = z.string().regex(/^scrypt:32768:8:[13]:[0-9a-f]{32}:[0-9a-f]{128}$/i);
export const staffCreateSchema = z.object({ name: staffNameSchema, email: staffEmailSchema, passwordHash: passwordHashSchema }).strict();
export const staffUpdateSchema = z.object({ name: staffNameSchema.optional(), email: staffEmailSchema.optional(), active: z.boolean().optional(), passwordHash: passwordHashSchema.optional() }).strict().refine((value) => Object.keys(value).length > 0, 'Choose at least one staff field to update.');
export const inquiryUpdateSchema = z.object({ status: z.enum(inquiryStatuses).optional(), notes: z.string().max(10000).optional() }).strict().refine((value) => Object.keys(value).length > 0, 'Choose an enquiry field to update.');
export const inquirySchema = contactFormSchema.extend({
  id: z.string().uuid(),
  businessName: z.string().max(200),
  status: z.enum(inquiryStatuses),
  notes: z.string().max(10000),
  emailStatus: z.enum(inquiryEmailStatuses),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export const privateStateSchema = z.object({
  version: z.literal(1),
  inquiries: z.array(inquirySchema).max(10000),
  sessions: z.array(z.object({
    tokenHash: tokenHashSchema,
    expiresAt: timestampSchema,
    createdAt: timestampSchema,
  }).strict()).max(16),
  loginAttempts: z.array(z.object({
    key: z.union([z.literal('global'), tokenHashSchema]),
    count: z.number().int().min(1).max(30),
    resetAt: timestampSchema,
  }).strict()).max(31),
}).strict().superRefine((state, context) => {
  for (const keys of [
    state.inquiries.map((item) => item.id),
    state.sessions.map((item) => item.tokenHash),
    state.loginAttempts.map((item) => item.key),
  ]) {
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', message: 'Admin storage contains duplicate records.' });
    }
  }
});
export type PrivateState = z.infer<typeof privateStateSchema>;
export function defaultPrivateState(): PrivateState {
  return { version: 1, inquiries: [], sessions: [], loginAttempts: [] };
}

const packageSchema = z.object({
  id: z.enum(['basic', 'business', 'premium']),
  name: z.string().trim().min(1).max(100),
  startPrice: z.number().int().min(0).max(1000000000),
  currency: z.literal('LKR'),
  description: z.string().trim().min(1).max(2000),
  audience: z.string().trim().min(1).max(500),
  features: z.array(z.string().trim().min(1).max(300)).min(1).max(30),
  cta: z.string().trim().min(1).max(100),
  popular: z.boolean().optional(),
  accent: z.enum(['default', 'popular', 'premium']).optional(),
}).strict();

const projectSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(150),
  category: z.enum(['Business Websites', 'E-Commerce', 'Web Applications', 'POS Systems']),
  overview: z.string().trim().min(1).max(3000),
  technologies: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  accent: z.enum([
    'from-orange-500 to-orange-200', 'from-orange-400 to-orange-100',
    'from-orange-600 to-orange-200', 'from-orange-500 to-orange-100',
    'from-orange-400 to-orange-200', 'from-orange-600 to-orange-100',
  ]),
  gradient: z.enum([
    'bg-gradient-to-br from-orange-100 via-orange-50 to-white',
    'bg-gradient-to-br from-white via-orange-50 to-orange-100',
    'bg-gradient-to-br from-orange-50 via-white to-orange-100',
  ]),
  demoUrl: z.string().trim().max(2048).refine(isSafeProjectMediaUrl, 'Use an http(s) URL or a path beginning with one /.').optional(),
  previewImageUrl: z.string().trim().max(2048).refine(isSafeProjectMediaUrl, 'Use an http(s) image URL or a path beginning with one /.').optional(),
}).strict();

export const contentSchemas = {
  packages: z.array(packageSchema).length(3).superRefine((items, context) => {
    if (new Set(items.map((item) => item.id)).size !== 3) {
      context.addIssue({ code: 'custom', message: 'Keep one basic, business, and premium package.' });
    }
    if (new Set(items.map((item) => item.name.toLowerCase())).size !== 3) {
      context.addIssue({ code: 'custom', message: 'Each package must have a distinct name.' });
    }
    if (items.filter((item) => item.popular).length > 1) {
      context.addIssue({ code: 'custom', message: 'Only one package can be marked popular.' });
    }
  }),
  projects: z.array(projectSchema).max(50).superRefine((items, context) => {
    if (new Set(items.map((item) => item.id)).size !== items.length) {
      context.addIssue({ code: 'custom', message: 'Each project must have a distinct ID.' });
    }
  }),
  faqs: z.array(z.object({
    question: z.string().trim().min(1).max(300),
    answer: z.string().trim().min(1).max(4000),
  }).strict()).max(50).superRefine((items, context) => {
    if (new Set(items.map((item) => item.question.toLowerCase())).size !== items.length) {
      context.addIssue({ code: 'custom', message: 'Each FAQ must have a distinct question.' });
    }
  }),
};

export const adminContentUpdateSchema = z.discriminatedUnion('section', [
  z.object({ section: z.literal('packages'), items: contentSchemas.packages }).strict(),
  z.object({ section: z.literal('projects'), items: contentSchemas.projects }).strict(),
  z.object({ section: z.literal('faqs'), items: contentSchemas.faqs }).strict(),
]);

export function defaultContent(): AdminContent {
  return structuredClone({ packages: pricingTiers, projects: portfolioProjects, faqs: faqItems });
}

export const validateContent = (value: unknown): AdminContent => z.object(contentSchemas).strict().parse(value);
