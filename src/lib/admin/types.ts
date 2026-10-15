import type { ContactFormValues } from '@/lib/validations';
import type { FAQItem } from '@/data/faq';
import type { PricingTier } from '@/data/pricing';
import type { Project } from '@/data/projects';

export const inquiryStatuses = ['new', 'in_progress', 'won', 'archived'] as const;
export type InquiryStatus = (typeof inquiryStatuses)[number];

export const inquiryEmailStatuses = ['pending', 'sent', 'failed', 'not_configured'] as const;
export type InquiryEmailStatus = (typeof inquiryEmailStatuses)[number];

export type AdminInquiry = ContactFormValues & {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: InquiryStatus;
  notes: string;
  emailStatus: InquiryEmailStatus;
};

export type InquiryUpdate = {
  status?: InquiryStatus;
  notes?: string;
};

export type AdminContent = {
  packages: PricingTier[];
  projects: Project[];
  faqs: FAQItem[];
};

export type AdminContentSection = keyof AdminContent;

export type DashboardRole = 'admin' | 'staff';
export type DashboardActor = { id: string; role: DashboardRole; email: string; name: string };
/** Internal authentication proof. Never pass this object to Client Components. */
export type ServerDashboardActor = DashboardActor & { credentialVersion: string };
/** Password hashes are only returned to the server authentication layer. */
export type DashboardAccount = DashboardActor & { passwordHash: string; active: boolean };
export type StaffAccount = {
  id: string; name: string; email: string; active: boolean; createdAt: number; updatedAt: number;
};
export type ContentRevisions = Record<AdminContentSection, string>;
export type ContentChangePayload = {
  [Section in AdminContentSection]: {
    section: Section; before: AdminContent[Section]; after: AdminContent[Section];
  }
}[AdminContentSection];
export type InquiryChangePayload = {
  id: string; changes: InquiryUpdate; before: AdminInquiry; after: AdminInquiry;
};
export type ChangeRequest = {
  id: string; actorStaffId: string; actorName: string; actorEmail: string;
  kind: 'content' | 'inquiry'; target: string; baseHash: string;
  status: 'pending' | 'approved' | 'rejected'; createdAt: number;
  reviewedAt: number | null; reviewedBy: string | null; reviewReason: string;
  payload: ContentChangePayload | InquiryChangePayload;
};
export type ChangeRequestSummary = Omit<ChangeRequest, 'payload'>;
